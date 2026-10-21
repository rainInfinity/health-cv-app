/** 保存脱离 Android SensorEvent 生命周期的传感器数值与时间快照。 */

package com.healthcvapp.acquisition.sensors.model

/** 表示一条已复制且通过有限数值校验的三轴样本。 */
data class SensorSample(
  /** 回调接受时间，使用 elapsedRealtimeNanos 单调时钟。 */
  val receivedAtElapsedNanos: Long,
  /** Android SensorEvent 提供的原始单调事件时间。 */
  val eventTimestampNanos: Long,
  /** 回调时读取的 System.nanoTime 单调时间。 */
  val systemTimestampNanos: Long,
  /** 自然设备坐标系中的 X 轴原始值。 */
  val x: Float,
  /** 自然设备坐标系中的 Y 轴原始值。 */
  val y: Float,
  /** 自然设备坐标系中的 Z 轴原始值。 */
  val z: Float,
) {
  init {
    if (receivedAtElapsedNanos < 0L || eventTimestampNanos <= 0L) {
      throw SensorCaptureFailure("SENSOR_DATA_INVALID", "传感器事件时间无效。")
    }
    if (!x.isFinite() || !y.isFinite() || !z.isFinite()) {
      throw SensorCaptureFailure("SENSOR_DATA_INVALID", "传感器三轴数值必须为有限值。")
    }
  }
}
