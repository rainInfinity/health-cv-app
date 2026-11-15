/** 将扫描线取色与原逐像素偶奇规则对照，覆盖真实像素集合和颜色统计。 */
package com.healthcvapp.acquisition.rppg.roi

import com.healthcvapp.acquisition.rppg.face.FaceLandmarkerPoint
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.sin
import kotlin.random.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class RppgRoiScanlineTest {
  private val sampler = RppgRoiSampler()
  private val reference = RppgRoiPixelReference()

  @Test
  fun matchesEveryPixelForConvexConcaveClippedAndPixelCenterEdges() {
    val polygons = listOf(
      polygon(2f, 3f, 28f, 4f, 30f, 22f, 17f, 30f, 3f, 24f),
      polygon(1.5f, 1.5f, 29.5f, 1.5f, 29.5f, 29.5f, 22.5f, 29.5f,
        22.5f, 8.5f, 9.5f, 8.5f, 9.5f, 29.5f, 1.5f, 29.5f),
      polygon(0f, 0f, 32f, 0f, 32f, 32f, 0f, 32f),
      polygon(1.5f, 1.5f, 5.5f, 1.5f, 5.5f, 5.5f, 1.5f, 5.5f),
      polygon(0.5f, 0.5f, 31.5f, 31.5f, 0.5f, 31.5f),
      polygon(1.5f, 16.5f, 8.5f, 2.5f, 16.5f, 16.5f, 24.5f, 2.5f,
        30.5f, 16.5f, 30.5f, 29.5f, 1.5f, 29.5f),
      polygon(-3f, -2f, 35f, -2f, 35f, 34f, -3f, 34f),
      polygon(-5f, 5f, 9f, -4f, 35f, 8f, 26f, 35f, -2f, 27f),
      polygon(-4f, -4f, 36f, -4f, 36f, 36f, 23f, 36f, 23f, 9f,
        9f, 9f, 9f, 36f, -4f, 36f),
      polygon(2.5f, 2.5f, 16.5f, 2.5f, 16.5f, 2.5f, 30.5f, 2.5f,
        30.5f, 30.5f, 2.5f, 30.5f),
      polygon(1.4999999f, 1.5f, 5.5000005f, 1.5f, 5.5000005f, 5.5f, 1.4999999f, 5.5f),
      polygon(1.5000001f, 1.5f, 5.4999995f, 1.5f, 5.4999995f, 5.5f, 1.5000001f, 5.5f),
    )
    for (points in polygons) {
      assertMatchesReference(points)
      assertMatchesReference(points.reversed())
    }

    val sampled = mutableListOf<Int>()
    sampler.sample(recordingSource(sampled), 32, 32, polygons[3])
    assertEquals((1..4).flatMap { y -> (1..4).map { x -> y * 32 + x } }, sampled)
  }

  @Test
  fun matchesDeterministicVariedPolygonsWhileReusingLargerAndSmallerBuffers() {
    val random = Random(7819)
    repeat(180) { iteration ->
      val count = 3 + iteration % 28
      val points = (0 until count).map { index ->
        val angle = index * 2.0 * Math.PI / count
        val radius = 4.0 + random.nextDouble() * 20.0
        FaceLandmarkerPoint(
          ((16.0 + cos(angle) * radius) / 32.0).toFloat(),
          ((16.0 + sin(angle) * radius) / 32.0).toFloat(),
        )
      }
      assertMatchesReference(points)
      assertMatchesReference(points.take(3))
      assertMatchesReference(points, width = 13 + iteration % 37, height = 11 + iteration % 29)
    }
  }

  @Test
  fun preservesCoverageThresholdsAndInvalidOrEmptyResults() {
    val clipped = polygon(-1f, 0f, 32f, 0f, 32f, 32f, -1f, 32f)
    assertMatchesReference(clipped, minimumCoverage = 0.95)
    assertMatchesReference(clipped, minimumCoverage = 0.99)
    val invalid = listOf(
      emptyList(),
      polygon(1f, 1f, 2f, 2f),
      polygon(1f, 1f, 2f, 2f, 3f, 3f),
      polygon(33f, 33f, 35f, 33f, 35f, 35f, 33f, 35f),
      polygon(1.1f, 1.1f, 1.2f, 1.1f, 1.2f, 1.2f, 1.1f, 1.2f),
      listOf(FaceLandmarkerPoint(Float.NaN, 0f), FaceLandmarkerPoint(1f, 0f), FaceLandmarkerPoint(0f, 1f)),
      listOf(FaceLandmarkerPoint(0f, 0f), FaceLandmarkerPoint(Float.POSITIVE_INFINITY, 0f), FaceLandmarkerPoint(0f, 1f)),
    )
    for (points in invalid) assertMatchesReference(points)
    val source = recordingSource(mutableListOf())
    assertNull(sampler.sample(source, 0, 32, clipped))
    assertNull(sampler.sample(source, 32, -1, clipped))
    for (threshold in listOf(-0.1, 1.1, Double.NaN, Double.POSITIVE_INFINITY)) {
      assertThrows(IllegalArgumentException::class.java) {
        sampler.sample(source, 32, 32, clipped, threshold)
      }
    }
  }

  /** 对照访问顺序同时防止重复读取同一个像素。 */
  private fun assertMatchesReference(
    points: List<FaceLandmarkerPoint>,
    minimumCoverage: Double = 0.0,
    width: Int = 32,
    height: Int = 32,
  ) {
    val expectedPixels = mutableListOf<Int>()
    val actualPixels = mutableListOf<Int>()
    val expected = reference.sample(recordingSource(expectedPixels, width), width, height, points, minimumCoverage)
    val actual = sampler.sample(recordingSource(actualPixels, width), width, height, points, minimumCoverage)
    assertEquals("像素集合与读取顺序：$points", expectedPixels, actualPixels)
    assertEquals("RGB 均值、像素数与裁剪覆盖率：$points", expected, actual)
  }

  private fun recordingSource(visited: MutableList<Int>, width: Int = 32) = object : RppgArgbPixelSource {
    override fun argbAt(inputX: Int, inputY: Int): Int {
      visited += inputY * width + inputX
      return roiReferenceColor(inputX, inputY)
    }
  }

  private fun polygon(vararg coordinates: Float): List<FaceLandmarkerPoint> =
    coordinates.asList().chunked(2).map { FaceLandmarkerPoint(it[0] / 32f, it[1] / 32f) }
}

