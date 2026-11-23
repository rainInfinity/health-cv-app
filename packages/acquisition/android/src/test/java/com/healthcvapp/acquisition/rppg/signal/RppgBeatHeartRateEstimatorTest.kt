/** 通过已知波形和采集时间验证逐搏数值、门控与失效，不评估人体准确性。 */
package com.healthcvapp.acquisition.rppg.signal

import com.healthcvapp.acquisition.rppg.model.RPPGConfig
import com.healthcvapp.acquisition.rppg.model.RPPGInstantHeartRate
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/** 所有时间推进均来自模拟采集时钟，不依赖测试执行速度。 */
class RppgBeatHeartRateEstimatorTest {
  @Test
  fun estimatesLowNormalAndHighRatesWithSensorPeakAndIntervalTimes() {
    for (periodSamples in intArrayOf(24, 16, 8)) {
      val harness = Harness()
      var resultCount = 0
      for (index in 0 until 160) {
        val changed = harness.feed(sin(2.0 * PI * index / periodSamples))
        if (changed) {
          val result = requireNotNull(harness.estimator.latestHeartRate)
          val expectedPeakIndex = periodSamples / 4 + (resultCount + 2) * periodSamples
          assertEquals(3L, result.segmentIndex)
          assertEquals(BASE_TIME + expectedPeakIndex * STEP, result.peakTimestampNanos)
          assertEquals(BASE_TIME + (expectedPeakIndex - periodSamples) * STEP, result.previousPeakTimestampNanos)
          assertEquals(periodSamples * STEP, result.intervalNanos)
          assertEquals(1_200.0 / periodSamples, result.heartRateBpm, 1e-6)
          resultCount++
        }
      }
      assertTrue("已知频率必须产生多个数值可核对的结果", resultCount >= 3)
    }
  }

  @Test
  fun interpolatesOffGridPeaksWithoutConvertingAbsoluteSensorTimeToDouble() {
    val harness = Harness()
    for (index in 0..52) {
      var value = 0.0
      for (center in doubleArrayOf(10.3, 30.3, 50.3)) {
        val distance = index - center
        if (abs(distance) < 1.5) value = 1.0 - 0.25 * distance * distance
      }
      harness.feed(value)
    }
    val result = requireNotNull(harness.estimator.latestHeartRate)
    assertEquals(BASE_TIME + 30 * STEP + 15_000_000L, result.previousPeakTimestampNanos)
    assertEquals(BASE_TIME + 50 * STEP + 15_000_000L, result.peakTimestampNanos)
    assertEquals(1_000_000_000L, result.intervalNanos)
    assertEquals(60.0, result.heartRateBpm, 1e-9)
  }

  @Test
  fun waitsForThreePeaksAndOutputsNewestIntervalRatherThanAverage() {
    val harness = Harness()
    val peaks = intArrayOf(10, 34, 56)
    for (index in 0..56) {
      assertFalse(harness.feed(pulse(index, peaks)))
      assertNull(harness.estimator.latestHeartRate)
    }
    assertTrue(harness.feed(pulse(57, peaks)))
    val result = requireNotNull(harness.estimator.latestHeartRate)
    assertEquals(BASE_TIME + 34 * STEP, result.previousPeakTimestampNanos)
    assertEquals(BASE_TIME + 56 * STEP, result.peakTimestampNanos)
    assertEquals(1_100_000_000L, result.intervalNanos)
    assertEquals(60.0 / 1.1, result.heartRateBpm, 1e-9)
    assertFalse(harness.feed(0.0))
    assertSame(result, harness.estimator.latestHeartRate)
  }

  @Test
  fun rejectsFlatLinesTinyNoiseAndIntervalsOutsideConfiguredRange() {
    for (mode in 0..3) {
      val harness = Harness()
      for (index in 0 until 200) {
        val value = when (mode) {
          0 -> 0.25
          1 -> 1e-8 * sin(2.0 * PI * index / 16.0)
          2 -> pulse(index, intArrayOf(10, 16, 22, 28, 34, 40, 46, 52))
          else -> pulse(index, intArrayOf(10, 40, 70, 100, 130, 160, 190))
        }
        assertFalse(harness.feed(value))
        assertNull(harness.estimator.latestHeartRate)
      }
    }
  }

