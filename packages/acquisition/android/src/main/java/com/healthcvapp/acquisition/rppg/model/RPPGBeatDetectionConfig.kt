/** 集中版本化逐搏工程门槛；这些值尚未证明人体测量准确性。 */
package com.healthcvapp.acquisition.rppg.model

/** 所有幅值均沿用同源滤波波形的任意单位，不对输入逐段归一化。 */
internal data class RPPGBeatDetectionConfig(
  /** 改动峰检测或门槛时更新的独立规则版本。 */
  val version: String,
  /** 计算自适应峰谷幅差的有界回看时长，单位纳秒。 */
  val prominenceWindowNanos: Long,
  /** 峰两侧最少下降幅值，同时作为数值退化底线。 */
  val minimumProminence: Double,
  /** 自适应突出度占近期最大峰谷幅差的比例。 */
  val prominenceRangeFraction: Double,
  /** 忽略同一搏动附近的重复峰所用不应期，单位纳秒。 */
  val refractoryNanos: Long,
  /** 两个相邻合格 RR 相对于前一 RR 的最大变化比例。 */
  val maximumIntervalChangeFraction: Double,
  /** 距上个可信峰超过此时长后清空读数与峰历史，单位纳秒。 */
  val resultTimeoutNanos: Long,
  /** 相邻样本时间相对于规则采样周期的最大偏差比例。 */
  val maximumSamplePeriodDeviationFraction: Double,
) {
  init {
    require(version.isNotBlank())
    require(prominenceWindowNanos > 0L)
    require(minimumProminence.isFinite() && minimumProminence > 0.0)
    require(prominenceRangeFraction.isFinite() && prominenceRangeFraction > 0.0 && prominenceRangeFraction <= 1.0)
    require(refractoryNanos > 0L && resultTimeoutNanos > refractoryNanos)
    require(maximumIntervalChangeFraction.isFinite() && maximumIntervalChangeFraction > 0.0 && maximumIntervalChangeFraction < 1.0)
    require(maximumSamplePeriodDeviationFraction.isFinite() && maximumSamplePeriodDeviationFraction >= 0.0 && maximumSamplePeriodDeviationFraction < 1.0)
  }

  companion object {
    /** 待真实输入验证的工程试验值，不是生理学标准。 */
    val EXPERIMENTAL_V1 = RPPGBeatDetectionConfig(
      version = "rppg-beat-experiment-v1",
      prominenceWindowNanos = 2_000_000_000L,
      minimumProminence = 1e-6,
      prominenceRangeFraction = 0.35,
      refractoryNanos = 250_000_000L,
      maximumIntervalChangeFraction = 0.20,
      resultTimeoutNanos = 2_500_000_000L,
      maximumSamplePeriodDeviationFraction = 0.10,
    )
  }
}
