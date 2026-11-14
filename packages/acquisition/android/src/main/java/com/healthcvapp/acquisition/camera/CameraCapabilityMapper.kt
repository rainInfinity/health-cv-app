/** 将 Camera2 静态元数据归一化为带未知状态的相机能力。 */

package com.healthcvapp.acquisition.camera

import android.hardware.camera2.CaptureRequest
import android.hardware.camera2.CameraCharacteristics
import com.healthcvapp.acquisition.camera.model.CameraBooleanCapability
import com.healthcvapp.acquisition.camera.model.CameraCapabilities
import com.healthcvapp.acquisition.camera.model.CameraCapabilityStatus
import com.healthcvapp.acquisition.camera.model.CameraModeCapability
import com.healthcvapp.acquisition.camera.model.CameraNumberRange
import com.healthcvapp.acquisition.camera.model.CameraNumericCapability
import com.healthcvapp.acquisition.camera.model.CameraRational

/** 表示 Camera2 元数据的单项读取状态，区分权限不足与元数据缺失。 */
internal sealed class CameraMetadataValue<out T> {
  /** 表示成功读取；字段本身可缺失。 */
  data class Read<T>(val value: T?) : CameraMetadataValue<T>()

  /** 表示系统明确因相机权限阻止读取。 */
  object PermissionRequired : CameraMetadataValue<Nothing>()

  /** 表示读取异常或元数据无法确定。 */
  object Unknown : CameraMetadataValue<Nothing>()
}

/** 表示从 Camera2 元数据读出的通用数值范围。 */
internal data class CameraMetadataRange<T : Number>(
  /** 设备报告的范围下界。 */
  val lower: T,
  /** 设备报告的范围上界。 */
  val upper: T,
)

/** 汇总映射器所需的 Camera2 原始值；不持有设备或相机会话。 */
internal data class CameraCapabilityMetadata(
  /** 是否明确支持 MANUAL_SENSOR。 */
  val manualSensor: CameraMetadataValue<Boolean>,
  /** 自动曝光模式常量集合。 */
  val aeModes: CameraMetadataValue<Set<Int>>,
  /** 曝光时间范围，单位纳秒。 */
  val exposureTimeNanos: CameraMetadataValue<CameraMetadataRange<Long>>,
  /** ISO 感光度范围。 */
  val iso: CameraMetadataValue<CameraMetadataRange<Int>>,
  /** 曝光补偿索引范围。 */
  val exposureCompensation: CameraMetadataValue<CameraMetadataRange<Int>>,
  /** 曝光补偿对应的 EV 有理数步长。 */
  val exposureCompensationStep: CameraMetadataValue<CameraRational>,
  /** 自动白平衡模式常量集合。 */
  val awbModes: CameraMetadataValue<Set<Int>>,
  /** 自动对焦模式常量集合。 */
  val afModes: CameraMetadataValue<Set<Int>>,
  /** 最近对焦距离，单位屈光度。 */
  val minimumFocusDistanceDiopters: CameraMetadataValue<Float>,
  /** 设备是否具备闪光灯硬件。 */
  val flashAvailable: CameraMetadataValue<Boolean>,
  /** 设备是否支持 AE 锁。 */
  val aeLockAvailable: CameraMetadataValue<Boolean>,
  /** 设备是否支持 AWB 锁。 */
  val awbLockAvailable: CameraMetadataValue<Boolean>,
)

/** 将硬件元数据映射成 JS 与配置校验共用的能力模型。 */
internal object CameraCapabilityMapper {
  private val exposureModeNames = listOf("auto", "manual")
  private val whiteBalanceModeNames = listOf(
    "auto",
    "off",
    "incandescent",
    "fluorescent",
    "warm-fluorescent",
    "daylight",
    "cloudy-daylight",
    "twilight",
    "shade",
  )
  private val focusModeNames = listOf("auto", "off", "manual")