  @Test
  fun adaptiveProminenceRejectsSmallRippleBesideLargerPulses() {
    val harness = Harness()
    val large = intArrayOf(10, 30, 50, 70)
    val ripple = intArrayOf(20, 40, 60)
    val results = mutableListOf<RPPGInstantHeartRate>()
    for (index in 0..75) {
      if (harness.feed(pulse(index, large) + 0.1 * pulse(index, ripple))) {
        results.add(requireNotNull(harness.estimator.latestHeartRate))
      }
    }
    assertEquals(2, results.size)
    assertEquals(BASE_TIME + 50 * STEP, results[0].peakTimestampNanos)
    assertEquals(BASE_TIME + 70 * STEP, results[1].peakTimestampNanos)
    assertEquals(60.0, results[0].heartRateBpm, 1e-9)
    assertEquals(60.0, results[1].heartRateBpm, 1e-9)
  }

  @Test
  fun ignoresDuplicatePeaksInsideRefractoryWithoutPairingThem() {
    val harness = Harness()
    val peaks = intArrayOf(10, 14, 30, 34, 50, 54, 70, 74)
    val results = mutableListOf<RPPGInstantHeartRate>()
    for (index in 0..76) {
      if (harness.feed(pulse(index, peaks))) results.add(requireNotNull(harness.estimator.latestHeartRate))
    }
    assertEquals(2, results.size)
    for ((index, result) in results.withIndex()) {
      assertEquals(BASE_TIME + (50 + 20 * index) * STEP, result.peakTimestampNanos)
      assertEquals(1_000_000_000L, result.intervalNanos)
      assertEquals(60.0, result.heartRateBpm, 1e-9)
    }
  }

  @Test
  fun abnormalIntervalClearsValueAndRequiresTwoEntirelyNewIntervals() {
    for (abnormalPeak in intArrayOf(56, 60, 80)) {
      val harness = Harness()
      val peaks = intArrayOf(10, 30, 50, abnormalPeak, abnormalPeak + 20, abnormalPeak + 40)
      for (index in 0..51) harness.feed(pulse(index, peaks))
      assertEquals(60.0, requireNotNull(harness.estimator.latestHeartRate).heartRateBpm, 1e-9)
      for (index in 52..abnormalPeak) assertFalse(harness.feed(pulse(index, peaks)))
      assertTrue(harness.feed(pulse(abnormalPeak + 1, peaks)))
      assertNull(harness.estimator.latestHeartRate)
      for (index in abnormalPeak + 2..abnormalPeak + 40) {
        assertFalse(harness.feed(pulse(index, peaks)))
        assertNull(harness.estimator.latestHeartRate)
      }
      assertTrue(harness.feed(pulse(abnormalPeak + 41, peaks)))
      val recovered = requireNotNull(harness.estimator.latestHeartRate)
      assertEquals(BASE_TIME + (abnormalPeak + 20) * STEP, recovered.previousPeakTimestampNanos)
      assertEquals(BASE_TIME + (abnormalPeak + 40) * STEP, recovered.peakTimestampNanos)
      assertEquals(60.0, recovered.heartRateBpm, 1e-9)
    }
  }

  @Test
  fun segmentAndValidRangeChangesClearOldPeaksAndReconfirm() {
    for (changeSegment in booleanArrayOf(false, true)) {
      val harness = readyHarness()
      if (changeSegment) harness.segment = 4L
      assertTrue(harness.feed(0.0, beginsValidRange = !changeSegment))
      assertNull(harness.estimator.latestHeartRate)
      for (index in 0..50) {
        assertFalse(harness.feed(pulse(index, intArrayOf(10, 30, 50))))
        assertNull(harness.estimator.latestHeartRate)
      }
      assertTrue(harness.feed(0.5))
      val result = requireNotNull(harness.estimator.latestHeartRate)
      assertEquals(if (changeSegment) 4L else 3L, result.segmentIndex)
      assertEquals(60.0, result.heartRateBpm, 1e-9)
    }
  }

