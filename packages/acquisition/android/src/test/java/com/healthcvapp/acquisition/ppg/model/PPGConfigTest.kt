/** 验证 PPG 网格独立于共用相机配置并保留请求摘要语义。 */

package com.healthcvapp.acquisition.ppg.model

import com.healthcvapp.acquisition.camera.model.CameraConfig
import com.healthcvapp.acquisition.camera.model.CameraConfigAdjustment
import com.healthcvapp.acquisition.camera.model.CameraConfigSummary
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

/** 覆盖网格边界、桥接数组隔离和 PPG/相机摘要拆分。 */
class PPGConfigTest {
  @Test
  fun `requires exactly two positive block dimensions and keeps a safe product`() {
    val layout = CameraBlockLayout.fromBlocks(doubleArrayOf(2.0, 3.0))
    assertEquals(2, layout.rows)
    assertEquals(3, layout.columns)
    assertEquals(6L, layout.blockCount)

    val invalid = listOf(
      doubleArrayOf(),
      doubleArrayOf(1.0),
      doubleArrayOf(1.0, 2.0, 3.0),
      doubleArrayOf(0.0, 2.0),
      doubleArrayOf(2.0, -1.0),
      doubleArrayOf(1.5, 2.0),
      doubleArrayOf(Double.NaN, 2.0),
      doubleArrayOf(Int.MAX_VALUE.toDouble() + 1.0, 1.0),
    )
    invalid.forEach { blocks ->
      val failure = assertThrows(com.healthcvapp.acquisition.camera.model.CameraConfigFailure::class.java) {
        CameraBlockLayout.fromBlocks(blocks)
      }
      assertEquals("INVALID_CAMERA_CONFIG", failure.code)
    }
  }

  @Test
  fun `stores grid dimensions as values rather than retaining the bridge array`() {
    val blocks = doubleArrayOf(3.0, 2.0)
    val layout = CameraBlockLayout.fromBlocks(blocks)
    blocks[0] = 1.0
    blocks[1] = 1.0

    assertEquals(3, layout.rows)
    assertEquals(2, layout.columns)
    assertEquals(6L, layout.blockCount)
  }

  @Test
  fun `keeps the grid outside the shared camera configuration summary`() {
    val layout = CameraBlockLayout(2, 3)
    val requested = cameraConfig(CameraResolution(720.0, 720.0))
    val submitted = cameraConfig(CameraResolution(640.0, 480.0))
    val summary = PPGConfigSummary(
      cameraSummary = CameraConfigSummary(
        cameraId = "logical-camera-1",
        requestedConfig = requested,
        submittedConfig = submitted,
        adjustments = listOf(
          CameraConfigAdjustment(
            field = "targetResolution",
            requestedValue = "720x720",
            submittedValue = "640x480",
            reason = "当前 Preview 与 YUV 分析组合不支持请求尺寸。",
          ),
        ),
        actualFrame = null,
        observedFps = null,
      ),
      blockLayout = layout,
    )

    assertEquals(CameraResolution(720.0, 720.0), summary.cameraSummary.requestedConfig.targetResolution)
    assertEquals(CameraResolution(640.0, 480.0), summary.cameraSummary.submittedConfig.targetResolution)
    assertEquals("targetResolution", summary.cameraSummary.adjustments.single().field)
    assertEquals(layout, summary.blockLayout)
  }

  private fun cameraConfig(resolution: CameraResolution) = CameraConfig(
    cameraId = "logical-camera-1",
    targetResolution = resolution,
    targetFps = 30.0,
    torchEnabled = false,
    exposure = CameraExposureConfig(CameraExposureMode.AUTO, 0.0, null, null, false),
    whiteBalance = CameraWhiteBalanceConfig(CameraWhiteBalanceMode.AUTO, false),
    focus = CameraFocusConfig(CameraFocusMode.AUTO, null),
  )
}
