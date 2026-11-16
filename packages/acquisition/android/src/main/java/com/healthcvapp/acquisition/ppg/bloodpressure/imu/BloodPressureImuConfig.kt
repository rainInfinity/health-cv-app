/** 血压工程准入的固定本地基线；不代表通用人体标定或医学质量。 */
package com.healthcvapp.acquisition.ppg.bloodpressure.imu

/**
 * 参数版本 scg-local-engineering-v1；仅用于本机工程准入，不承诺其他设备、人群或医学效果。
 * 噪声参考、能量倍数、两级相关门槛、包络变异门槛及建立段采用固定基线，不提供用户调参入口。
 * 固定的 30°、稳定窗口／持续时间及 8–24 Hz 频带不属于本组参数调节项。
 */
internal data class BloodPressureImuConfig(
  val scgNoiseReferenceRms: Double = 0.005,
  val scgEnergyAboveNoiseFactor: Double = 16.0,
  val scgEnvelopeCorrelationThreshold: Double = 0.65,
  val scgSecondRepetitionThreshold: Double = 0.45,
  val scgMinimumEnvelopeVariation: Double = 0.15,
  val scgFilterSettlingNanos: Long = 1_000_000_000L,
) {
  init {
    require(scgNoiseReferenceRms.isFinite() && scgNoiseReferenceRms > 0.0)
    require(scgEnergyAboveNoiseFactor.isFinite() && scgEnergyAboveNoiseFactor > 1.0)
    require(scgEnvelopeCorrelationThreshold > 0.0 && scgEnvelopeCorrelationThreshold <= 1.0)
    require(scgSecondRepetitionThreshold > 0.0 && scgSecondRepetitionThreshold <= 1.0)
    require(scgMinimumEnvelopeVariation.isFinite() && scgMinimumEnvelopeVariation > 0.0)
    require(scgFilterSettlingNanos > 0L)
  }
}

/** 仅供原生轮次读取的低频事实；不包含原始或滤波后的样本。 */
internal data class ImuAdmissionSnapshot(
  val tiltDegrees: Double?,
  val stable: Boolean?,
  val scgCandidate: Boolean?,
  val fresh: Boolean,
  val admitted: Boolean,
  /** 原始量纲的滤后均方能量，单位 m²/s⁴；尚未形成完整窗口时未知。 */
  val scgEnergyMeanSquare: Double? = null,
  /** 包络去均值后的首个重复峰相关值，仅为原生诊断。 */
  val scgRepetition: Double? = null,
  val accelerometerRateHz: Double? = null,
)
