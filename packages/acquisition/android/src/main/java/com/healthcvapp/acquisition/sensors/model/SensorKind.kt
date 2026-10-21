/** 定义首批 Android 默认传感器类型及其固定数据语义。 */

package com.healthcvapp.acquisition.sensors.model

import android.hardware.Sensor

private const val ANDROID_DEVICE_COORDINATES = "android-device"

/** 标识受支持的默认设备传感器、CSV 轴列和物理单位。 */
enum class SensorKind(
  /** Nitro 与文件路径使用的稳定类型标识。 */
  val wireName: String,
  /** 对应的 Android 标准传感器类型。 */
  val androidType: Int,
  /** CSV 中按 X、Y、Z 顺序输出的类型专属轴列。 */
  val axisHeaders: String,
  /** 三轴物理单位的稳定 API 标识。 */
  val unit: String,
  /** Android 自然设备坐标系标识。 */
  val coordinateSystem: String,
) {
  ACCELEROMETER("accelerometer", Sensor.TYPE_ACCELEROMETER, "accX,accY,accZ", "m/s2", ANDROID_DEVICE_COORDINATES),
  GYROSCOPE("gyroscope", Sensor.TYPE_GYROSCOPE, "gyrX,gyrY,gyrZ", "rad/s", ANDROID_DEVICE_COORDINATES),
  MAGNETOMETER("magnetometer", Sensor.TYPE_MAGNETIC_FIELD, "magX,magY,magZ", "uT", ANDROID_DEVICE_COORDINATES),
  GRAVITY("gravity", Sensor.TYPE_GRAVITY, "graX,graY,graZ", "m/s2", ANDROID_DEVICE_COORDINATES);

  companion object {

    /** 从桥接传入的稳定标识解析类型；未知值不会退化为其它传感器。 */
    fun fromWireName(value: String): SensorKind =
      entries.firstOrNull { it.wireName == value }
        ?: throw SensorCaptureFailure("INVALID_SENSOR_KIND", "传感器类型无效：$value")
  }
}