  /** 将单个逻辑相机的静态元数据转为明确的支持状态、范围及模式。 */
  fun map(cameraId: String, metadata: CameraCapabilityMetadata): CameraCapabilities = CameraCapabilities(
    cameraId = cameraId,
    exposureModes = exposureModes(metadata.aeModes, metadata.manualSensor),
    exposureTimeNanos = manualNumeric(metadata.manualSensor, metadata.exposureTimeNanos),
    iso = manualNumeric(metadata.manualSensor, metadata.iso),
    exposureCompensationIndex = numeric(
      metadata.exposureCompensation,
      metadata.exposureCompensationStep,
    ),
    whiteBalanceModes = enumModes(
      metadata.awbModes,
      whiteBalanceModeNames,
      mapOf(
        "auto" to CaptureRequest.CONTROL_AWB_MODE_AUTO,
        "off" to CaptureRequest.CONTROL_AWB_MODE_OFF,
        "incandescent" to CaptureRequest.CONTROL_AWB_MODE_INCANDESCENT,
        "fluorescent" to CaptureRequest.CONTROL_AWB_MODE_FLUORESCENT,
        "warm-fluorescent" to CaptureRequest.CONTROL_AWB_MODE_WARM_FLUORESCENT,
        "daylight" to CaptureRequest.CONTROL_AWB_MODE_DAYLIGHT,
        "cloudy-daylight" to CaptureRequest.CONTROL_AWB_MODE_CLOUDY_DAYLIGHT,
        "twilight" to CaptureRequest.CONTROL_AWB_MODE_TWILIGHT,
        "shade" to CaptureRequest.CONTROL_AWB_MODE_SHADE,
      ),
    ),
    focusModes = focusModes(metadata.afModes, metadata.minimumFocusDistanceDiopters),
    focusDistanceDiopters = focusDistance(metadata.afModes, metadata.minimumFocusDistanceDiopters),
    torch = boolean(metadata.flashAvailable, "设备未提供闪光灯能力元数据。"),
    aeLock = boolean(metadata.aeLockAvailable, "设备未提供 AE 锁定能力元数据。"),
    awbLock = boolean(metadata.awbLockAvailable, "设备未提供 AWB 锁定能力元数据。"),
  )

  /** 根据设备明确支持的 AE 模式及 MANUAL_SENSOR 能力区分未知与不支持。 */
  private fun exposureModes(
    aeModes: CameraMetadataValue<Set<Int>>,
    manualSensor: CameraMetadataValue<Boolean>,
  ): CameraModeCapability {
    when (aeModes) {
      CameraMetadataValue.PermissionRequired -> return unavailableModes(
        CameraCapabilityStatus.PERMISSION_REQUIRED,
        exposureModeNames,
        "读取曝光模式需要相机权限。",
      )
      CameraMetadataValue.Unknown -> return unavailableModes(
        CameraCapabilityStatus.UNKNOWN,
        exposureModeNames,
        "无法读取设备曝光模式。",
      )
      is CameraMetadataValue.Read -> if (aeModes.value == null) return unavailableModes(
        CameraCapabilityStatus.UNKNOWN,
        exposureModeNames,
        "设备未提供曝光模式元数据。",
      )
    }

    val availableModes = (aeModes as CameraMetadataValue.Read).value.orEmpty()
    val supported = ArrayList<String>(2)
    val unknown = ArrayList<String>(1)
    if (CaptureRequest.CONTROL_AE_MODE_ON in availableModes) supported.add("auto")

    if (CaptureRequest.CONTROL_AE_MODE_OFF in availableModes) {
      when (manualSensor) {
        is CameraMetadataValue.Read -> when (manualSensor.value) {
          true -> supported.add("manual")
          false -> Unit
          null -> unknown.add("manual")
        }
        CameraMetadataValue.PermissionRequired,
        CameraMetadataValue.Unknown -> unknown.add("manual")
      }
    }

    val status = when {
      supported.isNotEmpty() -> CameraCapabilityStatus.SUPPORTED
      unknown.isNotEmpty() && manualSensor == CameraMetadataValue.PermissionRequired ->
        CameraCapabilityStatus.PERMISSION_REQUIRED
      unknown.isNotEmpty() -> CameraCapabilityStatus.UNKNOWN
      else -> CameraCapabilityStatus.UNSUPPORTED
    }
    return CameraModeCapability(
      status = status,
      modes = supported,
      unknownModes = unknown,
      reason = when (status) {
        CameraCapabilityStatus.UNSUPPORTED -> "设备不支持可提交的曝光模式。"
        CameraCapabilityStatus.PERMISSION_REQUIRED -> "读取手动曝光能力需要相机权限。"
        CameraCapabilityStatus.UNKNOWN -> "设备未提供完整曝光模式元数据。"
        CameraCapabilityStatus.SUPPORTED -> null
      },
    )
  }

