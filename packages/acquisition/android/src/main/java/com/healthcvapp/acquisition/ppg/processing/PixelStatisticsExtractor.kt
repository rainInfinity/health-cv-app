/** 共享计算全帧与二维分块的原始 Y/U/V 均值。 */

package com.healthcvapp.acquisition.ppg.processing

import com.healthcvapp.acquisition.ppg.model.CameraBlockLayout
import com.healthcvapp.acquisition.ppg.pixels.PixelBlockGeometry
import com.healthcvapp.acquisition.pixels.PixelCropRect
import com.healthcvapp.acquisition.pixels.PixelFrameView
import com.healthcvapp.acquisition.pixels.PixelReader

/** 保存有效像素区域的全帧 Y/U/V 均值与真实样本数。 */
data class PixelStatistics(
  /** 有效 Y 样本的均值，范围为 0–255。 */
  val avgY: Double,
  /** 有效 U 色度样本的均值，范围为 0–255。 */
  val avgU: Double,
  /** 有效 V 色度样本的均值，范围为 0–255。 */
  val avgV: Double,
  /** 实际纳入 Y 均值的像素数。 */
  val ySampleCount: Long,
  /** 实际纳入 U 均值的 4:2:0 色度样本数。 */
  val uSampleCount: Long,
  /** 实际纳入 V 均值的 4:2:0 色度样本数。 */
  val vSampleCount: Long,
)

/** 保存整帧共享统计与可选的紧凑分块均值数组。 */
internal data class PixelFrameStatistics(
  /** 不随网格配置改变的全帧统计。 */
  val fullFrame: PixelStatistics,
  /** 正式采集请求的分块均值；预览期间为空。 */
  val blocks: PixelBlockStatistics?,
)

/** 保存按块行优先编号的 Y/U/V 均值三元组。 */
internal class PixelBlockStatistics(
  /** 当前统计的行数。 */
  val rows: Int,
  /** 当前统计的列数。 */
  val columns: Int,
  /** 每块连续保存 Y、U、V 均值；数组由当前帧记录接管。 */
  val averagesYuv: DoubleArray,
) {
  /** 当前帧统计的块数。 */
  val blockCount: Int = rows * columns

  init {
    require(averagesYuv.size == blockCount * CHANNELS_PER_BLOCK)
  }

  /** 返回指定行优先块的亮度均值。 */
  fun averageY(blockIndex: Int): Double = averagesYuv[offset(blockIndex)]

  /** 返回指定行优先块的 U 色度均值。 */
  fun averageU(blockIndex: Int): Double = averagesYuv[offset(blockIndex) + 1]

  /** 返回指定行优先块的 V 色度均值。 */
  fun averageV(blockIndex: Int): Double = averagesYuv[offset(blockIndex) + 2]

  /** 校验行优先块索引并换算至三元组首项。 */
  private fun offset(blockIndex: Int): Int {
    require(blockIndex in 0 until blockCount)
    return blockIndex * CHANNELS_PER_BLOCK
  }

  private companion object {
    const val CHANNELS_PER_BLOCK = 3
  }
}

/** 在单次亮度扫描和一次色度扫描中共享计算全帧与各块统计。 */
class PixelStatisticsExtractor {
  private var cachedCrop: PixelCropRect? = null
  private var cachedLayout: CameraBlockLayout? = null
  private var cachedGeometry: PixelBlockGeometry? = null
  private var blockYSums = LongArray(0)
  private var blockUSums = LongArray(0)
  private var blockVSums = LongArray(0)
  private var blockYCounts = LongArray(0)
  private var blockChromaCounts = LongArray(0)

  /** 仅计算全帧统计，供预览经验提示继续使用。 */
  fun extract(frame: PixelFrameView): PixelStatistics = extractFrame(frame, null).fullFrame

