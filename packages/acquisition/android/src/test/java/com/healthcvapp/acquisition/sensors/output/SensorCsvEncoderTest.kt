/** 验证各传感器旧 CSV 表头、三种时间与三轴值映射。 */

package com.healthcvapp.acquisition.sensors.output

import com.healthcvapp.acquisition.sensors.model.SensorKind
import com.healthcvapp.acquisition.sensors.model.SensorSample
import org.junit.Assert.assertEquals
import org.junit.Test

/** 使用不同轴值和时间验证类型列位置不互换、不折叠。 */
class SensorCsvEncoderTest {
  @Test
  fun `keeps exact type headers axis positions and fractional monotonic times`() {
    val expectedHeaders = mapOf(
      SensorKind.ACCELEROMETER to "timestamp,timestampEvent,timestampSystem,accX,accY,accZ",
      SensorKind.GYROSCOPE to "timestamp,timestampEvent,timestampSystem,gyrX,gyrY,gyrZ",
      SensorKind.MAGNETOMETER to "timestamp,timestampEvent,timestampSystem,magX,magY,magZ",
      SensorKind.GRAVITY to "timestamp,timestampEvent,timestampSystem,graX,graY,graZ",
    )
    val sample = SensorSample(
      receivedAtElapsedNanos = 2_000_001_234,
      eventTimestampNanos = 2_000_002_345,
      systemTimestampNanos = 2_000_003_456,
      x = 11.25f,
      y = 22.5f,
      z = 33.75f,
    )

    expectedHeaders.forEach { (kind, header) ->
      val encoder = SensorCsvEncoder(kind)
      val row = StringBuilder()

      assertEquals(header, encoder.header)
      assertEquals(1, encoder.rowCount(sample))
      encoder.appendRow(sample, 0, row)
      assertEquals("2000.001234,2000.002345,2000.003456,11.25,22.5,33.75", row.toString())
    }
  }
}
