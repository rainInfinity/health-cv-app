/** 验证 PPG 网格限制与相机查询结果的绑定关系。 */

package com.healthcvapp.acquisition.ppg.model

import com.healthcvapp.acquisition.camera.model.CameraCaptureOptions
import com.healthcvapp.acquisition.camera.model.CameraConfig
import com.healthcvapp.acquisition.camera.model.CameraConfigFailure
import com.healthcvapp.acquisition.camera.model.CameraExposureConfig
import com.healthcvapp.acquisition.camera.model.CameraExposureMode
import com.healthcvapp.acquisition.camera.model.CameraFocusConfig
import com.healthcvapp.acquisition.camera.model.CameraFocusMode
import com.healthcvapp.acquisition.camera.model.CameraResolution
import com.healthcvapp.acquisition.camera.model.CameraWhiteBalanceConfig
import com.healthcvapp.acquisition.camera.model.CameraWhiteBalanceMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

/** 覆盖可用布局、尺寸上限、缺失查询和相机归属不匹配。 */
class PPGConfigValidatorTest {
  @Test
  fun `accepts a grid within the PPG processing limits`() {
    PPGConfigValidator.validateProcessing(
      config(CameraBlockLayout(2, 3)),
      options("logical-camera-1", maxRows = 2, maxColumns = 3, maxBlockCount = 6),
    )
  }

  @Test
  fun `rejects a grid that exceeds the queried dimensions or block count`() {
    val tooManyBlocks = assertThrows(CameraConfigFailure::class.java) {
      PPGConfigValidator.validateProcessing(
        config(CameraBlockLayout(2, 4)),
        options("logical-camera-1", maxRows = 2, maxColumns = 4, maxBlockCount = 6),
      )
    }
    assertEquals("INVALID_CAMERA_CONFIG", tooManyBlocks.code)

    val tooManyRows = assertThrows(CameraConfigFailure::class.java) {
      PPGConfigValidator.validateProcessing(
        config(CameraBlockLayout(3, 1)),
        options("logical-camera-1", maxRows = 2, maxColumns = 3, maxBlockCount = 6),
      )
    }
    assertEquals("INVALID_CAMERA_CONFIG", tooManyRows.code)
  }

  @Test
  fun `rejects missing or mismatched capture capabilities before acquiring the camera`() {
    val missing = assertThrows(CameraConfigFailure::class.java) {
      PPGConfigValidator.validateProcessing(config(CameraBlockLayout(1, 1)), null)
    }
    assertEquals("CAMERA_CAPABILITY_UNAVAILABLE", missing.code)

    val mismatch = assertThrows(CameraConfigFailure::class.java) {
      PPGConfigValidator.validateProcessing(
        config(CameraBlockLayout(1, 1)),
        options("another-camera", maxRows = 2, maxColumns = 2, maxBlockCount = 4),
      )
    }
    assertEquals("CAMERA_CAPABILITY_UNAVAILABLE", mismatch.code)
  }

  private fun config(layout: CameraBlockLayout) = PPGConfig(
    cameraConfig = CameraConfig(
      cameraId = "logical-camera-1",
      targetResolution = CameraResolution(720.0, 720.0),
      targetFps = 30.0,
      torchEnabled = false,
      exposure = CameraExposureConfig(CameraExposureMode.AUTO, 0.0, null, null, false),
      whiteBalance = CameraWhiteBalanceConfig(CameraWhiteBalanceMode.AUTO, false),
      focus = CameraFocusConfig(CameraFocusMode.AUTO, null),
    ),
    blockLayout = layout,
  )

  private fun options(cameraId: String, maxRows: Int, maxColumns: Int, maxBlockCount: Int) =
    PPGCaptureOptions(
      cameraOptions = CameraCaptureOptions(cameraId, emptyList()),
      processing = CameraProcessingLimits(maxBlockCount, maxColumns, maxRows),
    )
}