  /** 根据实际 crop、plane stride 与请求网格计算全帧及分块统计。 */
  @Synchronized
  internal fun extractFrame(frame: PixelFrameView, blockLayout: CameraBlockLayout?): PixelFrameStatistics {
    val crop = frame.cropRect
    val geometry = blockLayout?.let { geometryFor(crop, it) }
    val blockCount = geometry?.blockCount ?: 0
    if (blockCount > 0) ensureAccumulatorCapacity(blockCount)

    val reader = PixelReader(frame)
    var fullYSum = 0L
    var fullYCount = 0L
    for (y in crop.top until crop.bottom) {
      for (x in crop.left until crop.right) {
        val value = reader.readY(x, y)
        fullYSum += value
        fullYCount += 1L
        if (geometry != null) {
          val blockIndex = geometry.blockIndexAt(x, y)
          blockYSums[blockIndex] += value.toLong()
          blockYCounts[blockIndex] += 1L
        }
      }
    }

    var fullUSum = 0L
    var fullVSum = 0L
    var fullChromaCount = 0L
    val firstChromaColumn = crop.left / 2
    val afterLastChromaColumn = crop.right / 2 + crop.right % 2
    val firstChromaRow = crop.top / 2
    val afterLastChromaRow = crop.bottom / 2 + crop.bottom % 2
    for (chromaY in firstChromaRow until afterLastChromaRow) {
      val cellTop = chromaY.toLong() * 2L
      val firstY = maxOf(crop.top.toLong(), cellTop).toInt()
      val afterLastY = minOf(crop.bottom.toLong(), cellTop + 2L).toInt()
      for (chromaX in firstChromaColumn until afterLastChromaColumn) {
        val cellLeft = chromaX.toLong() * 2L
        val firstX = maxOf(crop.left.toLong(), cellLeft).toInt()
        val afterLastX = minOf(crop.right.toLong(), cellLeft + 2L).toInt()
        val u = reader.readU(firstX, firstY)
        val v = reader.readV(firstX, firstY)
        fullUSum += u.toLong()
        fullVSum += v.toLong()
        fullChromaCount += 1L

        if (geometry != null) {
          val firstBlockRow = geometry.rowAt(firstY)
          val lastBlockRow = geometry.rowAt(afterLastY - 1)
          val firstBlockColumn = geometry.columnAt(firstX)
          val lastBlockColumn = geometry.columnAt(afterLastX - 1)
          var blockRow = firstBlockRow
          while (blockRow <= lastBlockRow) {
            var blockColumn = firstBlockColumn
            while (blockColumn <= lastBlockColumn) {
              val blockIndex = blockRow * geometry.columns + blockColumn
              blockUSums[blockIndex] += u.toLong()
              blockVSums[blockIndex] += v.toLong()
              blockChromaCounts[blockIndex] += 1L
              blockColumn += 1
            }
            blockRow += 1
          }
        }
      }
    }

    check(fullYCount > 0L && fullChromaCount > 0L) { "valid frame crop produced no YUV samples" }
    val fullFrame = PixelStatistics(
      avgY = fullYSum.toDouble() / fullYCount,
      avgU = fullUSum.toDouble() / fullChromaCount,
      avgV = fullVSum.toDouble() / fullChromaCount,
      ySampleCount = fullYCount,
      uSampleCount = fullChromaCount,
      vSampleCount = fullChromaCount,
    )
    return PixelFrameStatistics(
      fullFrame = fullFrame,
      blocks = geometry?.let { createBlockStatistics(it) },
    )
  }

  /** 复用与有效 crop 和行列配置对应的几何映射。 */
  private fun geometryFor(crop: PixelCropRect, layout: CameraBlockLayout): PixelBlockGeometry {
    if (cachedCrop == crop && cachedLayout == layout) return checkNotNull(cachedGeometry)
    return PixelBlockGeometry.create(crop, layout).also {
      cachedCrop = crop
      cachedLayout = layout
      cachedGeometry = it
    }
  }

  /** 按需扩充并清零串行分析器复用的块累加缓冲。 */
  private fun ensureAccumulatorCapacity(blockCount: Int) {
    if (blockYSums.size < blockCount) {
      blockYSums = LongArray(blockCount)
      blockUSums = LongArray(blockCount)
      blockVSums = LongArray(blockCount)
      blockYCounts = LongArray(blockCount)
      blockChromaCounts = LongArray(blockCount)
    } else {
      blockYSums.fill(0L, 0, blockCount)
      blockUSums.fill(0L, 0, blockCount)
      blockVSums.fill(0L, 0, blockCount)
      blockYCounts.fill(0L, 0, blockCount)
      blockChromaCounts.fill(0L, 0, blockCount)
    }
  }

  /** 为当前帧分配一个由后续 PPG 记录持有的均值三元组数组。 */
  private fun createBlockStatistics(geometry: PixelBlockGeometry): PixelBlockStatistics {
    val averages = DoubleArray(geometry.blockCount * 3)
    for (blockIndex in 0 until geometry.blockCount) {
      val yCount = blockYCounts[blockIndex]
      val chromaCount = blockChromaCounts[blockIndex]
      check(yCount > 0L && chromaCount > 0L) { "effective crop produced an empty image block" }
      val offset = blockIndex * 3
      averages[offset] = blockYSums[blockIndex].toDouble() / yCount
      averages[offset + 1] = blockUSums[blockIndex].toDouble() / chromaCount
      averages[offset + 2] = blockVSums[blockIndex].toDouble() / chromaCount
    }
    return PixelBlockStatistics(geometry.rows, geometry.columns, averages)
  }
}
