/** 从真实事件采样率构造 8–24 Hz 因果 Butterworth 带通，不使用未来样本。 */
package com.healthcvapp.acquisition.ppg.bloodpressure.imu

import kotlin.math.PI
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan

/**
 * 二阶低通 Butterworth 原型经带通变换得到四极点、两节 biquad。
 * 此处的“二阶”与 butter(2, [8, 24], bandpass) 的原型阶数一致，
 * 不是把两个一阶滤波器串联冒充 Butterworth，也不是后端的离线 filtfilt／VMD。
 */
internal class ScgButterworthBandpass {
  private val first = Biquad()
  private val second = Biquad()

  fun configure(sampleRateHz: Double) {
    require(sampleRateHz.isFinite() && sampleRateHz > HIGH_HZ * 2.0)
    val low = tan(PI * LOW_HZ / sampleRateHz)
    val high = tan(PI * HIGH_HZ / sampleRateHz)
    val bandwidth = high - low
    val centerSquared = low * high
    val poleReal = -bandwidth / sqrt(2.0)
    val poleImaginary = bandwidth / sqrt(2.0)
    val discriminantReal = poleReal * poleReal - poleImaginary * poleImaginary - 4.0 * centerSquared
    val discriminantImaginary = 2.0 * poleReal * poleImaginary
    val discriminantNorm = hypot(discriminantReal, discriminantImaginary)
    val rootReal = sqrt(((discriminantNorm + discriminantReal) / 2.0).coerceAtLeast(0.0))
    val rootImaginary = -sqrt(((discriminantNorm - discriminantReal) / 2.0).coerceAtLeast(0.0))
    val centerOmega = 2.0 * atan(sqrt(centerSquared))
    first.configure((poleReal + rootReal) / 2.0, (poleImaginary + rootImaginary) / 2.0, centerOmega)
    second.configure((poleReal - rootReal) / 2.0, (poleImaginary - rootImaginary) / 2.0, centerOmega)
  }

  fun process(value: Double): Double = second.process(first.process(value))

  fun reset() {
    first.reset()
    second.reset()
  }

  private class Biquad {
    private var b0 = 0.0
    private var a1 = 0.0
    private var a2 = 0.0
    private var state1 = 0.0
    private var state2 = 0.0

    fun configure(poleReal: Double, poleImaginary: Double, centerOmega: Double) {
      val normSquared = poleReal * poleReal + poleImaginary * poleImaginary
      val denominator = 1.0 - 2.0 * poleReal + normSquared
      a1 = 2.0 * (normSquared - 1.0) / denominator
      a2 = (1.0 + 2.0 * poleReal + normSquared) / denominator
      val real = 1.0 + a1 * cos(centerOmega) + a2 * cos(2.0 * centerOmega)
      val imaginary = -a1 * sin(centerOmega) - a2 * sin(2.0 * centerOmega)
      b0 = hypot(real, imaginary) / (2.0 * sin(centerOmega))
      reset()
    }

    fun process(input: Double): Double {
      val output = b0 * input + state1
      state1 = -a1 * output + state2
      state2 = -b0 * input - a2 * output
      return output
    }

    fun reset() {
      state1 = 0.0
      state2 = 0.0
    }
  }

  companion object {
    const val LOW_HZ = 8.0
    const val HIGH_HZ = 24.0
  }
}
