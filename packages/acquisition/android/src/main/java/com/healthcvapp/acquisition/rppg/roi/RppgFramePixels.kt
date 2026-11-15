/** 在借用帧有效期内提供模型同帧 RGB 区域采样。 */
package com.healthcvapp.acquisition.rppg.roi

import com.healthcvapp.acquisition.pixels.PixelFrameView
import com.healthcvapp.acquisition.pixels.PixelReader
import com.healthcvapp.acquisition.rppg.face.FaceLandmarkerInputGeometry
import com.healthcvapp.acquisition.rppg.face.FaceLandmarkerPoint
import com.healthcvapp.acquisition.rppg.face.RppgYuvColorConverter
import com.healthcvapp.acquisition.rppg.face.RppgYuvFrameBuffer
import kotlin.math.ceil
import kotlin.math.floor

/** 多边形内有效 RGB 像素的通道均值和样本数。 */
internal data class RppgRgbMean(
  val red: Double,
  val green: Double,
  val blue: Double,
  val pixelCount: Int,
  val coverageFraction: Double,
)

/** 为 ROI 采样器按模型输入坐标读取 ARGB 像素。 */
internal interface RppgArgbPixelSource {
  /** 返回指定模型输入像素对应的 ARGB 颜色。 */
  fun argbAt(inputX: Int, inputY: Int): Int
}

/** 仅在同步模型推理和结果消费期间有效的同帧颜色视图。 */
internal class RppgFramePixels internal constructor(
  private val sourceFrame: PixelFrameView,
  private val argbPixels: IntArray?,
  val geometry: FaceLandmarkerInputGeometry,
  private val sampler: RppgRoiSampler,
  private val yuvBuffer: RppgYuvFrameBuffer? = null,
) : RppgArgbPixelSource {
  private val pixelReader = if (argbPixels == null && yuvBuffer == null) PixelReader(sourceFrame) else null
  private var active = true

  init {
    require(
      argbPixels == null ||
        argbPixels.size.toLong() >= geometry.inputWidth.toLong() * geometry.inputHeight,
    ) { "ARGB input buffer is too small" }
  }

  internal constructor(
    sourceFrame: PixelFrameView,
    geometry: FaceLandmarkerInputGeometry,
    sampler: RppgRoiSampler,
    yuvBuffer: RppgYuvFrameBuffer? = null,
  ) : this(sourceFrame, null, geometry, sampler, yuvBuffer)

  /** 在模型输入图像的归一化坐标系内提取多边形区域的 RGB 均值。 */
  fun samplePolygon(
    points: List<FaceLandmarkerPoint>,
    minimumCoverageFraction: Double = 1.0,
  ): RppgRgbMean? {
    check(active) { "converted frame is no longer valid" }
    sourceFrame.checkActive()
    return sampler.sample(
      this,
      geometry.inputWidth,
      geometry.inputHeight,
      points,
      minimumCoverageFraction,
    )
  }

  /** 从既有 ARGB 缓冲或同帧原分辨率 YUV 读取同一几何位置的颜色。 */
  override fun argbAt(inputX: Int, inputY: Int): Int {
    check(active) { "converted frame is no longer valid" }
    val pixels = argbPixels
    if (pixels != null) {
      sourceFrame.checkActive()
      return pixels[inputY * geometry.inputWidth + inputX]
    }
    val sourceX = geometry.sourcePixelX(inputX, inputY)
    val sourceY = geometry.sourcePixelY(inputX, inputY)
    val copiedYuv = yuvBuffer
    if (copiedYuv != null) return copiedYuv.argbAt(sourceFrame, sourceX, sourceY)
    val reader = checkNotNull(pixelReader)
    return RppgYuvColorConverter.toArgb(
      reader.readY(sourceX, sourceY),
      reader.readU(sourceX, sourceY),
      reader.readV(sourceX, sourceY),
    )
  }

  /** 结束同步结果消费作用域，阻止后续访问借用帧或复用像素缓冲区。 */
  internal fun expire() {
    active = false
  }
}

/** 复用多边形坐标暂存区，按有效像素中心计算区域均值。 */
internal class RppgRoiSampler {
  private var polygonX = DoubleArray(0)
  private var polygonY = DoubleArray(0)
  private var clippedX = DoubleArray(0)
  private var clippedY = DoubleArray(0)
  private var scanlineCrossings = DoubleArray(0)

