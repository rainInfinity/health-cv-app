/** 在 Nitro 边界转换不可变相机配置、实际帧摘要和锁定状态。 */

package com.margelo.nitro.acquisition

import com.healthcvapp.acquisition.camera.model.CameraConfig as ModelCameraConfig
import com.healthcvapp.acquisition.camera.model.CameraConfigAdjustment as ModelCameraConfigAdjustment
import com.healthcvapp.acquisition.camera.model.CameraExposureConfig as ModelCameraExposureConfig
import com.healthcvapp.acquisition.camera.model.CameraExposureMode as ModelCameraExposureMode
import com.healthcvapp.acquisition.camera.model.CameraFocusConfig as ModelCameraFocusConfig
import com.healthcvapp.acquisition.camera.model.CameraFocusMode as ModelCameraFocusMode
import com.healthcvapp.acquisition.camera.model.CameraFrameCrop as ModelCameraFrameCrop
import com.healthcvapp.acquisition.camera.model.CameraFrameGeometry as ModelCameraFrameGeometry
import com.healthcvapp.acquisition.camera.model.CameraLockPhase as ModelCameraLockPhase
import com.healthcvapp.acquisition.camera.model.CameraLockStatus as ModelCameraLockStatus
import com.healthcvapp.acquisition.camera.model.CameraResolution as ModelCameraResolution
import com.healthcvapp.acquisition.camera.model.CameraWhiteBalanceConfig as ModelCameraWhiteBalanceConfig
import com.healthcvapp.acquisition.camera.model.CameraWhiteBalanceMode as ModelCameraWhiteBalanceMode
import com.healthcvapp.acquisition.ppg.model.CameraBlockLayout as ModelCameraBlockLayout
import com.healthcvapp.acquisition.ppg.model.PPGConfig as ModelPPGConfig
import com.healthcvapp.acquisition.ppg.model.PPGConfigSummary as ModelPPGConfigSummary
import com.margelo.nitro.core.NullType

/** 将 JS 配置拆分为共用设备配置和原始 PPG 网格。 */
internal fun CameraConfig.toModel(): ModelPPGConfig = ModelPPGConfig(
  cameraConfig = ModelCameraConfig(
    cameraId = cameraId,
    targetResolution = ModelCameraResolution(targetResolution.width, targetResolution.height),
    targetFps = targetFps,
    torchEnabled = torchEnabled,
    exposure = ModelCameraExposureConfig(
      mode = exposure.mode.toModel(),
      compensationIndex = exposure.compensationIndex?.asSecondOrNull(),
      timeNanos = exposure.timeNanos?.asSecondOrNull(),
      iso = exposure.iso?.asSecondOrNull(),
      locked = exposure.locked,
    ),
    whiteBalance = ModelCameraWhiteBalanceConfig(
      mode = whiteBalance.mode.toModel(),
      locked = whiteBalance.locked,
    ),
    focus = ModelCameraFocusConfig(
      mode = focus.mode.toModel(),
      distanceDiopters = focus.distanceDiopters?.asSecondOrNull(),
    ),
  ),
  blockLayout = ModelCameraBlockLayout.fromBlocks(processing.blocks),
)

/** 将 PPG 与通用相机配置组合回原有 Nitro 请求结构。 */
internal fun ModelPPGConfig.toNitro(): CameraConfig = CameraConfig(
  cameraId = cameraConfig.cameraId,
  targetResolution = CameraResolution(cameraConfig.targetResolution.width, cameraConfig.targetResolution.height),
  targetFps = cameraConfig.targetFps,
  torchEnabled = cameraConfig.torchEnabled,
  exposure = CameraExposureConfig(
    mode = cameraConfig.exposure.mode.toNitro(),
    compensationIndex = cameraConfig.exposure.compensationIndex.toNitroNullable(),
    timeNanos = cameraConfig.exposure.timeNanos.toNitroNullable(),
    iso = cameraConfig.exposure.iso.toNitroNullable(),
    locked = cameraConfig.exposure.locked,
  ),
  whiteBalance = CameraWhiteBalanceConfig(
    mode = cameraConfig.whiteBalance.mode.toNitro(),
    locked = cameraConfig.whiteBalance.locked,
  ),
  focus = CameraFocusConfig(
    mode = cameraConfig.focus.mode.toNitro(),
    distanceDiopters = cameraConfig.focus.distanceDiopters.toNitroNullable(),
  ),
  processing = CameraProcessingConfig(
    blocks = doubleArrayOf(blockLayout.rows.toDouble(), blockLayout.columns.toDouble()),
  ),
)

