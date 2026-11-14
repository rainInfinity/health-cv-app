/** 验证共用相机设备配置的能力边界和稳定错误分类。 */

package com.healthcvapp.acquisition.camera.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

/** 覆盖曝光互斥、设备未知、硬件限制和手动控制边界。 */
class CameraConfigValidatorTest {
  @Test
  fun `accepts supported automatic and manual configurations`() {
    CameraConfigValidator.validate(config(), capabilities())
    val manual = config().copy(
      exposure = CameraExposureConfig(
        mode = CameraExposureMode.MANUAL,
        compensationIndex = null,
        timeNanos = 15_000_000.0,
        iso = 200.0,
        locked = false,
      ),
    )
    CameraConfigValidator.validate(manual, capabilities())
  }

  @Test
  fun `rejects malformed and mutually exclusive device configuration fields`() {
    val invalidConfigs = listOf(
      config().copy(targetResolution = CameraResolution(720.5, 480.0)),
      config().copy(targetFps = Double.NaN),
      config().copy(exposure = config().exposure.copy(timeNanos = 15_000_000.5)),
      config().copy(
        exposure = CameraExposureConfig(
          CameraExposureMode.MANUAL, null, 15_000_000.5, 200.0, false,
        ),
      ),
      config().copy(
        exposure = CameraExposureConfig(
          CameraExposureMode.MANUAL, null, 15_000_000.0, 200.5, false,
        ),
      ),
      config().copy(
        exposure = CameraExposureConfig(
          CameraExposureMode.MANUAL, null, 9_007_199_254_740_992.0, 200.0, false,
        ),
      ),
      config().copy(exposure = config().exposure.copy(compensationIndex = Double.NaN)),
      config().copy(
        exposure = CameraExposureConfig(
          CameraExposureMode.AUTO, 0.0, 15_000_000.0, 200.0, false,
        ),
      ),
      config().copy(
        exposure = CameraExposureConfig(
          CameraExposureMode.MANUAL, null, 15_000_000.0, 200.0, true,
        ),
      ),
      config().copy(whiteBalance = CameraWhiteBalanceConfig(CameraWhiteBalanceMode.DAYLIGHT, true)),
      config().copy(focus = CameraFocusConfig(CameraFocusMode.MANUAL, null)),
    )

    invalidConfigs.forEach { invalidConfig ->
      assertFailure("INVALID_CAMERA_CONFIG") {
        CameraConfigValidator.validate(invalidConfig, capabilities())
      }
    }
  }

  @Test
  fun `distinguishes unsupported controls from unknown required capabilities`() {
    assertFailure("CAMERA_PARAMETER_UNSUPPORTED") {
      CameraConfigValidator.validate(
        config().copy(torchEnabled = true),
        capabilities().copy(torch = CameraBooleanCapability(CameraCapabilityStatus.UNSUPPORTED, false, null)),
      )
    }
    val manual = config().copy(
      exposure = CameraExposureConfig(CameraExposureMode.MANUAL, null, 15_000_000.0, 200.0, false),
    )
    assertFailure("CAMERA_CAPABILITY_UNAVAILABLE") {
      CameraConfigValidator.validate(
        manual,
        capabilities().copy(iso = CameraNumericCapability(CameraCapabilityStatus.UNKNOWN, null, null)),
      )
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
      )
    }
  }

  @Test
  fun `rejects device values outside known hardware ranges`() {
    assertFailure("INVALID_CAMERA_CONFIG") {
      CameraConfigValidator.validate(
        config().copy(exposure = config().exposure.copy(compensationIndex = 7.0)),
        capabilities(),
      )
    }
    assertFailure("INVALID_CAMERA_CONFIG") {
      CameraConfigValidator.validate(
        config().copy(
          exposure = CameraExposureConfig(CameraExposureMode.MANUAL, null, 15_000_000.0, 3_300.0, false),
        ),
        capabilities(),
      )
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
    exposure = CameraExposureConfig(CameraExposureMode.AUTO, 0.0, null, null, false),
    whiteBalance = CameraWhiteBalanceConfig(CameraWhiteBalanceMode.AUTO, false),
    focus = CameraFocusConfig(CameraFocusMode.AUTO, null),
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
    exposureCompensationIndex = numeric(-6.0, 6.0, CameraRational(1, 3)),
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

  private fun numeric(minimum: Double, maximum: Double, step: CameraRational? = null) =
    CameraNumericCapability(
      CameraCapabilityStatus.SUPPORTED,
      CameraNumberRange(minimum, maximum, step),
      null,
    )
}
