/** 验证主动相机配置模型保留网格和请求／提交语义。 */

package com.healthcvapp.acquisition.ppg.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

/** 覆盖网格边界、数组隔离及配置摘要字段。 */
class CameraConfigTest {
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
      val failure = assertThrows(CameraConfigFailure::class.java) {
        CameraBlockLayout.fromBlocks(blocks)
      }
      assertEquals("INVALID_CAMERA_CONFIG", failure.code)
    }
  }

  @Test
  fun `stores block dimensions as values rather than retaining the bridge array`() {
    val blocks = doubleArrayOf(3.0, 2.0)
    val layout = CameraBlockLayout.fromBlocks(blocks)
    blocks[0] = 1.0
    blocks[1] = 1.0

    assertEquals(3, layout.rows)
    assertEquals(2, layout.columns)
    assertEquals(6L, layout.blockCount)
  }

  @Test
  fun `keeps requested and submitted configurations separately in the summary`() {
    val requested = config(targetResolution = CameraResolution(720.0, 720.0))
      .copy(processing = CameraBlockLayout(rows = 2, columns = 3))
    val submitted = config(targetResolution = CameraResolution(640.0, 480.0))
      .copy(processing = CameraBlockLayout(rows = 2, columns = 3))
    val summary = CameraConfigSummary(
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
      blockLayout = CameraBlockLayout(rows = 2, columns = 3),
    )

    assertEquals(CameraResolution(720.0, 720.0), summary.requestedConfig.targetResolution)
    assertEquals(CameraResolution(640.0, 480.0), summary.submittedConfig.targetResolution)
    assertEquals("targetResolution", summary.adjustments.single().field)
    assertEquals(CameraBlockLayout(rows = 2, columns = 3), summary.blockLayout)
  }

  private fun config(targetResolution: CameraResolution) = CameraConfig(
    cameraId = "logical-camera-1",
    targetResolution = targetResolution,
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
}
