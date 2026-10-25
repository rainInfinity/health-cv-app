/** 无绑定地读取相机静态特征，并保留逐项读取状态。 */

package com.healthcvapp.acquisition.ppg.camera

import android.hardware.camera2.CameraCharacteristics
import android.util.Rational
import android.util.Range
import androidx.camera.camera2.interop.Camera2CameraInfo
import com.healthcvapp.acquisition.ppg.model.CameraRational

/** 将 Camera2CameraInfo 的静态元数据转换为纯值快照。 */
internal object Camera2CharacteristicsReader {
  /** 读取主动采集配置校验所需的各项特征，不创建 CameraX 用例。 */
  fun read(cameraInfo: Camera2CameraInfo): CameraCapabilityMetadata {
    val availableCapabilities = readCharacteristic(
      cameraInfo,
      CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES,
    )
    return CameraCapabilityMetadata(
      manualSensor = availableCapabilities.mapValue { values ->
        values?.contains(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR)
      },
      aeModes = readCharacteristic(cameraInfo, CameraCharacteristics.CONTROL_AE_AVAILABLE_MODES)
        .mapValue { it?.toSet() },
      exposureTimeNanos = readCharacteristic(cameraInfo, CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE)
        .mapValue { it?.toCameraRange() },
      iso = readCharacteristic(cameraInfo, CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE)
        .mapValue { it?.toCameraRange() },
      exposureCompensation = readCharacteristic(cameraInfo, CameraCharacteristics.CONTROL_AE_COMPENSATION_RANGE)
        .mapValue { it?.toCameraRange() },
      exposureCompensationStep = readCharacteristic(
        cameraInfo,
        CameraCharacteristics.CONTROL_AE_COMPENSATION_STEP,
      ).mapValue { value -> value?.let { CameraRational(it.numerator, it.denominator) } },
      awbModes = readCharacteristic(cameraInfo, CameraCharacteristics.CONTROL_AWB_AVAILABLE_MODES)
        .mapValue { it?.toSet() },
      afModes = readCharacteristic(cameraInfo, CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES)
        .mapValue { it?.toSet() },
      minimumFocusDistanceDiopters = readCharacteristic(
        cameraInfo,
        CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE,
      ),
      flashAvailable = readCharacteristic(cameraInfo, CameraCharacteristics.FLASH_INFO_AVAILABLE),
      aeLockAvailable = readCharacteristic(cameraInfo, CameraCharacteristics.CONTROL_AE_LOCK_AVAILABLE),
      awbLockAvailable = readCharacteristic(cameraInfo, CameraCharacteristics.CONTROL_AWB_LOCK_AVAILABLE),
    )
  }

  /** 单独捕获字段读取异常，避免一个缺失元数据抹去其他已知能力。 */
  private fun <T> readCharacteristic(
    cameraInfo: Camera2CameraInfo,
    key: CameraCharacteristics.Key<T>,
  ): CameraMetadataValue<T> = try {
    CameraMetadataValue.Read(cameraInfo.getCameraCharacteristic(key))
  } catch (_: SecurityException) {
    CameraMetadataValue.PermissionRequired
  } catch (_: Throwable) {
    CameraMetadataValue.Unknown
  }

  /** 只转换成功读取到的值，传播权限不足与未知状态。 */
  private inline fun <T, R> CameraMetadataValue<T>.mapValue(transform: (T?) -> R?): CameraMetadataValue<R> =
    when (this) {
      is CameraMetadataValue.Read -> CameraMetadataValue.Read(value?.let(transform))
      CameraMetadataValue.PermissionRequired -> CameraMetadataValue.PermissionRequired
      CameraMetadataValue.Unknown -> CameraMetadataValue.Unknown
    }

  /** 将 Android Range 复制为不依赖平台对象的只读边界。 */
  private fun <T> Range<T>.toCameraRange(): CameraMetadataRange<T>
    where T : Number, T : Comparable<T> = CameraMetadataRange(lower, upper)
}
