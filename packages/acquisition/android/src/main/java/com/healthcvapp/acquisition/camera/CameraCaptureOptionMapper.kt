/** 将单个 CameraX Preview + YUV SessionConfig 查询结果映射为组合选项。 */

package com.healthcvapp.acquisition.camera

import com.healthcvapp.acquisition.camera.model.CameraCaptureOption
import com.healthcvapp.acquisition.camera.model.CameraCapabilityStatus
import com.healthcvapp.acquisition.camera.model.CameraFpsRange
import com.healthcvapp.acquisition.camera.model.CameraResolution

/** 按精确 SessionConfig 结果区分支持、不支持与无法确认。 */
internal object CameraCaptureOptionMapper {
  /** 组合状态仅来自同一 Preview + YUV SessionConfig，不拼接独立尺寸和帧率能力。 */
  fun map(
    resolution: CameraResolution,
    targetFps: Double?,
    sessionSupported: Boolean?,
    fpsRanges: List<CameraFpsRange>?,
  ): CameraCaptureOption {
    val compatibility = when {
      sessionSupported == false -> CameraCapabilityStatus.UNSUPPORTED
      sessionSupported == null || fpsRanges.isNullOrEmpty() -> CameraCapabilityStatus.UNKNOWN
      else -> CameraCapabilityStatus.SUPPORTED
    }
    val targetFpsSupported = targetFps == null || fpsRanges.orEmpty().any {
      targetFps >= it.minimum && targetFps <= it.maximum
    }
    val reason = when {
      sessionSupported == false -> "CameraX 明确报告 Preview 与 YUV 分析组合不兼容。"
      sessionSupported == null -> "CameraX 无法确认当前 Preview 与 YUV 分析组合。"
      fpsRanges.isNullOrEmpty() -> "CameraX 未返回当前组合的帧率范围。"
      !targetFpsSupported -> "目标帧率不在设备报告范围内；打开时仍须按实际范围协商。"
      else -> null
    }
    return CameraCaptureOption(resolution, fpsRanges, compatibility, reason)
  }
}
