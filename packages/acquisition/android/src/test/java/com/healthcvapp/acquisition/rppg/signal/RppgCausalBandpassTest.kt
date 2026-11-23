/** 验证因果双线性带通、启动排除和片段重置。 */
package com.healthcvapp.acquisition.rppg.signal

import com.healthcvapp.acquisition.rppg.model.RPPGConfig
import kotlin.math.PI
import kotlin.math.sin
import kotlin.math.tan
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test

/** 以独立递推参考验证滤波数值和有效时间范围。 */
class RppgCausalBandpassTest {
  @Test
  fun filtersStepAndMultipleFrequenciesOnlyAfterConfiguredStartupAndResetsPerSegment() {
    val config = RPPGConfig.EXPERIMENTAL_V2
    val filter = RppgCausalBandpass(config)
    val input = RppgPosOutput()
    val output = RppgFilteredSample()
    val reference = DoubleArray(101) { index -> signalValue(index, config.resamplingRateHz) }
    val expected = referenceFilter(reference, config)
    val sampleIntervalNanos = 50_000_000L

    assertEquals(2_000_000_000L, filter.startupExclusionNanos)
    assertEquals(0L, filter.lookaheadDelayNanos)
    for (index in 0 until 60) {
      input.setFinalized(0L, index.toLong(), index * sampleIntervalNanos, reference[index], 1)
      val event = filter.accept(input, output)
      if (index < 40) {
        assertEquals(RppgFilterEvent.STARTUP_EXCLUDED, event)
        assertFalse(output.hasSample)
      } else {
        assertEquals(RppgFilterEvent.SAMPLE_FILTERED, event)
        assertTrue(output.hasSample)
        assertEquals(expected[index], output.value, 1e-12)
        assertEquals(index * sampleIntervalNanos, output.timestampNanos)
        assertEquals(index.toLong(), output.sampleIndex)
        assertEquals(index == 40, output.beginsValidRange)
        if (index == 40) {
          assertEquals(2_000_000_000L, output.startupElapsedNanos)
          assertEquals(2_000_000_000L, output.configuredStartupExclusionNanos)
        } else {
          assertNull(output.startupElapsedNanos)
        }
      }
    }
    assertEquals(2_000_000_000L, filter.firstValidTimestampNanos)

    input.setFinalized(1L, 60L, 0L, signalValue(0, config.resamplingRateHz), 1)
    assertEquals(RppgFilterEvent.STARTUP_EXCLUDED, filter.accept(input, output))
    assertFalse(output.hasSample)
    assertNull(filter.firstValidTimestampNanos)
    for (localIndex in 1..40) {
      val sessionIndex = 60L + localIndex
      input.setFinalized(
        1L,
        sessionIndex,
        localIndex * sampleIntervalNanos,
        signalValue(localIndex, config.resamplingRateHz),
        1,
      )
      val event = filter.accept(input, output)
      if (localIndex < 40) {
        assertEquals(RppgFilterEvent.STARTUP_EXCLUDED, event)
      } else {
        assertEquals(RppgFilterEvent.SAMPLE_FILTERED, event)
        assertEquals(1L, output.segmentIndex)
        assertEquals(2_000_000_000L, output.timestampNanos)
        assertEquals(2_000_000_000L, output.startupElapsedNanos)
        assertTrue(output.beginsValidRange)
      }
    }
    assertEquals(2_000_000_000L, filter.firstValidTimestampNanos)
  }

  @Test
  fun acceptsSampleIndexGapsOnlyAcrossSegmentBoundaries() {
    val filter = RppgCausalBandpass(RPPGConfig.EXPERIMENTAL_V2)
    val input = RppgPosOutput()
    val output = RppgFilteredSample()

    input.setFinalized(0L, 5L, 0L, 0.2, 1)
    assertEquals(RppgFilterEvent.STARTUP_EXCLUDED, filter.accept(input, output))

    input.setFinalized(1L, 17L, 0L, 0.3, 1)
    assertEquals(RppgFilterEvent.STARTUP_EXCLUDED, filter.accept(input, output))

    input.setFinalized(1L, 19L, 50_000_000L, 0.4, 1)
    assertThrows(IllegalArgumentException::class.java) { filter.accept(input, output) }
  }

  @Test
  fun invalidPulseResetsFilterStartupInsteadOfInjectingZero() {
    val filter = RppgCausalBandpass(RPPGConfig.EXPERIMENTAL_V2)
    val input = RppgPosOutput()
    val output = RppgFilteredSample()

    for (index in 0..2) {
      input.setFinalized(0L, index.toLong(), index * 50_000_000L, 1.0, 1)
      filter.accept(input, output)
    }
    input.setFinalized(0L, 3L, 150_000_000L, 0.0, 0)
    assertEquals(RppgFilterEvent.INVALID_INPUT, filter.accept(input, output))
    assertFalse(output.hasSample)
    assertNull(filter.firstValidTimestampNanos)

    for (index in 4L..44L) {
      input.setFinalized(0L, index, index * 50_000_000L, 1.0, 1)
      val event = filter.accept(input, output)
      if (index < 44L) assertEquals(RppgFilterEvent.STARTUP_EXCLUDED, event)
      else {
        assertEquals(RppgFilterEvent.SAMPLE_FILTERED, event)
        assertEquals(2_200_000_000L, output.timestampNanos)
        assertEquals(2_000_000_000L, output.startupElapsedNanos)
      }
    }
  }

  /** 产生阶跃并叠加带内、带外频率的确定性滤波输入。 */
  private fun signalValue(index: Int, sampleRateHz: Double): Double {
    val timeSeconds = index / sampleRateHz
    val step = if (index < 20) 0.0 else 0.8
    return 0.3 + step + 0.6 * sin(2.0 * PI * 1.2 * timeSeconds) +
      0.25 * sin(2.0 * PI * 4.0 * timeSeconds)
  }

  /** 独立递推双线性高通与低通，供测试比较完整因果输出序列。 */
  private fun referenceFilter(values: DoubleArray, config: RPPGConfig): DoubleArray {
    val highK = tan(PI * config.bandpassLowHz / config.resamplingRateHz)
    val lowK = tan(PI * config.bandpassHighHz / config.resamplingRateHz)
    val highGain = 1.0 / (1.0 + highK)
    val highPole = (1.0 - highK) / (1.0 + highK)
    val lowGain = lowK / (1.0 + lowK)
    val lowPole = (1.0 - lowK) / (1.0 + lowK)
    val result = DoubleArray(values.size)
    var previousInput = values[0]
    var previousHighOutput = 0.0
    var previousLowInput = 0.0
    var previousLowOutput = 0.0
    for (index in values.indices) {
      val highOutput = highGain * (values[index] - previousInput) + highPole * previousHighOutput
      previousInput = values[index]
      previousHighOutput = highOutput
      val lowOutput = lowGain * (highOutput + previousLowInput) + lowPole * previousLowOutput
      previousLowInput = highOutput
      previousLowOutput = lowOutput
      result[index] = lowOutput
    }
    return result
  }
}
