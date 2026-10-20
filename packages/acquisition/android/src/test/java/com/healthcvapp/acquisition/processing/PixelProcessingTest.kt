/** 验证帧统计、记录时间语义、提示边界与统一释放行为。 */

package com.healthcvapp.acquisition.processing

import com.healthcvapp.acquisition.pixels.PixelCropRect
import com.healthcvapp.acquisition.pixels.PixelFrameView
import com.healthcvapp.acquisition.pixels.PixelPlane
import com.healthcvapp.acquisition.pixels.PixelReader
import java.nio.ByteBuffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class PixelProcessingTest {
  @Test
  fun statisticsRespectPaddedRowsCropOffsetAndUniqueChromaSamples() {
    val y = ByteBuffer.allocate(16)
    val yValues = intArrayOf(1, 2, 3, 4, 5, 6, 7, 8, 9)
    for (row in 0 until 3) {
      for (column in 0 until 3) y.put(1 + row * 5 + column, yValues[row * 3 + column].toByte())
    }
    val u = ByteBuffer.wrap(byteArrayOf(10.toByte(), 20.toByte(), 30.toByte(), 40.toByte()))
    val v = ByteBuffer.wrap(byteArrayOf(100.toByte(), 110.toByte(), 120.toByte(), 130.toByte()))
    val frame = frame(
      width = 3,
      height = 3,
      crop = PixelCropRect(left = 1, top = 1, right = 3, bottom = 3),
      yPlane = PixelPlane(y, 1, 3, 3, 5, 1),
      uPlane = PixelPlane(u, 0, 2, 2, 2, 1),
      vPlane = PixelPlane(v, 0, 2, 2, 2, 1),
    )

    val stats = PixelStatisticsExtractor().extract(frame)

    assertEquals(7.0, stats.avgY, 0.0)
    assertEquals(25.0, stats.avgU, 0.0)
    assertEquals(115.0, stats.avgV, 0.0)
    assertEquals(4L, stats.ySampleCount)
    assertEquals(4L, stats.uSampleCount)
    assertEquals(4L, stats.vSampleCount)
  }

  @Test
  fun framePipelineKeepsCompletePixelsBorrowedUntilSynchronousProcessorsFinish() {
    val frame = frame()
    var releaseCount = 0
    var retainedReader: PixelReader? = null
    var processedPixel = 0
    val pipeline = FramePipeline(
      statisticsExtractor = PixelStatisticsExtractor(),
      processors = listOf(PixelProcessor { currentFrame, _ ->
        retainedReader = PixelReader(currentFrame)
        processedPixel = retainedReader!!.readY(1, 1)
      }),
    )

    pipeline.process(frame, { releaseCount += 1 }) { currentFrame, _ ->
      assertEquals(8, PixelReader(currentFrame).readY(1, 1))
    }

    assertEquals(8, processedPixel)
    assertEquals(1, releaseCount)
    assertThrows(IllegalStateException::class.java) { retainedReader!!.readY(1, 1) }
  }

  @Test
  fun framePipelineExpiresBorrowAndReleasesOnceWhenProcessorFails() {
    val frame = frame()
    var releaseCount = 0
    var retainedReader: PixelReader? = null
    val failure = IllegalArgumentException("processor failed")
    val pipeline = FramePipeline(
      statisticsExtractor = PixelStatisticsExtractor(),
      processors = listOf(PixelProcessor { currentFrame, _ ->
        retainedReader = PixelReader(currentFrame)
        throw failure
      }),
    )

    val observed = assertThrows(IllegalArgumentException::class.java) {
      pipeline.process(frame, { releaseCount += 1 }) { _, _ -> error("must not run after processor failure") }
    }

    assertEquals(failure, observed)
    assertEquals(1, releaseCount)
    assertThrows(IllegalStateException::class.java) { retainedReader!!.readY(0, 0) }
  }

  @Test
  fun ppgRecordUsesMillisecondFractionsAndOneWholeFrameBlock() {
    val frame = frame(
      timestampFrameNanos = 2_500_000,
      processingElapsedNanos = 1_500_000,
      timestampSystemNanos = 3_500_000,
      frameIndex = 18,
    )
    val stats = PixelStatistics(12.5, 128.25, 127.75, 4, 1, 1)

    val record = PpgRecordProcessor().process(frame, stats)

    assertEquals(1.5, record.timestamp, 0.0)
    assertEquals(2.5, record.timestampFrame, 0.0)
    assertEquals(3.5, record.timestampSystem, 0.0)
    assertEquals(12.5, record.avgY, 0.0)
    assertEquals(128.25, record.avgU, 0.0)
    assertEquals(127.75, record.avgV, 0.0)
    assertEquals(18L, record.frameIndex)
    assertEquals(0, record.blockIndex)
  }

  @Test
  fun coverageHintsRespectBrightnessAndColorRatioThresholdsAndMergeLatestState() {
    val changes = mutableListOf<CoverageHint>()
    val processor = CoverageHintProcessor(changes::add)
    assertNull(processor.current.showSurroundingTip)
    assertNull(processor.current.showCoveringTip)
    processor.update(null)
    assertTrue(changes.isEmpty())

    val dark = statistics(avgY = 24.999, avgU = 128.0, avgV = 128.0)
    val bright = statistics(avgY = 25.0, avgU = 128.0, avgV = 128.0)
    assertTrue(processor.update(dark).showSurroundingTip!!)
    assertFalse(processor.update(bright).showSurroundingTip!!)
    assertEquals(2, changes.size)
    processor.update(bright)
    assertEquals(2, changes.size)

    val lowRedDominant = statistics(avgY = 26.687, avgU = 121.704, avgV = 155.5)
    assertFalse(processor.update(lowRedDominant).showCoveringTip!!)
    val colorRatioAtLimit = statistics(
      avgY = 28.503732353416055,
      avgU = 123.4172599949256,
      avgV = 148.0001699559207,
    )
    assertTrue(processor.update(colorRatioAtLimit).showCoveringTip!!)

    val colorRatiosBelowLimit = statistics(
      avgY = 28.500110152681117,
      avgU = 123.4138229399218,
      avgV = 148.01517008338766,
    )
    assertFalse(processor.update(colorRatiosBelowLimit).showCoveringTip!!)

    val nonPositiveRgbSum = statistics(avgY = 0.0, avgU = 0.0, avgV = 0.0)
    assertTrue(processor.update(nonPositiveRgbSum).showCoveringTip!!)
  }

  private fun statistics(avgY: Double, avgU: Double, avgV: Double) = PixelStatistics(
    avgY = avgY,
    avgU = avgU,
    avgV = avgV,
    ySampleCount = 1,
    uSampleCount = 1,
    vSampleCount = 1,
  )

  private fun frame(
    width: Int = 2,
    height: Int = 2,
    crop: PixelCropRect = PixelCropRect(0, 0, width, height),
    timestampFrameNanos: Long = 2_000_000,
    processingElapsedNanos: Long = 1_000_000,
    timestampSystemNanos: Long = 3_000_000,
    frameIndex: Long = 0,
    yPlane: PixelPlane = PixelPlane(ByteBuffer.wrap(byteArrayOf(5, 6, 7, 8)), 0, width, height, width, 1),
    uPlane: PixelPlane = PixelPlane(ByteBuffer.wrap(byteArrayOf(9)), 0, (width + 1) / 2, (height + 1) / 2, (width + 1) / 2, 1),
    vPlane: PixelPlane = PixelPlane(ByteBuffer.wrap(byteArrayOf(10)), 0, (width + 1) / 2, (height + 1) / 2, (width + 1) / 2, 1),
  ) = PixelFrameView(
    width = width,
    height = height,
    cropRect = crop,
    rotationDegrees = 0,
    mirrored = false,
    colorSpace = "YUV_420_888",
    sessionId = "session-1",
    frameIndex = frameIndex,
    timestampFrameNanos = timestampFrameNanos,
    processingElapsedNanos = processingElapsedNanos,
    timestampSystemNanos = timestampSystemNanos,
    yPlane = yPlane,
    uPlane = uPlane,
    vPlane = vPlane,
  )
}
