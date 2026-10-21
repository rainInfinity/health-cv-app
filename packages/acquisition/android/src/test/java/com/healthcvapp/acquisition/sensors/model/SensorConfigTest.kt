/** 验证传感器类型与显式微秒采样配置边界。 */

package com.healthcvapp.acquisition.sensors.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

/** 覆盖非法类型、非有限数、非整数及注册间隔计算。 */
class SensorConfigTest {
  @Test
  fun `accepts exact supported boundaries and reports actual registration delay`() {
    val minimum = SensorConfig.fromRequest("accelerometer", 5_000.0)
    val maximum = SensorConfig.fromRequest("gravity", 1_000_000.0)

    assertEquals(5_000, minimum.requestedSamplingPeriodMicros)
    assertEquals(10_000, minimum.withSensorMinDelay(10_000).registeredSamplingPeriodMicros)
    assertEquals(5_000, minimum.withSensorMinDelay(0).registeredSamplingPeriodMicros)
    assertEquals(1_000_000, maximum.requestedSamplingPeriodMicros)
    assertEquals(1_000_000, maximum.withSensorMinDelay(1).registeredSamplingPeriodMicros)
  }

  @Test
  fun `rejects unknown kinds before any device input can be constructed`() {
    val error = assertThrows(SensorCaptureFailure::class.java) {
      SensorConfig.fromRequest("unknown", 20_000.0)
    }

    assertEquals("INVALID_SENSOR_KIND", error.code)
  }

  @Test
  fun `rejects nonfinite fractional and out of range periods`() {
    val invalidPeriods = listOf(
      Double.NaN,
      Double.POSITIVE_INFINITY,
      Double.NEGATIVE_INFINITY,
      0.0,
      4_999.0,
      5_000.5,
      1_000_001.0,
    )

    invalidPeriods.forEach { period ->
      val error = assertThrows(SensorCaptureFailure::class.java) {
        SensorConfig.fromRequest("gyroscope", period)
      }
      assertEquals("INVALID_SENSOR_CONFIG", error.code)
    }
  }
}
