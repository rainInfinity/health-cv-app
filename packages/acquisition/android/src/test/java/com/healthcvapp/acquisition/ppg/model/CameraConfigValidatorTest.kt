/** 验证主动相机配置校验的错误分类与设备范围边界。 */

package com.healthcvapp.acquisition.ppg.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

/** 覆盖有效模式、互斥参数、未知能力和超限网格。 */
class CameraConfigValidatorTest {
  @Test
  fun `accepts supported automatic and manual configurations`() {
    CameraConfigValidator.validate(config(), capabilities(), captureOptions())

    val manual = config().copy(
      exposure = CameraExposureConfig(
        mode = CameraExposureMode.MANUAL,
        compensationIndex = null,
        timeNanos = 15_000_000.0,
        iso = 200.0,
        locked = false,
      ),
    )
    CameraConfigValidator.validate(manual, capabilities(), captureOptions())
  }

  @Test
  fun `classifies malformed and mutually exclusive values as invalid configuration`() {
    val invalidConfigs = listOf(
      config().copy(
        exposure = config().exposure.copy(timeNanos = 15_000_000.5),
      ),
      config().copy(
        exposure = CameraExposureConfig(
          CameraExposureMode.MANUAL,
          compensationIndex = null,
          timeNanos = 15_000_000.5,
          iso = 200.0,
          locked = false,
        ),
      ),
      config().copy(
        exposure = CameraExposureConfig(
          CameraExposureMode.MANUAL,
          compensationIndex = null,
          timeNanos = 15_000_000.0,
          iso = 200.5,
          locked = false,
        ),
      ),
      config().copy(
        exposure = CameraExposureConfig(
          CameraExposureMode.MANUAL,
          compensationIndex = null,
          timeNanos = 9_007_199_254_740_992.0,
          iso = 200.0,
          locked = false,
        ),
      ),
      config().copy(
        exposure = config().exposure.copy(compensationIndex = Double.NaN),
      ),
      config().copy(
        exposure = CameraExposureConfig(
          CameraExposureMode.AUTO,
          compensationIndex = 0.0,
          timeNanos = 15_000_000.0,
          iso = 200.0,
          locked = false,
        ),
      ),
      config().copy(
        exposure = CameraExposureConfig(
          CameraExposureMode.MANUAL,
          compensationIndex = null,
          timeNanos = 15_000_000.0,
          iso = 200.0,
          locked = true,
        ),
      ),
      config().copy(
        whiteBalance = CameraWhiteBalanceConfig(CameraWhiteBalanceMode.DAYLIGHT, locked = true),
      ),
      config().copy(
        focus = CameraFocusConfig(CameraFocusMode.MANUAL, distanceDiopters = null),
      ),
      config().copy(processing = CameraBlockLayout(rows = 2, columns = 4)),
    )

    invalidConfigs.forEach { invalidConfig ->
      assertFailure("INVALID_CAMERA_CONFIG") {
        CameraConfigValidator.validate(invalidConfig, capabilities(), captureOptions())
      }
    }
  }

  @Test
  fun `distinguishes unsupported controls from unknown required capabilities`() {
    val unsupportedTorch = config().copy(torchEnabled = true)
    assertFailure("CAMERA_PARAMETER_UNSUPPORTED") {
      CameraConfigValidator.validate(
        unsupportedTorch,
        capabilities().copy(
          torch = CameraBooleanCapability(CameraCapabilityStatus.UNSUPPORTED, false, null),
        ),
        captureOptions(),
      )
    }

    val manual = config().copy(
      exposure = CameraExposureConfig(
        CameraExposureMode.MANUAL,
        compensationIndex = null,
        timeNanos = 15_000_000.0,
        iso = 200.0,
        locked = false,
      ),
    )
    assertFailure("CAMERA_CAPABILITY_UNAVAILABLE") {
      CameraConfigValidator.validate(
        manual,
        capabilities().copy(
          iso = CameraNumericCapability(CameraCapabilityStatus.UNKNOWN, null, null),
        ),
        captureOptions(),
      )
    }
    assertFailure("CAMERA_CAPABILITY_UNAVAILABLE") {
      CameraConfigValidator.validate(config(), capabilities(), null)
    }
    assertFailure("CAMERA_CAPABILITY_UNAVAILABLE") {
      CameraConfigValidator.validate(
        manual,
        capabilities().copy(
          exposureModes = CameraModeCapability(
            CameraCapabilityStatus.SUPPORTED,
            listOf("auto"),
            listOf("manual"),
            null,
          ),
        ),
        captureOptions(),
      )
    }
    assertFailure("CAMERA_PARAMETER_UNSUPPORTED") {
      CameraConfigValidator.validate(
        manual,
        capabilities().copy(
          exposureModes = CameraModeCapability(
            CameraCapabilityStatus.SUPPORTED,
            listOf("auto"),
            emptyList(),
            null,
          ),
        ),
        captureOptions(),
      )
    }
  }

