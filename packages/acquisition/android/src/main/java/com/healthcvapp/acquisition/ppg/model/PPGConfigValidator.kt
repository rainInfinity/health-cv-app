/** 校验原始 PPG 网格与查询到的本地处理能力。 */

package com.healthcvapp.acquisition.ppg.model

import com.healthcvapp.acquisition.camera.model.CameraConfigFailure

/** 验证 PPG 专属网格，不让网格配置反向依赖共用相机层。 */
object PPGConfigValidator {
  /** 校验网格布局与当前相机查询返回的 PPG 处理上限。 */
  fun validateProcessing(config: PPGConfig, captureOptions: PPGCaptureOptions?) {
    val selectedOptions = captureOptions
      ?: unavailable("分块限制尚未查询，不能确认当前网格可用。")
    if (selectedOptions.cameraOptions.cameraId != config.cameraConfig.cameraId) {
      unavailable("分块限制不属于当前所选相机。")
    }
    val limits = selectedOptions.processing
    if (limits.maxBlockCount <= 0 || limits.maxColumns <= 0 || limits.maxRows <= 0) {
      unavailable("能力查询未返回有效的本地分块限制。")
    }
    val layout = config.blockLayout
    if (
      layout.blockCount > limits.maxBlockCount.toLong()
      || layout.rows > limits.maxRows
      || layout.columns > limits.maxColumns
    ) {
      invalid("分块网格超过已查询的最大块数或目标尺寸约束。")
    }
  }

  /** 抛出请求形状或范围错误。 */
  private fun invalid(message: String): Nothing =
    throw CameraConfigFailure("INVALID_CAMERA_CONFIG", message)

  /** 抛出设备能力不足以验证错误。 */
  private fun unavailable(message: String): Nothing =
    throw CameraConfigFailure("CAMERA_CAPABILITY_UNAVAILABLE", message)
}
