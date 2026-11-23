/** 验证传感器时间插值、片段边界和会话状态重置。 */
package com.healthcvapp.acquisition.rppg.signal

import com.healthcvapp.acquisition.rppg.model.RPPGConfig
import com.healthcvapp.acquisition.rppg.roi.RppgRgbMean
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** 检查不规则 RGB 输入在传感器时间轴上的重采样行为。 */
class RppgTimeResamplerTest {
  @Test
  fun interpolatesOnSensorTimeGridInsteadOfFrameArrivalIntervals() {
    val resampler = RppgTimeResampler(RPPGConfig.EXPERIMENTAL_V2)
    val sample = RppgResampledRgb()

    assertEquals(RppgResamplerEvent.SEGMENT_STARTED, resampler.accept(0L, rgb(0.0)))
    assertEquals(RppgResamplerEvent.SAMPLE_ACCEPTED, resampler.accept(80_000_000L, rgb(80.0)))
    assertEquals(2, resampler.samples.size)
    resampler.samples.copyAt(1, sample)
    assertEquals(50_000_000L, sample.timestampNanos)
    assertEquals(50.0, sample.red, 1e-9)
    assertEquals(1L, sample.sampleIndex)
    assertEquals(RppgResamplerEvent.SAMPLE_ACCEPTED, resampler.accept(150_000_000L, rgb(150.0)))
    assertEquals(4, resampler.samples.size)
    resampler.samples.copyAt(2, sample)
    assertEquals(100_000_000L, sample.timestampNanos)
    assertEquals(100.0, sample.red, 1e-9)
    resampler.samples.copyAt(3, sample)
    assertEquals(150_000_000L, sample.timestampNanos)
    assertEquals(150.0, sample.red, 1e-9)
    assertEquals(4L, resampler.nextSampleIndex)
  }

  @Test
  fun longGapStartsFreshSegmentWithoutInterpolatingAcrossIt() {
    val resampler = RppgTimeResampler(RPPGConfig.EXPERIMENTAL_V2)
    val sample = RppgResampledRgb()

    resampler.accept(0L, rgb(0.0))
    assertEquals(RppgResamplerEvent.SAMPLE_ACCEPTED, resampler.accept(100_000_000L, rgb(100.0)))
    assertEquals(3, resampler.samples.size)

    assertEquals(RppgResamplerEvent.SEGMENT_STARTED, resampler.accept(201_000_000L, rgb(201.0)))
    assertEquals(RppgSegmentBoundaryReason.LONG_GAP, resampler.lastBoundaryReason)
    assertEquals(1L, resampler.segmentIndex)
    assertEquals(1, resampler.samples.size)
    resampler.samples.copyAt(0, sample)
    assertEquals(201_000_000L, sample.timestampNanos)
    assertEquals(201.0, sample.red, 0.0)
    assertEquals(3L, sample.sampleIndex)
  }

  @Test
  fun rejectsNonMonotonicAndInvalidSamplesAndStartsNewSegments() {
    val resampler = RppgTimeResampler(RPPGConfig.EXPERIMENTAL_V2)

    assertEquals(RppgResamplerEvent.SEGMENT_STARTED, resampler.accept(100L, rgb(10.0)))
    assertEquals(
      RppgResamplerEvent.NON_MONOTONIC_TIMESTAMP,
      resampler.accept(100L, rgb(20.0)),
    )
    assertEquals(RppgSegmentBoundaryReason.NON_MONOTONIC_TIMESTAMP, resampler.lastBoundaryReason)
    assertEquals(0, resampler.samples.size)

    assertEquals(RppgResamplerEvent.SEGMENT_STARTED, resampler.accept(150L, rgb(30.0)))
    assertEquals(1L, resampler.segmentIndex)
    assertEquals(RppgResamplerEvent.INVALID_SAMPLE, resampler.accept(200L, null))
    assertEquals(RppgSegmentBoundaryReason.INVALID_SAMPLE, resampler.lastBoundaryReason)
    assertEquals(0, resampler.samples.size)

    assertEquals(RppgResamplerEvent.SEGMENT_STARTED, resampler.accept(250L, rgb(40.0)))
    assertEquals(2L, resampler.segmentIndex)
    assertEquals(3L, resampler.nextSampleIndex)
  }

  @Test
  fun resetClearsGridHistoryAndSessionIndexes() {
    val resampler = RppgTimeResampler(RPPGConfig.EXPERIMENTAL_V2, bufferCapacity = 2)
    resampler.accept(10_000_000L, rgb(10.0))
    resampler.accept(60_000_000L, rgb(60.0))
    resampler.accept(110_000_000L, rgb(110.0))
    assertEquals(2, resampler.samples.size)

    resampler.resetSession()

    assertEquals(0, resampler.samples.size)
    assertEquals(-1L, resampler.segmentIndex)
    assertEquals(0L, resampler.nextSampleIndex)
    assertNull(resampler.lastBoundaryReason)
    assertEquals(RppgResamplerEvent.SEGMENT_STARTED, resampler.accept(0L, rgb(1.0)))
    assertEquals(0L, resampler.segmentIndex)
    assertEquals(1L, resampler.nextSampleIndex)
  }

  /** 构造像素来源有效的 RGB 通道均值测试样本。 */
  private fun rgb(red: Double) = RppgRgbMean(red, red + 1.0, red + 2.0, 16, 1.0)
}
