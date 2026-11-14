/** 表示一条精确配对的 PPG 与 Camera2 数值记录。 */

package com.healthcvapp.acquisition.ppg.model

import com.healthcvapp.acquisition.camera.CameraFrameMetadata

/** 持有可写入双 CSV 的两侧数值，不保留原生帧或 Camera2 对象。 */
data class PPGCaptureRecord(
  /** 当前图像生成的完整 PPG 帧及其全部块均值。 */
  val ppg: PPGFrameRecord,
  /** 与图像传感器时间戳相同的 Camera2 数值结果。 */
  val metadata: CameraFrameMetadata,
)