  /** 将已知的枚举集合映射为语义模式，缺失元数据保留为未知。 */
  private fun enumModes(
    availableModes: CameraMetadataValue<Set<Int>>,
    names: List<String>,
    values: Map<String, Int>,
  ): CameraModeCapability {
    return when (availableModes) {
      CameraMetadataValue.PermissionRequired -> unavailableModes(
        CameraCapabilityStatus.PERMISSION_REQUIRED,
        names,
        "读取相机模式需要相机权限。",
      )
      CameraMetadataValue.Unknown -> unavailableModes(
        CameraCapabilityStatus.UNKNOWN,
        names,
        "无法读取设备模式元数据。",
      )
      is CameraMetadataValue.Read -> {
        val modes = availableModes.value
        if (modes == null) {
          unavailableModes(CameraCapabilityStatus.UNKNOWN, names, "设备未提供模式元数据。")
        } else {
          val supported = names.filter { name -> values[name] in modes }
          CameraModeCapability(
            status = if (supported.isEmpty()) CameraCapabilityStatus.UNSUPPORTED else CameraCapabilityStatus.SUPPORTED,
            modes = supported,
            unknownModes = emptyList(),
            reason = if (supported.isEmpty()) "设备未报告可用的对应模式。" else null,
          )
        }
      }
    }
  }

  /** 根据 AF 与镜头最近对焦距离分别判定自动、关闭和手动对焦。 */
  private fun focusModes(
    availableModes: CameraMetadataValue<Set<Int>>,
    minimumFocusDistance: CameraMetadataValue<Float>,
  ): CameraModeCapability {
    if (availableModes == CameraMetadataValue.PermissionRequired) {
      return unavailableModes(CameraCapabilityStatus.PERMISSION_REQUIRED, focusModeNames, "读取对焦模式需要相机权限。")
    }
    if (availableModes == CameraMetadataValue.Unknown) {
      return unavailableModes(CameraCapabilityStatus.UNKNOWN, focusModeNames, "无法读取设备对焦模式。")
    }
    val modes = (availableModes as CameraMetadataValue.Read).value
      ?: return unavailableModes(CameraCapabilityStatus.UNKNOWN, focusModeNames, "设备未提供对焦模式元数据。")

    val supported = ArrayList<String>(3)
    val unknown = ArrayList<String>(1)
    if (
      CaptureRequest.CONTROL_AF_MODE_AUTO in modes
      || CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE in modes
      || CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO in modes
    ) {
      supported.add("auto")
    }
    val manualFocusAvailable = CaptureRequest.CONTROL_AF_MODE_OFF in modes
    if (manualFocusAvailable) supported.add("off")
    when {
      !manualFocusAvailable -> Unit
      minimumFocusDistance is CameraMetadataValue.Read && minimumFocusDistance.value != null -> {
        val distance = minimumFocusDistance.value
        if (distance.isFinite() && distance > 0f) supported.add("manual")
      }
      minimumFocusDistance == CameraMetadataValue.PermissionRequired -> unknown.add("manual")
      else -> unknown.add("manual")
    }

    val status = when {
      supported.isNotEmpty() -> CameraCapabilityStatus.SUPPORTED
      unknown.isNotEmpty() && minimumFocusDistance == CameraMetadataValue.PermissionRequired ->
        CameraCapabilityStatus.PERMISSION_REQUIRED
      unknown.isNotEmpty() -> CameraCapabilityStatus.UNKNOWN
      else -> CameraCapabilityStatus.UNSUPPORTED
    }
    return CameraModeCapability(
      status = status,
      modes = supported,
      unknownModes = unknown,
      reason = when (status) {
        CameraCapabilityStatus.UNSUPPORTED -> "设备未报告可用的对焦模式。"
        CameraCapabilityStatus.PERMISSION_REQUIRED -> "读取手动对焦能力需要相机权限。"
        CameraCapabilityStatus.UNKNOWN -> "设备未提供完整对焦模式元数据。"
        CameraCapabilityStatus.SUPPORTED -> null
      },
    )
  }

