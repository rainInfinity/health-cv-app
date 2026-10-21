/** 验证 Camera2 完成结果映射和可选字段的旧版零值兜底。 */

package com.healthcvapp.acquisition.ppg.camera

import org.junit.Assert.assertEquals
import org.junit.Test

class CameraFrameMetadataTest {
  @Test
  fun missingOptionalResultFieldsUseZeroWithoutReplacingAvailableValues() {
    val metadata = CameraFrameMetadata.fromCaptureResult(
      timestampElapsedNanos = 21_500_000L,
      timestampFrameNanos = 18_250_000L,
      timestampSystemNanos = 22_750_000L,
      exposureTimeNanos = null,
      durationTimeNanos = 33_333_333L,
      rollingShutterSkewTimeNanos = null,
      iso = 0,
      whiteBalanceMode = null,
    )

    assertEquals(21_500_000L, metadata.timestampElapsedNanos)
    assertEquals(18_250_000L, metadata.timestampFrameNanos)
    assertEquals(22_750_000L, metadata.timestampSystemNanos)
    assertEquals(0L, metadata.exposureTimeNanos)
    assertEquals(33_333_333L, metadata.durationTimeNanos)
    assertEquals(0L, metadata.rollingShutterSkewTimeNanos)
    assertEquals(0, metadata.iso)
    assertEquals(0, metadata.whiteBalanceMode)
  }
}
