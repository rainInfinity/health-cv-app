/** 验证心率搜索频率、窗口时间、边界拒绝和频谱质量语义。 */
package com.healthcvapp.acquisition.rppg.signal

import com.healthcvapp.acquisition.rppg.model.RPPGConfig
import kotlin.math.PI
import kotlin.math.sin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** 检查有效频率及可能误判为 bpm 的边界与低质量输入。 */
class RppgHeartRateEstimatorTest {
  @Test
  fun estimatesKnownFrequencyAtConfiguredWindowAndStepTimes() {
    // 当前3秒试验检查60点开窗；原6秒非格点频率继续保留原精度回归。
    val cases = listOf(
      Triple(RPPGConfig.EXPERIMENTAL_V2, 80.0, 60),
      Triple(RPPGConfig.EXPERIMENTAL_V2.copy(heartRateWindowNanos = 6_000_000_000L), 75.0, 120),
    )
    for ((config, heartRateBpm, expectedSamples) in cases) {
      val estimator = RppgHeartRateEstimator(config)
      val input = RppgFilteredSample()
      val output = RppgHeartRateOutput()
      assertEquals(expectedSamples, estimator.windowSampleCount)

      for (index in 0 until expectedSamples) {
        setInput(input, index.toLong(), 0L, index, sine(heartRateBpm / 60.0, index))
        val event = estimator.accept(input, output)
        if (index < expectedSamples - 1) {
          assertEquals(RppgHeartRateEvent.ACCUMULATING, event)
          assertFalse(output.hasWindow)
          assertFalse(output.hasHeartRate)
          assertEquals(RppgHeartRateRejectionReason.INSUFFICIENT_SAMPLES, output.rejectionReason)
        } else {
          assertEquals(RppgHeartRateEvent.WINDOW_EVALUATED, event)
          assertTrue(output.hasWindow)
          assertTrue(output.hasHeartRate)
          assertEquals(heartRateBpm, output.heartRateBpm, 0.2)
          assertTrue(output.hasSnr)
          assertTrue(output.snrDb >= config.minimumHeartRateSnrDb)
          assertEquals(0L, output.windowStartSampleIndex)
          assertEquals((expectedSamples - 1).toLong(), output.windowEndSampleIndex)
          assertEquals(0L, output.windowStartTimestampNanos)
          assertEquals((expectedSamples - 1) * 50_000_000L, output.windowEndTimestampNanos)
          assertEquals(config.heartRateWindowNanos, output.configuredWindowNanos)
        }
      }

      for (index in expectedSamples until expectedSamples + 19) {
        setInput(input, index.toLong(), 0L, index, sine(heartRateBpm / 60.0, index))
        assertEquals(RppgHeartRateEvent.WAITING_FOR_STEP, estimator.accept(input, output))
        assertFalse(output.hasWindow)
      }
      val nextIndex = expectedSamples + 19
      setInput(input, nextIndex.toLong(), 0L, nextIndex, sine(heartRateBpm / 60.0, nextIndex))
      assertEquals(RppgHeartRateEvent.WINDOW_EVALUATED, estimator.accept(input, output))
      assertTrue(output.hasHeartRate)
      assertEquals(heartRateBpm, output.heartRateBpm, 0.2)
      assertEquals(20L, output.windowStartSampleIndex)
      assertEquals(nextIndex.toLong(), output.windowEndSampleIndex)
      assertEquals(1_000_000_000L, output.windowStartTimestampNanos)
    }
  }

  @Test
  fun estimatesSixSecondHannWindowsAcrossHeartRatesAndPhasesIncludingNearSearchEdges() {
    val cases = listOf(
      46.0 to 0.2,
      60.0 to 0.0,
      80.0 to 1.1,
      90.0 to 2.4,
      179.0 to 0.7,
    )
    for ((heartRateBpm, phase) in cases) {
      val result = evaluateWindow(RPPGConfig.EXPERIMENTAL_V2.copy(heartRateWindowNanos = 6_000_000_000L)) { index ->
        sin(2.0 * PI * heartRateBpm / 60.0 * index / 20.0 + phase)
      }
      assertTrue("$heartRateBpm bpm, phase=$phase: ${result.rejectionReason}", result.hasHeartRate)
      assertEquals(heartRateBpm, result.heartRateBpm, 0.25)
      assertTrue(result.hasSnr)
      assertTrue(result.snrDb >= RPPGConfig.EXPERIMENTAL_V2.minimumHeartRateSnrDb)
    }
  }

  @Test
  fun rejectsOutOfRangePeaksInsteadOfClampingOrAcceptingBandEdgeSlopes() {
    assertRejectedFrequency(44.0 / 60.0, RppgHeartRateRejectionReason.OUT_OF_RANGE)
    assertRejectedFrequency(181.0 / 60.0, RppgHeartRateRejectionReason.OUT_OF_RANGE)
    assertRejectedFrequency(0.5, RppgHeartRateRejectionReason.BOUNDARY_PEAK)
    assertRejectedFrequency(3.25, RppgHeartRateRejectionReason.BOUNDARY_PEAK)
  }

