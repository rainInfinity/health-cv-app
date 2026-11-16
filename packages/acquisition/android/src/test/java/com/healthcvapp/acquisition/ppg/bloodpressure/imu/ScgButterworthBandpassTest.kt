/** 仅检验因果滤波的受控频率响应，不将测试正弦当作人体证据。 */
package com.healthcvapp.acquisition.ppg.bloodpressure.imu

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin
import kotlin.math.sqrt
import org.junit.Assert.*
import org.junit.Test

class ScgButterworthBandpassTest {
  @Test fun actualConfiguredRatesKeepEightToTwentyFourHertzButterworthEdges() {
    for (rate in listOf(100.0, 200.0)) {
      assertEquals(1.0 / sqrt(2.0), gain(8.0, rate), 0.01)
      assertEquals(1.0 / sqrt(2.0), gain(24.0, rate), 0.01)
      assertTrue(gain(16.0, rate) > 0.95)
      assertTrue(gain(2.0, rate) < 0.05)
      assertTrue(gain(40.0, rate) < 0.20)
    }
  }

  @Test fun constantInputDecaysWithoutDcOrFutureSampleDependence() {
    val filter = ScgButterworthBandpass()
    filter.configure(200.0)
    var maximumTail = 0.0
    repeat(1200) { index ->
      val output = filter.process(9.81)
      assertTrue(output.isFinite())
      if (index > 400) maximumTail = maxOf(maximumTail, abs(output))
    }
    assertTrue(maximumTail < 1e-9)
    filter.reset()
    assertEquals(0.0, filter.process(0.0), 0.0)
  }

  @Test(expected = IllegalArgumentException::class)
  fun insufficientNyquistCannotSilentlyNarrowBand() {
    ScgButterworthBandpass().configure(48.0)
  }

  private fun gain(frequency: Double, rate: Double): Double {
    val filter = ScgButterworthBandpass()
    filter.configure(rate)
    var energy = 0.0
    var count = 0
    repeat((6.0 * rate).toInt()) { index ->
      val output = filter.process(sin(2.0 * PI * frequency * index / rate))
      if (index >= (2.0 * rate).toInt()) { energy += output * output; count++ }
    }
    return sqrt(2.0 * energy / count)
  }
}