  /** 仅在设备允许 AF_OFF 且镜头具有可调行程时返回屈光度范围。 */
  private fun focusDistance(
    availableModes: CameraMetadataValue<Set<Int>>,
    minimumFocusDistance: CameraMetadataValue<Float>,
  ): CameraNumericCapability {
    if (availableModes == CameraMetadataValue.PermissionRequired) return unavailableNumeric(
      CameraCapabilityStatus.PERMISSION_REQUIRED,
      "读取对焦模式需要相机权限。",
    )
    if (availableModes == CameraMetadataValue.Unknown) return unavailableNumeric(
      CameraCapabilityStatus.UNKNOWN,
      "无法读取设备对焦模式。",
    )
    val modes = (availableModes as CameraMetadataValue.Read).value
      ?: return unavailableNumeric(CameraCapabilityStatus.UNKNOWN, "设备未提供对焦模式元数据。")
    if (CaptureRequest.CONTROL_AF_MODE_OFF !in modes) {
      return unavailableNumeric(CameraCapabilityStatus.UNSUPPORTED, "设备不支持关闭 AF 的手动对焦控制。")
    }
    return when (minimumFocusDistance) {
      CameraMetadataValue.PermissionRequired -> unavailableNumeric(
        CameraCapabilityStatus.PERMISSION_REQUIRED,
        "读取手动对焦距离需要相机权限。",
      )
      CameraMetadataValue.Unknown -> unavailableNumeric(CameraCapabilityStatus.UNKNOWN, "无法读取镜头对焦距离。")
      is CameraMetadataValue.Read -> when (val distance = minimumFocusDistance.value) {
        null -> unavailableNumeric(CameraCapabilityStatus.UNKNOWN, "设备未提供镜头对焦距离。")
        else -> if (distance.isFinite() && distance > 0f) {
          CameraNumericCapability(
            status = CameraCapabilityStatus.SUPPORTED,
            range = CameraNumberRange(0.0, distance.toDouble()),
            reason = null,
          )
        } else if (distance == 0f) {
          unavailableNumeric(CameraCapabilityStatus.UNSUPPORTED, "镜头为固定焦距，不支持手动距离。")
        } else {
          unavailableNumeric(CameraCapabilityStatus.UNKNOWN, "设备报告的镜头对焦距离无效。")
        }
      }
    }
  }

  /** 只有明确具备手动传感器能力时才返回曝光时间或 ISO 范围。 */
  private fun <T : Number> manualNumeric(
    manualSensor: CameraMetadataValue<Boolean>,
    range: CameraMetadataValue<CameraMetadataRange<T>>,
  ): CameraNumericCapability = when (manualSensor) {
    CameraMetadataValue.PermissionRequired -> unavailableNumeric(
      CameraCapabilityStatus.PERMISSION_REQUIRED,
      "读取手动传感器能力需要相机权限。",
    )
    CameraMetadataValue.Unknown -> unavailableNumeric(CameraCapabilityStatus.UNKNOWN, "无法确认手动传感器能力。")
    is CameraMetadataValue.Read -> when (manualSensor.value) {
      false -> unavailableNumeric(CameraCapabilityStatus.UNSUPPORTED, "设备不支持手动传感器控制。")
      null -> unavailableNumeric(CameraCapabilityStatus.UNKNOWN, "设备未提供手动传感器能力元数据。")
      true -> numericRange(range, null)
    }
  }