/** 以位置构造可辨识的 RGB，避免恒定颜色掩盖取错像素。 */
internal fun roiReferenceColor(x: Int, y: Int): Int =
  -0x1000000 or (((x * 17 + y * 3) and 255) shl 16) or
    (((x * 5 + y * 29) and 255) shl 8) or ((x * 31 + y * 7) and 255)

/** 保留修复前的逐像素偶奇数学判定；独立裁剪供回归和临时计时探针使用。 */
internal class RppgRoiPixelReference {
  private data class Point(val x: Double, val y: Double)

  fun sample(
    source: RppgArgbPixelSource,
    width: Int,
    height: Int,
    points: List<FaceLandmarkerPoint>,
    minimumCoverage: Double = 1.0,
  ): RppgRgbMean? {
    require(minimumCoverage.isFinite() && minimumCoverage in 0.0..1.0)
    if (points.size < 3 || width <= 0 || height <= 0) return null
    if (points.any { !it.x.isFinite() || !it.y.isFinite() }) return null
    var polygon = points.map { Point(it.x.toDouble() * width, it.y.toDouble() * height) }
    val originalArea = area(polygon)
    if (!originalArea.isFinite() || originalArea <= 1e-6) return null
    repeat(4) { boundary ->
      val output = mutableListOf<Point>()
      var previous = polygon.last()
      var previousInside = inside(previous, boundary, width, height)
      for (current in polygon) {
        val currentInside = inside(current, boundary, width, height)
        if (currentInside != previousInside) {
          output += intersection(previous, current, boundary, width, height)
        }
        if (currentInside) output += current
        previous = current
        previousInside = currentInside
      }
      if (output.size < 3) return null
      polygon = output
    }
    val clippedArea = area(polygon)
    if (!clippedArea.isFinite() || clippedArea <= 1e-6) return null
    val coverage = (clippedArea / originalArea).coerceIn(0.0, 1.0)
    if (coverage < minimumCoverage) return null
    val startX = floor(polygon.minOf { it.x }).toInt().coerceIn(0, width)
    val endX = ceil(polygon.maxOf { it.x }).toInt().coerceIn(0, width)
    val startY = floor(polygon.minOf { it.y }).toInt().coerceIn(0, height)
    val endY = ceil(polygon.maxOf { it.y }).toInt().coerceIn(0, height)
    var red = 0L
    var green = 0L
    var blue = 0L
    var count = 0
    for (y in startY until endY) {
      for (x in startX until endX) {
        if (!contains(x + 0.5, y + 0.5, polygon)) continue
        val argb = source.argbAt(x, y)
        red += (argb ushr 16) and 255
        green += (argb ushr 8) and 255
        blue += argb and 255
        count++
      }
    }
    if (count == 0) return null
    return RppgRgbMean(red.toDouble() / count, green.toDouble() / count, blue.toDouble() / count, count, coverage)
  }

  /** 与旧实现保持运算次序及严格小于比较，特别保留边界中心语义。 */
  private fun contains(x: Double, y: Double, polygon: List<Point>): Boolean {
    var contains = false
    var previous = polygon.last()
    for (current in polygon) {
      if ((current.y > y) != (previous.y > y)) {
        val crossingX = (previous.x - current.x) * (y - current.y) / (previous.y - current.y) + current.x
        if (x < crossingX) contains = !contains
      }
      previous = current
    }
    return contains
  }

  private fun area(polygon: List<Point>): Double {
    var doubledArea = 0.0
    var previous = polygon.last()
    for (current in polygon) {
      doubledArea += previous.x * current.y - current.x * previous.y
      previous = current
    }
    return kotlin.math.abs(doubledArea) * 0.5
  }

  private fun inside(point: Point, boundary: Int, width: Int, height: Int): Boolean = when (boundary) {
    0 -> point.x >= 0.0
    1 -> point.x <= width
    2 -> point.y >= 0.0
    else -> point.y <= height
  }

  private fun intersection(start: Point, end: Point, boundary: Int, width: Int, height: Int): Point =
    if (boundary < 2) {
      val x = if (boundary == 0) 0.0 else width.toDouble()
      val fraction = (x - start.x) / (end.x - start.x)
      Point(x, start.y + fraction * (end.y - start.y))
    } else {
      val y = if (boundary == 2) 0.0 else height.toDouble()
      val fraction = (y - start.y) / (end.y - start.y)
      Point(start.x + fraction * (end.x - start.x), y)
    }
}
