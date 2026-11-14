/** 为共用相机查询结果附加原始 PPG 的本地网格限制。 */

package com.healthcvapp.acquisition.ppg.model

import com.healthcvapp.acquisition.camera.model.CameraCaptureOptions
import com.healthcvapp.acquisition.camera.model.CameraConfigFailure
import com.healthcvapp.acquisition.camera.model.CameraResolution

/** 根据当前请求尺寸构造旧 PPG 协议所需的网格上限。 */
internal fun CameraCaptureOptions.withPpgProcessingLimits(resolution: CameraResolution): PPGCaptureOptions {
  val width = resolution.width.toPositiveDimension()
  val height = resolution.height.toPositiveDimension()
  return PPGCaptureOptions(
    cameraOptions = this,
    processing = CameraProcessingLimits(
      maxBlockCount = CameraBlockLayout.MAX_BLOCK_COUNT,
      maxColumns = minOf(width, CameraBlockLayout.MAX_BLOCK_COUNT),
      maxRows = minOf(height, CameraBlockLayout.MAX_BLOCK_COUNT),
    ),
  )
}

/** 转换经调用边界校验的像素尺寸。 */
private fun Double.toPositiveDimension(): Int {
  if (!isFinite() || this <= 0.0 || this % 1.0 != 0.0 || this > Int.MAX_VALUE) {
    throw CameraConfigFailure("INVALID_CAMERA_CONFIG", "相机尺寸必须是正整数像素。")
  }
  return toInt()
}
