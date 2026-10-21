/** 验证请求采样间隔并记录 Android 实际注册参数。 */

package com.healthcvapp.acquisition.sensors.model

/** 保存单一传感器会话的请求与注册采样间隔。 */
class SensorConfig private constructor(
  /** 本次配置所属的默认设备传感器类型。 */
  val kind: SensorKind,
  /** 调用方请求的整数微秒间隔。 */
  val requestedSamplingPeriodMicros: Int,
  /** 传给 Android 注册接口的整数微秒间隔。 */
  val registeredSamplingPeriodMicros: Int,
) {
  /** 根据设备最小间隔生成最终注册配置；非正 minDelay 不限制请求。 */
  fun withSensorMinDelay(minDelayMicros: Int): SensorConfig = SensorConfig(
    kind = kind,
    requestedSamplingPeriodMicros = requestedSamplingPeriodMicros,
    registeredSamplingPeriodMicros = maxOf(
      requestedSamplingPeriodMicros,
      MIN_SAMPLING_PERIOD_MICROS,
      minDelayMicros.takeIf { it > 0 } ?: MIN_SAMPLING_PERIOD_MICROS,
    ),
  )

  companion object {
    const val MIN_SAMPLING_PERIOD_MICROS = 5_000
    const val MAX_SAMPLING_PERIOD_MICROS = 1_000_000

    /** 校验外部类型与微秒数值，不读取设备或创建采集资源。 */
    fun fromRequest(kindName: String, samplingPeriodMicros: Double): SensorConfig {
      val kind = SensorKind.fromWireName(kindName)
      if (
        !samplingPeriodMicros.isFinite()
        || samplingPeriodMicros % 1.0 != 0.0
        || samplingPeriodMicros < MIN_SAMPLING_PERIOD_MICROS
        || samplingPeriodMicros > MAX_SAMPLING_PERIOD_MICROS
      ) {
        throw SensorCaptureFailure(
          "INVALID_SENSOR_CONFIG",
          "采样间隔必须是 5,000 至 1,000,000 微秒范围内的整数。",
        )
      }

      val requested = samplingPeriodMicros.toInt()
      return SensorConfig(
        kind = kind,
        requestedSamplingPeriodMicros = requested,
        registeredSamplingPeriodMicros = maxOf(requested, MIN_SAMPLING_PERIOD_MICROS),
      )
    }
  }
}
