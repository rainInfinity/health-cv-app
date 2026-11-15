/** 从正式配对的固定红通道生成按真实时间采样的指尖展示信号。 */
package com.healthcvapp.acquisition.ppg.fingertip

import kotlin.math.PI
import kotlin.math.exp

/** 单点保留真实相对时间与连续片段；不填补缺失样点。 */
internal data class FingertipPulsePoint(
  /** 连续片段序号；缺口或无效输入后递增。 */
  val segmentId: Long,
  /** 相对正式首帧的真实相机时间，单位毫秒。 */
  val timeMillis: Double,
  /** 去直流及带通后的幅值，任意单位。 */
  val value: Double,
)

/** 去直流后串联 0.75Hz 高通与 3Hz 低通，所有系数均由真实 dt 得到。 */
internal class FingertipPulseProcessor {
  private var origin: Long? = null
  private var previous: Long? = null
  private var segmentStart = 0L
  private var previousInput = 0.0
  private var highpass = 0.0
  private var lowpass = 0.0
  private var segment = -1L

  /** 时间戳取精确配对后的相机时间，原点为正式首帧（含启动排除区间）。 */
  fun process(timestampNanos: Long, input: Double, coverageUsable: Boolean): FingertipPulsePoint? {
    if (origin == null) origin = timestampNanos
    val last = previous
    if (!coverageUsable || !input.isFinite() || (last != null && timestampNanos <= last)) {
      resetSegment()
      return null
    }
    if (last == null || timestampNanos - last > FingertipCoverageGate.FRESH_NANOS) {
      segment++
      segmentStart = timestampNanos
      previous = timestampNanos
      previousInput = input
      highpass = 0.0
      lowpass = 0.0
      return null
    }
    val dt = (timestampNanos - last) / 1_000_000_000.0
    val highDecay = exp(-2.0 * PI * FingertipSignalConfig.BANDPASS_LOW_HZ * dt)
    highpass = highDecay * (highpass + input - previousInput)
    lowpass += (1.0 - exp(-2.0 * PI * FingertipSignalConfig.BANDPASS_HIGH_HZ * dt)) * (highpass - lowpass)
    previousInput = input
    previous = timestampNanos
    if (timestampNanos - segmentStart < 1_000_000_000L) return null
    if (highpass == 0.0 && lowpass == 0.0) return null
    return FingertipPulsePoint(segment, (timestampNanos - origin!!) / 1_000_000.0, lowpass)
  }

  /** 无覆盖时不允许后续样点延续旧滤波状态。 */
  private fun resetSegment() { previous = null; highpass = 0.0; lowpass = 0.0 }
}