  /** 按归一化输入坐标采样；覆盖率不足、无效或无像素的多边形返回 null。 */
  fun sample(
    pixelSource: RppgArgbPixelSource,
    width: Int,
    height: Int,
    points: List<FaceLandmarkerPoint>,
    minimumCoverageFraction: Double = 1.0,
  ): RppgRgbMean? {
    require(minimumCoverageFraction.isFinite() && minimumCoverageFraction in 0.0..1.0) {
      "minimum coverage must be in [0, 1]"
    }
    if (points.size < 3 || width <= 0 || height <= 0) return null
    ensurePolygonCapacity(points.size)

    for (index in points.indices) {
      val point = points[index]
      if (!point.x.isFinite() || !point.y.isFinite()) return null
      polygonX[index] = point.x.toDouble() * width
      polygonY[index] = point.y.toDouble() * height
    }
    val polygonArea = area(polygonX, polygonY, points.size)
    if (!polygonArea.isFinite() || polygonArea <= MIN_POLYGON_AREA) return null

    var inputX = polygonX
    var inputY = polygonY
    var outputX = clippedX
    var outputY = clippedY
    var clippedCount = points.size
    for (boundary in LEFT..BOTTOM) {
      clippedCount = clipToBoundary(
        inputX,
        inputY,
        clippedCount,
        outputX,
        outputY,
        boundary,
        width.toDouble(),
        height.toDouble(),
      )
      if (clippedCount < 3) return null
      val previousX = inputX
      val previousY = inputY
      inputX = outputX
      inputY = outputY
      outputX = previousX
      outputY = previousY
    }

    val clippedArea = area(inputX, inputY, clippedCount)
    if (!clippedArea.isFinite() || clippedArea <= MIN_POLYGON_AREA) return null
    val coverageFraction = (clippedArea / polygonArea).coerceIn(0.0, 1.0)
    if (coverageFraction < minimumCoverageFraction) return null

    var minX = Double.POSITIVE_INFINITY
    var minY = Double.POSITIVE_INFINITY
    var maxX = Double.NEGATIVE_INFINITY
    var maxY = Double.NEGATIVE_INFINITY
    for (index in 0 until clippedCount) {
      minX = minOf(minX, inputX[index])
      minY = minOf(minY, inputY[index])
      maxX = maxOf(maxX, inputX[index])
      maxY = maxOf(maxY, inputY[index])
    }
    val firstX = floor(minX).toInt().coerceIn(0, width)
    val firstY = floor(minY).toInt().coerceIn(0, height)
    val endX = ceil(maxX).toInt().coerceIn(0, width)
    val endY = ceil(maxY).toInt().coerceIn(0, height)
    var redSum = 0L
    var greenSum = 0L
    var blueSum = 0L
    var sampledPixels = 0
    for (y in firstY until endY) {
      val centerY = y + 0.5
      val crossingCount = collectScanlineCrossings(centerY, inputX, inputY, clippedCount)
      sortScanlineCrossings(crossingCount)
      var crossingIndex = 0
      while (crossingIndex + 1 < crossingCount) {
        val spanStart = firstPixelAtOrAfter(scanlineCrossings[crossingIndex], firstX, endX)
        val spanEnd = firstPixelAtOrAfter(scanlineCrossings[crossingIndex + 1], firstX, endX)
        for (x in spanStart until spanEnd) {
          val argb = pixelSource.argbAt(x, y)
          redSum += (argb ushr 16) and 0xFF
          greenSum += (argb ushr 8) and 0xFF
          blueSum += argb and 0xFF
          sampledPixels++
        }
        crossingIndex += 2
      }
    }
    if (sampledPixels == 0) return null
    return RppgRgbMean(
      red = redSum.toDouble() / sampledPixels,
      green = greenSum.toDouble() / sampledPixels,
      blue = blueSum.toDouble() / sampledPixels,
      pixelCount = sampledPixels,
      coverageFraction = coverageFraction,
    )
  }

  /** 每行只求一次交点，沿用逐像素参考算法对顶点与水平边的半开判定。 */
  private fun collectScanlineCrossings(
    y: Double,
    polygonX: DoubleArray,
    polygonY: DoubleArray,
    pointCount: Int,
  ): Int {
    var crossingCount = 0
    var previous = pointCount - 1
    for (index in 0 until pointCount) {
      val currentX = polygonX[index]
      val currentY = polygonY[index]
      val previousX = polygonX[previous]
      val previousY = polygonY[previous]
      if ((currentY > y) != (previousY > y)) {
        scanlineCrossings[crossingCount++] =
          (previousX - currentX) * (y - currentY) / (previousY - currentY) + currentX
      }
      previous = index
    }
    return crossingCount
  }

