/** 保存主动 PPG 配对与旧版 frame.csv 所需的 Camera2 数值。 */

package com.healthcvapp.acquisition.ppg.camera

/** 仅保留逐帧关联和 CSV 协议需要的相机完成结果。 */
data class CameraFrameMetadata(
  /** 拍摄结果回调时读取的 elapsedRealtime，单位纳秒。 */
  val timestampElapsedNanos: Long,
  /** Camera2 传感器时间戳；缺失时为空，不能用于帧配对。 */
  val timestampFrameNanos: Long?,
  /** 拍摄结果回调时读取的 System.nanoTime，单位纳秒。 */
  val timestampSystemNanos: Long,
  /** Camera2 实际曝光时长，单位纳秒；缺失时为 0。 */
  val exposureTimeNanos: Long,
  /** Camera2 实际帧时长，单位纳秒；缺失时为 0。 */
  val durationTimeNanos: Long,
  /** Camera2 实际滚动快门时长，单位纳秒；缺失时为 0。 */
  val rollingShutterSkewTimeNanos: Long,
  /** Camera2 实际 ISO 整数值；缺失时为 0。 */
  val iso: Int,
  /** Camera2 实际白平衡模式整数值；缺失时为 0。 */
  val whiteBalanceMode: Int,
) {
  companion object {
    /** 从 Camera2 完成结果构造旧协议字段，并为缺失的可选结果保留零值。 */
    internal fun fromCaptureResult(
      timestampElapsedNanos: Long,
      timestampFrameNanos: Long?,
      timestampSystemNanos: Long,
      exposureTimeNanos: Long?,
      durationTimeNanos: Long?,
      rollingShutterSkewTimeNanos: Long?,
      iso: Int?,
      whiteBalanceMode: Int?,
    ) = CameraFrameMetadata(
      timestampElapsedNanos = timestampElapsedNanos,
      timestampFrameNanos = timestampFrameNanos,
      timestampSystemNanos = timestampSystemNanos,
      exposureTimeNanos = exposureTimeNanos ?: 0L,
      durationTimeNanos = durationTimeNanos ?: 0L,
      rollingShutterSkewTimeNanos = rollingShutterSkewTimeNanos ?: 0L,
      iso = iso ?: 0,
      whiteBalanceMode = whiteBalanceMode ?: 0,
    )
  }
}
