/** 验证预览与分析的单项组合查询不把不兼容或未知伪装为支持。 */

package com.healthcvapp.acquisition.camera

import com.healthcvapp.acquisition.camera.model.CameraCapabilityStatus
import com.healthcvapp.acquisition.camera.model.CameraFpsRange
import com.healthcvapp.acquisition.camera.model.CameraResolution
import org.junit.Assert.assertEquals
import org.junit.Test

/** 覆盖单个 SessionConfig 返回的组合状态与帧率范围。 */
class CameraCaptureOptionMapperTest {
  @Test
  fun `marks an explicitly incompatible use case combination unsupported`() {
    val option = CameraCaptureOptionMapper.map(
      CameraResolution(1280.0, 720.0),
      30.0,
      sessionSupported = false,
      fpsRanges = listOf(CameraFpsRange(15.0, 30.0)),
    )

    assertEquals(CameraCapabilityStatus.UNSUPPORTED, option.compatibility)
    assertEquals(listOf(CameraFpsRange(15.0, 30.0)), option.fpsRanges)
  }

  @Test
  fun `keeps failed compatibility and missing fps metadata unknown`() {
    val compatibilityUnknown = CameraCaptureOptionMapper.map(
      CameraResolution(720.0, 720.0),
      30.0,
      sessionSupported = null,
      fpsRanges = null,
    )
    val frameRateUnknown = CameraCaptureOptionMapper.map(
      CameraResolution(720.0, 720.0),
      30.0,
      sessionSupported = true,
      fpsRanges = emptyList(),
    )

    assertEquals(CameraCapabilityStatus.UNKNOWN, compatibilityUnknown.compatibility)
    assertEquals(null, compatibilityUnknown.fpsRanges)
    assertEquals(CameraCapabilityStatus.UNKNOWN, frameRateUnknown.compatibility)
    assertEquals(emptyList<CameraFpsRange>(), frameRateUnknown.fpsRanges)
  }

  @Test
  fun `marks only the queried combination and exposes its actual fps ranges`() {
    val option = CameraCaptureOptionMapper.map(
      CameraResolution(720.0, 720.0),
      60.0,
      sessionSupported = true,
      fpsRanges = listOf(CameraFpsRange(15.0, 30.0)),
    )

    assertEquals(CameraCapabilityStatus.SUPPORTED, option.compatibility)
    assertEquals(listOf(CameraFpsRange(15.0, 30.0)), option.fpsRanges)
    assertEquals("目标帧率不在设备报告范围内；打开时仍须按实际范围协商。", option.reason)
  }
}