  /** 映射曝光补偿范围，并只在步长可读取时返回 EV 有理数。 */
  private fun numeric(
    range: CameraMetadataValue<CameraMetadataRange<Int>>,
    step: CameraMetadataValue<CameraRational>,
  ): CameraNumericCapability {
    return when (range) {
      CameraMetadataValue.PermissionRequired -> unavailableNumeric(
        CameraCapabilityStatus.PERMISSION_REQUIRED,
        "读取曝光补偿范围需要相机权限。",
      )
      CameraMetadataValue.Unknown -> unavailableNumeric(CameraCapabilityStatus.UNKNOWN, "无法读取曝光补偿范围。")
      is CameraMetadataValue.Read -> {
        val value = range.value
        if (value == null) {
          unavailableNumeric(CameraCapabilityStatus.UNKNOWN, "设备未提供曝光补偿范围。")
        } else if (value.lower > value.upper) {
          unavailableNumeric(CameraCapabilityStatus.UNKNOWN, "设备报告的曝光补偿范围无效。")
        } else {
          val knownStep = when (step) {
            is CameraMetadataValue.Read -> step.value?.takeIf { it.denominator > 0 && it.numerator > 0 }
            else -> null
          }
          CameraNumericCapability(
            status = CameraCapabilityStatus.SUPPORTED,
            range = CameraNumberRange(value.lower.toDouble(), value.upper.toDouble(), knownStep),
            reason = when (step) {
              CameraMetadataValue.PermissionRequired -> "读取曝光补偿 EV 步长需要相机权限。"
              CameraMetadataValue.Unknown -> "无法读取曝光补偿 EV 步长。"
              is CameraMetadataValue.Read ->
                if (step.value == null || knownStep == null) "设备未提供有效 EV 步长。" else null
            },
          )
        }
      }
    }
  }

  /** 将已读区间转换为数字能力，并拒绝倒置或非有限的元数据。 */
  private fun <T : Number> numericRange(
    range: CameraMetadataValue<CameraMetadataRange<T>>,
    step: CameraRational?,
  ): CameraNumericCapability {
    return when (range) {
      CameraMetadataValue.PermissionRequired -> unavailableNumeric(
        CameraCapabilityStatus.PERMISSION_REQUIRED,
        "读取设备数值范围需要相机权限。",
      )
      CameraMetadataValue.Unknown -> unavailableNumeric(CameraCapabilityStatus.UNKNOWN, "无法读取设备数值范围。")
      is CameraMetadataValue.Read -> {
        val value = range.value
        if (value == null) {
          unavailableNumeric(CameraCapabilityStatus.UNKNOWN, "设备未提供数值范围。")
        } else {
          val minimum = value.lower.toDouble()
          val maximum = value.upper.toDouble()
          if (!minimum.isFinite() || !maximum.isFinite() || minimum > maximum) {
            unavailableNumeric(CameraCapabilityStatus.UNKNOWN, "设备报告的数值范围无效。")
          } else {
            CameraNumericCapability(
              status = CameraCapabilityStatus.SUPPORTED,
              range = CameraNumberRange(minimum, maximum, step),
              reason = null,
            )
          }
        }
      }
    }
  }

  /** 将 Camera2 布尔元数据转换为支持、不支持、权限不足或未知。 */
  private fun boolean(value: CameraMetadataValue<Boolean>, missingReason: String): CameraBooleanCapability = when (value) {
    CameraMetadataValue.PermissionRequired -> CameraBooleanCapability(
      CameraCapabilityStatus.PERMISSION_REQUIRED,
      null,
      "读取该能力需要相机权限。",
    )
    CameraMetadataValue.Unknown -> CameraBooleanCapability(CameraCapabilityStatus.UNKNOWN, null, missingReason)
    is CameraMetadataValue.Read -> when (value.value) {
      true -> CameraBooleanCapability(CameraCapabilityStatus.SUPPORTED, true, null)
      false -> CameraBooleanCapability(CameraCapabilityStatus.UNSUPPORTED, false, "设备明确报告不支持。")
      null -> CameraBooleanCapability(CameraCapabilityStatus.UNKNOWN, null, missingReason)
    }
  }

  /** 为完全不可查询的模式生成逐项未知列表。 */
  private fun unavailableModes(
    status: CameraCapabilityStatus,
    names: List<String>,
    reason: String,
  ) = CameraModeCapability(status, null, names, reason)

  /** 为未知或不支持的数值项生成不伪造范围的结果。 */
  private fun unavailableNumeric(status: CameraCapabilityStatus, reason: String) =
    CameraNumericCapability(status, null, reason)
}