/** 将 PPG 网格与通用相机协商结果序列化为低频 Nitro 状态。 */
internal fun ModelPPGConfigSummary.toNitro(): CameraConfigSummary = CameraConfigSummary(
  cameraId = cameraSummary.cameraId,
  requestedConfig = ModelPPGConfig(cameraSummary.requestedConfig, blockLayout).toNitro(),
  submittedConfig = ModelPPGConfig(cameraSummary.submittedConfig, blockLayout).toNitro(),
  adjustments = cameraSummary.adjustments.map(ModelCameraConfigAdjustment::toNitro).toTypedArray(),
  actualFrame = cameraSummary.actualFrame?.let {
    Variant_NullType_CameraFrameGeometry.create(it.toNitro())
  } ?: Variant_NullType_CameraFrameGeometry.create(NullType.NULL),
  observedFps = cameraSummary.observedFps.toNitroNullable(),
  blockLayout = CameraBlockLayout(blockLayout.rows.toDouble(), blockLayout.columns.toDouble()),
)

/** 保留真实交付尺寸、有效 crop、方向和镜像语义。 */
private fun ModelCameraFrameGeometry.toNitro() = CameraFrameGeometry(
  width = width.toDouble(),
  height = height.toDouble(),
  crop = crop.toNitro(),
  sensorOrientationDegrees = sensorOrientationDegrees?.toDouble().toNitroNullable(),
  mirrored = mirrored,
)

/** 转换坐标相对于完整交付帧的有效区域。 */
private fun ModelCameraFrameCrop.toNitro() = CameraFrameCrop(
  left = left.toDouble(),
  top = top.toDouble(),
  width = width.toDouble(),
  height = height.toDouble(),
)

/** 转换配置协商时的请求值、提交值和明确原因。 */
private fun ModelCameraConfigAdjustment.toNitro() = CameraConfigAdjustment(
  field = field,
  requestedValue = requestedValue,
  submittedValue = submittedValue,
  reason = reason,
)

/** 转换当前打开周期的 AE／AWB 锁定确认状态。 */
internal fun ModelCameraLockStatus.toNitro() = CameraLockStatus(
  phase = phase.toNitro(),
  aeLocked = aeLocked.toNitroNullable(),
  awbLocked = awbLocked.toNitroNullable(),
  errorCode = errorCode.toNitroNullable(),
  errorMessage = errorMessage.toNitroNullable(),
)

/** 将曝光模式枚举映射回 JS 的稳定语义。 */
private fun ModelCameraExposureMode.toNitro() = when (this) {
  ModelCameraExposureMode.AUTO -> CameraExposureMode.AUTO
  ModelCameraExposureMode.MANUAL -> CameraExposureMode.MANUAL
}

/** 将白平衡模式枚举映射回 JS 的稳定语义。 */
private fun ModelCameraWhiteBalanceMode.toNitro() = when (this) {
  ModelCameraWhiteBalanceMode.AUTO -> CameraWhiteBalanceMode.AUTO
  ModelCameraWhiteBalanceMode.OFF -> CameraWhiteBalanceMode.OFF
  ModelCameraWhiteBalanceMode.INCANDESCENT -> CameraWhiteBalanceMode.INCANDESCENT
  ModelCameraWhiteBalanceMode.FLUORESCENT -> CameraWhiteBalanceMode.FLUORESCENT
  ModelCameraWhiteBalanceMode.WARM_FLUORESCENT -> CameraWhiteBalanceMode.WARM_FLUORESCENT
  ModelCameraWhiteBalanceMode.DAYLIGHT -> CameraWhiteBalanceMode.DAYLIGHT
  ModelCameraWhiteBalanceMode.CLOUDY_DAYLIGHT -> CameraWhiteBalanceMode.CLOUDY_DAYLIGHT
  ModelCameraWhiteBalanceMode.TWILIGHT -> CameraWhiteBalanceMode.TWILIGHT
  ModelCameraWhiteBalanceMode.SHADE -> CameraWhiteBalanceMode.SHADE
}

