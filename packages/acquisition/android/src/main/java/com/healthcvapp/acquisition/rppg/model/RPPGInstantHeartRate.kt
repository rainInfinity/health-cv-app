/** 同源滤波波形上最新一个合格 RR 的实时初步读数，不代表频谱或医学结论。 */
package com.healthcvapp.acquisition.rppg.model

/** 峰与间隔均使用采集时钟；只在新合格搏动时创建，不逐样本分配。 */
internal data class RPPGInstantHeartRate(
  /** 所属连续有效信号片段，不能跨片段配对峰。 */
  val segmentIndex: Long,
  /** 前一个可信峰的传感器采集时间，单位纳秒。 */
  val previousPeakTimestampNanos: Long,
  /** 当前可信峰的传感器采集时间，单位纳秒。 */
  val peakTimestampNanos: Long,
  /** 两峰的实际采集时间差，单位纳秒。 */
  val intervalNanos: Long,
  /** 最新一个合格间隔对应的初步心率，单位 bpm。 */
  val heartRateBpm: Double,
) : RPPGSessionRecord() {
  init {
    require(segmentIndex >= 0L) { "逐搏片段序号不能为负。" }
    require(previousPeakTimestampNanos >= 0L && peakTimestampNanos > previousPeakTimestampNanos) {
      "逐搏峰时间必须为递增的绝对传感器纳秒。"
    }
    require(intervalNanos == peakTimestampNanos - previousPeakTimestampNanos) {
      "逐搏间隔必须等于两峰时间差。"
    }
    require(heartRateBpm.isFinite() && heartRateBpm > 0.0) { "逐搏心率必须是有限正数。" }
  }
}