  @Test
  fun sampleOrTimeDiscontinuitiesClearOldPeaksAndDoNotBridgeMissingData() {
    for (mode in 0..4) {
      val harness = readyHarness()
      when (mode) {
        0 -> harness.sampleIndex++
        1 -> harness.timestamp += STEP
        2 -> harness.timestamp -= STEP
        3 -> harness.sampleIndex--
        else -> harness.timestamp += 10_000_000L
      }
      assertTrue(harness.feed(0.0))
      assertNull(harness.estimator.latestHeartRate)
      for (index in 0..30) {
        assertFalse(harness.feed(pulse(index, intArrayOf(10, 30))))
        assertNull(harness.estimator.latestHeartRate)
      }
    }
  }

  @Test
  fun noBeatTimeoutClearsCurrentValueOnceAndDiscardsOldPeakHistory() {
    val harness = readyHarness()
    val lastPeak = requireNotNull(harness.estimator.latestHeartRate).peakTimestampNanos
    val timeout = RPPGConfig.EXPERIMENTAL_V2.beatDetection.resultTimeoutNanos
    while (harness.timestamp <= lastPeak + timeout) {
      assertFalse(harness.feed(0.0))
      assertEquals(60.0, requireNotNull(harness.estimator.latestHeartRate).heartRateBpm, 1e-9)
    }
    assertTrue(harness.feed(0.0))
    assertNull(harness.estimator.latestHeartRate)
    for (index in 0..30) {
      assertFalse(harness.feed(pulse(index, intArrayOf(10, 30))))
      assertNull(harness.estimator.latestHeartRate)
    }
  }

  @Test
  fun resetSessionAndInvalidNumericInputRemoveCurrentValueAndPeakHistory() {
    for (numericFailure in booleanArrayOf(false, true)) {
      val harness = readyHarness()
      if (numericFailure) {
        assertTrue(harness.feed(Double.NaN))
      } else {
        harness.estimator.resetSession()
        harness.sampleIndex = 0L
        harness.timestamp = BASE_TIME
      }
      assertNull(harness.estimator.latestHeartRate)
      for (index in 0..30) {
        assertFalse(harness.feed(pulse(index, intArrayOf(10, 30))))
        assertNull(harness.estimator.latestHeartRate)
      }
    }
  }

  /** 先形成已知 60 bpm 结果，供后续失效行为复用。 */
  private fun readyHarness(): Harness {
    val harness = Harness()
    for (index in 0..51) harness.feed(pulse(index, intArrayOf(10, 30, 50)))
    val result = requireNotNull(harness.estimator.latestHeartRate)
    assertEquals(BASE_TIME + 30 * STEP, result.previousPeakTimestampNanos)
    assertEquals(BASE_TIME + 50 * STEP, result.peakTimestampNanos)
    assertEquals(60.0, result.heartRateBpm, 1e-9)
    return harness
  }

  /** 对称三点峰使峰时刻可精确核对，峰间为零。 */
  private fun pulse(index: Int, peaks: IntArray): Double {
    for (peak in peaks) {
      val distance = abs(index - peak)
      if (distance == 0) return 1.0
      if (distance == 1) return 0.5
    }
    return 0.0
  }

  /** 只推进传感器时间并复用一份输入；允许测试独立注入序号和时间缺口。 */
  private class Harness {
    val estimator = RppgBeatHeartRateEstimator(RPPGConfig.EXPERIMENTAL_V2)
    private val input = RppgFilteredSample()
    var segment = 3L
    var sampleIndex = 0L
    var timestamp = BASE_TIME

    fun feed(value: Double, beginsValidRange: Boolean = false): Boolean {
      input.setFiltered(
        segmentIndex = segment,
        sampleIndex = sampleIndex,
        timestampNanos = timestamp,
        value = value,
        beginsValidRange = beginsValidRange,
        startupElapsedNanos = null,
        configuredStartupExclusionNanos = 2_000_000_000L,
      )
      val changed = estimator.accept(input)
      sampleIndex++
      timestamp += STEP
      return changed
    }
  }

  companion object {
    private const val STEP = 50_000_000L
    private const val BASE_TIME = 9_100_000_000_000_000L
  }
}