/** 将对焦模式枚举映射回 JS 的稳定语义。 */
private fun ModelCameraFocusMode.toNitro() = when (this) {
  ModelCameraFocusMode.AUTO -> CameraFocusMode.AUTO
  ModelCameraFocusMode.MANUAL -> CameraFocusMode.MANUAL
  ModelCameraFocusMode.OFF -> CameraFocusMode.OFF
}

/** 将 AE／AWB 锁定阶段映射回 Nitro 枚举。 */
private fun ModelCameraLockPhase.toNitro() = when (this) {
  ModelCameraLockPhase.FAILED -> CameraLockPhase.FAILED
  ModelCameraLockPhase.NOT_REQUESTED -> CameraLockPhase.NOT_REQUESTED
  ModelCameraLockPhase.APPLYING -> CameraLockPhase.APPLYING
  ModelCameraLockPhase.LOCKED -> CameraLockPhase.LOCKED
  ModelCameraLockPhase.RELEASED -> CameraLockPhase.RELEASED
}

/** 将 JS 曝光模式转换为不可变 Kotlin 模型。 */
private fun CameraExposureMode.toModel() = when (this) {
  CameraExposureMode.AUTO -> ModelCameraExposureMode.AUTO
  CameraExposureMode.MANUAL -> ModelCameraExposureMode.MANUAL
}

/** 将 JS 白平衡模式转换为不可变 Kotlin 模型。 */
private fun CameraWhiteBalanceMode.toModel() = when (this) {
  CameraWhiteBalanceMode.AUTO -> ModelCameraWhiteBalanceMode.AUTO
  CameraWhiteBalanceMode.OFF -> ModelCameraWhiteBalanceMode.OFF
  CameraWhiteBalanceMode.INCANDESCENT -> ModelCameraWhiteBalanceMode.INCANDESCENT
  CameraWhiteBalanceMode.FLUORESCENT -> ModelCameraWhiteBalanceMode.FLUORESCENT
  CameraWhiteBalanceMode.WARM_FLUORESCENT -> ModelCameraWhiteBalanceMode.WARM_FLUORESCENT
  CameraWhiteBalanceMode.DAYLIGHT -> ModelCameraWhiteBalanceMode.DAYLIGHT
  CameraWhiteBalanceMode.CLOUDY_DAYLIGHT -> ModelCameraWhiteBalanceMode.CLOUDY_DAYLIGHT
  CameraWhiteBalanceMode.TWILIGHT -> ModelCameraWhiteBalanceMode.TWILIGHT
  CameraWhiteBalanceMode.SHADE -> ModelCameraWhiteBalanceMode.SHADE
}

/** 将 JS 对焦模式转换为不可变 Kotlin 模型。 */
private fun CameraFocusMode.toModel() = when (this) {
  CameraFocusMode.AUTO -> ModelCameraFocusMode.AUTO
  CameraFocusMode.MANUAL -> ModelCameraFocusMode.MANUAL
  CameraFocusMode.OFF -> ModelCameraFocusMode.OFF
}

/** 为可空浮点字段构造 Nitro 的显式 null 分支。 */
private fun Double?.toNitroNullable() = this?.let { Variant_NullType_Double.create(it) }
  ?: Variant_NullType_Double.create(NullType.NULL)

/** 为可空布尔字段构造 Nitro 的显式 null 分支。 */
private fun Boolean?.toNitroNullable() = this?.let { Variant_Boolean_NullType.create(it) }
  ?: Variant_Boolean_NullType.create(NullType.NULL)

/** 为可空字符串字段构造 Nitro 的显式 null 分支。 */
private fun String?.toNitroNullable() = this?.let { Variant_NullType_String.create(it) }
  ?: Variant_NullType_String.create(NullType.NULL)