  /** ROI 交点数量有限，原地插入排序避免每行创建排序工作区。 */
  private fun sortScanlineCrossings(count: Int) {
    for (index in 1 until count) {
      val crossing = scanlineCrossings[index]
      var insertion = index
      while (insertion > 0 && scanlineCrossings[insertion - 1] > crossing) {
        scanlineCrossings[insertion] = scanlineCrossings[insertion - 1]
        insertion--
      }
      scanlineCrossings[insertion] = crossing
    }
  }

  /** 返回中心不小于交点的首个像素，避免减去半像素引入边界舍入差异。 */
  private fun firstPixelAtOrAfter(crossingX: Double, firstX: Int, endX: Int): Int {
    val pixel = floor(crossingX).toInt().coerceIn(firstX, endX)
    return if (pixel < endX && pixel + 0.5 < crossingX) pixel + 1 else pixel
  }

  private fun clipToBoundary(
    inputX: DoubleArray,
    inputY: DoubleArray,
    inputCount: Int,
    outputX: DoubleArray,
    outputY: DoubleArray,
    boundary: Int,
    width: Double,
    height: Double,
  ): Int {
    if (inputCount == 0) return 0
    var outputCount = 0
    var previousX = inputX[inputCount - 1]
    var previousY = inputY[inputCount - 1]
    var previousInside = isInside(previousX, previousY, boundary, width, height)
    for (index in 0 until inputCount) {
      val currentX = inputX[index]
      val currentY = inputY[index]
      val currentInside = isInside(currentX, currentY, boundary, width, height)
      if (currentInside) {
        if (!previousInside) {
          outputCount = appendIntersection(
            outputX,
            outputY,
            outputCount,
            previousX,
            previousY,
            currentX,
            currentY,
            boundary,
            width,
            height,
          )
        }
        outputX[outputCount] = currentX
        outputY[outputCount] = currentY
        outputCount++
      } else if (previousInside) {
        outputCount = appendIntersection(
          outputX,
          outputY,
          outputCount,
          previousX,
          previousY,
          currentX,
          currentY,
          boundary,
          width,
          height,
        )
      }
      previousX = currentX
      previousY = currentY
      previousInside = currentInside
    }
    return outputCount
  }

  private fun appendIntersection(
    outputX: DoubleArray,
    outputY: DoubleArray,
    outputIndex: Int,
    startX: Double,
    startY: Double,
    endX: Double,
    endY: Double,
    boundary: Int,
    width: Double,
    height: Double,
  ): Int {
    val fraction: Double
    when (boundary) {
      LEFT, RIGHT -> {
        val x = if (boundary == LEFT) 0.0 else width
        fraction = (x - startX) / (endX - startX)
        outputX[outputIndex] = x
        outputY[outputIndex] = startY + fraction * (endY - startY)
      }
      else -> {
        val y = if (boundary == TOP) 0.0 else height
        fraction = (y - startY) / (endY - startY)
        outputX[outputIndex] = startX + fraction * (endX - startX)
        outputY[outputIndex] = y
      }
    }
    return outputIndex + 1
  }

  private fun isInside(x: Double, y: Double, boundary: Int, width: Double, height: Double): Boolean =
    when (boundary) {
      LEFT -> x >= 0.0
      RIGHT -> x <= width
      TOP -> y >= 0.0
      else -> y <= height
    }

  private fun area(polygonX: DoubleArray, polygonY: DoubleArray, pointCount: Int): Double {
    var doubledArea = 0.0
    var previous = pointCount - 1
    for (index in 0 until pointCount) {
      doubledArea += polygonX[previous] * polygonY[index] - polygonX[index] * polygonY[previous]
      previous = index
    }
    return kotlin.math.abs(doubledArea) * 0.5
  }

  private fun ensurePolygonCapacity(size: Int) {
    val capacity = size * 2 + 8
    if (polygonX.size < capacity) {
      polygonX = DoubleArray(capacity)
      polygonY = DoubleArray(capacity)
      clippedX = DoubleArray(capacity)
      clippedY = DoubleArray(capacity)
      scanlineCrossings = DoubleArray(capacity)
    }
  }

  private companion object {
    const val LEFT = 0
    const val RIGHT = 1
    const val TOP = 2
    const val BOTTOM = 3
    const val MIN_POLYGON_AREA = 1e-6
  }
}