  @Test
  fun `rejects values outside known hardware ranges`() {
    val outOfRangeCompensation = config().copy(
      exposure = config().exposure.copy(compensationIndex = 7.0),
    )
    assertFailure("INVALID_CAMERA_CONFIG") {
      CameraConfigValidator.validate(outOfRangeCompensation, capabilities(), captureOptions())
    }

    val outOfRangeManualIso = config().copy(
      exposure = CameraExposureConfig(
        CameraExposureMode.MANUAL,
        compensationIndex = null,
        timeNanos = 15_000_000.0,
        iso = 3_300.0,
        locked = false,
      ),
    )
    assertFailure("INVALID_CAMERA_CONFIG") {
      CameraConfigValidator.validate(outOfRangeManualIso, capabilities(), captureOptions())
    }
  }

  private fun assertFailure(expectedCode: String, action: () -> Unit) {
    val failure = assertThrows(CameraConfigFailure::class.java, action)
    assertEquals(expectedCode, failure.code)
  }

  private fun config() = CameraConfig(
    cameraId = "logical-camera-1",
    targetResolution = CameraResolution(720.0, 720.0),
    targetFps = 30.0,
    torchEnabled = false,
    exposure = CameraExposureConfig(
      mode = CameraExposureMode.AUTO,
      compensationIndex = 0.0,
      timeNanos = null,
      iso = null,
      locked = false,
    ),
    whiteBalance = CameraWhiteBalanceConfig(CameraWhiteBalanceMode.AUTO, locked = false),
    focus = CameraFocusConfig(CameraFocusMode.AUTO, distanceDiopters = null),
    processing = CameraBlockLayout(rows = 1, columns = 1),
  )

  private fun capabilities() = CameraCapabilities(
    cameraId = "logical-camera-1",
    exposureModes = CameraModeCapability(
      CameraCapabilityStatus.SUPPORTED,
      listOf("auto", "manual"),
      emptyList(),
      null,
    ),
    exposureTimeNanos = numeric(1_000_000.0, 100_000_000.0),
    iso = numeric(50.0, 3_200.0),
    exposureCompensationIndex = numeric(
      -6.0,
      6.0,
      CameraRational(numerator = 1, denominator = 3),
    ),
    whiteBalanceModes = CameraModeCapability(
      CameraCapabilityStatus.SUPPORTED,
      listOf("auto", "off", "daylight"),
      emptyList(),
      null,
    ),
    focusModes = CameraModeCapability(
      CameraCapabilityStatus.SUPPORTED,
      listOf("auto", "off", "manual"),
      emptyList(),
      null,
    ),
    focusDistanceDiopters = numeric(0.0, 10.0),
    torch = CameraBooleanCapability(CameraCapabilityStatus.SUPPORTED, true, null),
    aeLock = CameraBooleanCapability(CameraCapabilityStatus.SUPPORTED, true, null),
    awbLock = CameraBooleanCapability(CameraCapabilityStatus.SUPPORTED, true, null),
  )

  private fun numeric(
    minimum: Double,
    maximum: Double,
    step: CameraRational? = null,
  ) = CameraNumericCapability(
    CameraCapabilityStatus.SUPPORTED,
    CameraNumberRange(minimum, maximum, step),
    null,
  )

  private fun captureOptions() = CameraCaptureOptions(
    cameraId = "logical-camera-1",
    options = emptyList(),
    processing = CameraProcessingLimits(maxBlockCount = 6, maxColumns = 3, maxRows = 2),
  )
}