  @Test
  fun returnsStableReasonsForZeroEnergyShortAndLowQualityWindows() {
    val zero = evaluateWindow { 0.0 }
    assertTrue(zero.hasWindow)
    assertFalse(zero.hasHeartRate)
    assertEquals(RppgHeartRateRejectionReason.ZERO_ENERGY, zero.rejectionReason)

    val constant = evaluateWindow { 7.0 }
    assertFalse(constant.hasHeartRate)
    assertEquals(RppgHeartRateRejectionReason.ZERO_ENERGY, constant.rejectionReason)

    val estimator = RppgHeartRateEstimator(RPPGConfig.EXPERIMENTAL_V2)
    val input = RppgFilteredSample()
    val output = RppgHeartRateOutput()
    for (index in 0 until estimator.windowSampleCount - 1) {
      setInput(input, index.toLong(), 0L, index, sine(1.0, index))
      assertEquals(RppgHeartRateEvent.ACCUMULATING, estimator.accept(input, output))
    }
    assertFalse(output.hasWindow)
    assertFalse(output.hasHeartRate)
    assertEquals(RppgHeartRateRejectionReason.INSUFFICIENT_SAMPLES, output.rejectionReason)

    val lowQuality = evaluateWindow { index ->
      0.2 + sine(1.0, index) + sine(2.0, index)
    }
    assertTrue(lowQuality.hasWindow)
    assertTrue(lowQuality.hasSnr)
    assertTrue(lowQuality.snrDb < RPPGConfig.EXPERIMENTAL_V2.minimumHeartRateSnrDb)
    assertFalse(lowQuality.hasHeartRate)
    assertEquals(RppgHeartRateRejectionReason.LOW_SNR, lowQuality.rejectionReason)
  }

  @Test
  fun segmentAndValidRangeChangesDiscardPreviousWindowHistory() {
    val estimator = RppgHeartRateEstimator(RPPGConfig.EXPERIMENTAL_V2)
    val input = RppgFilteredSample()
    val output = RppgHeartRateOutput()

    for (index in 0 until 100) {
      setInput(input, index.toLong(), 0L, index, sine(1.25, index))
      estimator.accept(input, output)
    }
    setInput(input, 100L, 1L, 0, sine(1.25, 0), beginsValidRange = true)
    assertEquals(RppgHeartRateEvent.ACCUMULATING, estimator.accept(input, output))
    assertFalse(output.hasWindow)
    assertEquals(1, output.samplesCollected)
    for (index in 1 until estimator.windowSampleCount - 1) {
      setInput(input, 100L + index, 1L, index, sine(1.25, index))
      estimator.accept(input, output)
    }
    assertFalse(output.hasWindow)
    assertEquals(RppgHeartRateRejectionReason.INSUFFICIENT_SAMPLES, output.rejectionReason)
  }

  /** 对固定输入波形执行一个完整 HR 窗口并返回结果容器。 */
  private fun evaluateWindow(
    config: RPPGConfig = RPPGConfig.EXPERIMENTAL_V2,
    signal: (Int) -> Double,
  ): RppgHeartRateOutput {
    val estimator = RppgHeartRateEstimator(config)
    val input = RppgFilteredSample()
    val output = RppgHeartRateOutput()
    for (index in 0 until estimator.windowSampleCount) {
      setInput(input, index.toLong(), 0L, index, signal(index))
      estimator.accept(input, output)
    }
    return output
  }

  /** 对指定频率构造完整纯音窗并核对稳定拒绝原因。 */
  private fun assertRejectedFrequency(frequencyHz: Double, reason: RppgHeartRateRejectionReason) {
    val result = evaluateWindow { index -> sine(frequencyHz, index) }
    assertTrue(result.hasWindow)
    assertFalse(result.hasHeartRate)
    assertEquals(reason, result.rejectionReason)
  }

  /** 为心率估计器填充可复用的有效滤波样本。 */
  private fun setInput(
    target: RppgFilteredSample,
    sampleIndex: Long,
    segmentIndex: Long,
    withinSegmentIndex: Int,
    value: Double,
    beginsValidRange: Boolean = withinSegmentIndex == 0,
  ) {
    target.setFiltered(
      segmentIndex = segmentIndex,
      sampleIndex = sampleIndex,
      timestampNanos = withinSegmentIndex * 50_000_000L,
      value = value,
      beginsValidRange = beginsValidRange,
      startupElapsedNanos = if (beginsValidRange) 2_000_000_000L else null,
      configuredStartupExclusionNanos = 2_000_000_000L,
    )
  }

  /** 产生 20 Hz 采样的无噪声正弦，测试仅使用已知数值信号。 */
  private fun sine(frequencyHz: Double, sampleIndex: Int): Double =
    sin(2.0 * PI * frequencyHz * sampleIndex / 20.0)
}
