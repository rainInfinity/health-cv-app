/** 在 Nitro 边界转换不可变相机配置、实际帧摘要和锁定状态。 */

package com.margelo.nitro.acquisition

import com.healthcvapp.acquisition.ppg.model.CameraBlockLayout as ModelCameraBlockLayout
import com.healthcvapp.acquisition.ppg.model.CameraConfig as ModelCameraConfig
import com.healthcvapp.acquisition.ppg.model.CameraConfigAdjustment as ModelCameraConfigAdjustment
import com.healthcvapp.acquisition.ppg.model.CameraConfigSummary as ModelCameraConfigSummary
import com.healthcvapp.acquisition.ppg.model.CameraExposureConfig as ModelCameraExposureConfig
import com.healthcvapp.acquisition.ppg.model.CameraExposureMode as ModelCameraExposureMode
import com.healthcvapp.acquisition.ppg.model.CameraFocusConfig as ModelCameraFocusConfig
import com.healthcvapp.acquisition.ppg.model.CameraFocusMode as ModelCameraFocusMode
import com.healthcvapp.acquisition.ppg.model.CameraFrameCrop as ModelCameraFrameCrop
import com.healthcvapp.acquisition.ppg.model.CameraFrameGeometry as ModelCameraFrameGeometry
import com.healthcvapp.acquisition.ppg.model.CameraLockPhase as ModelCameraLockPhase
import com.healthcvapp.acquisition.ppg.model.CameraLockStatus as ModelCameraLockStatus
import com.healthcvapp.acquisition.ppg.model.CameraWhiteBalanceConfig as ModelCameraWhiteBalanceConfig
import com.healthcvapp.acquisition.ppg.model.CameraWhiteBalanceMode as ModelCameraWhiteBalanceMode
import com.margelo.nitro.core.NullType

/** 将 JS 配置复制为原生不可变值，并验证桥接分块数组形状。 */
internal fun CameraConfig.toModel(): ModelCameraConfig = ModelCameraConfig(
  cameraId = cameraId,
  targetResolution = com.healthcvapp.acquisition.ppg.model.CameraResolution(
    targetResolution.width,
    targetResolution.height,
  ),
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
  processing = ModelCameraBlockLayout.fromBlocks(processing.blocks),
)

/** 将完整配置和分块布局转换为 Nitro 结构。 */
internal fun ModelCameraConfig.toNitro(): CameraConfig = CameraConfig(
  cameraId = cameraId,
  targetResolution = CameraResolution(targetResolution.width, targetResolution.height),
  targetFps = targetFps,
  torchEnabled = torchEnabled,
  exposure = CameraExposureConfig(
    mode = exposure.mode.toNitro(),
    compensationIndex = exposure.compensationIndex.toNitroNullable(),
    timeNanos = exposure.timeNanos.toNitroNullable(),
    iso = exposure.iso.toNitroNullable(),
    locked = exposure.locked,
  ),
  whiteBalance = CameraWhiteBalanceConfig(
    mode = whiteBalance.mode.toNitro(),
    locked = whiteBalance.locked,
  ),
  focus = CameraFocusConfig(
    mode = focus.mode.toNitro(),
    distanceDiopters = focus.distanceDiopters.toNitroNullable(),
  ),
  processing = CameraProcessingConfig(
    blocks = doubleArrayOf(processing.rows.toDouble(), processing.columns.toDouble()),
  ),
)

/** 将原生配置周期摘要序列化为低频 Nitro 状态。 */
internal fun ModelCameraConfigSummary.toNitro(): CameraConfigSummary = CameraConfigSummary(
  cameraId = cameraId,
  requestedConfig = requestedConfig.toNitro(),
  submittedConfig = submittedConfig.toNitro(),
  adjustments = adjustments.map(ModelCameraConfigAdjustment::toNitro).toTypedArray(),
  actualFrame = actualFrame?.let { Variant_NullType_CameraFrameGeometry.create(it.toNitro()) }
    ?: Variant_NullType_CameraFrameGeometry.create(NullType.NULL),
  observedFps = observedFps.toNitroNullable(),
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
