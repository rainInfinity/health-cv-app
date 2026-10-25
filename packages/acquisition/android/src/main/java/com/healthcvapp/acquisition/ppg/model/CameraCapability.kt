/** 定义主动相机枚举、参数能力及组合选项值模型。 */

package com.healthcvapp.acquisition.ppg.model

/** 表示设备能力查询的可判别结果。 */
enum class CameraCapabilityStatus(val wireValue: String) {
  SUPPORTED("supported"),
  UNSUPPORTED("unsupported"),
  PERMISSION_REQUIRED("permission-required"),
  UNKNOWN("unknown"),
}

/** 表示设备上的逻辑相机朝向。 */
enum class CameraFacing(val wireValue: String) {
  BACK("back"),
  FRONT("front"),
  EXTERNAL("external"),
  UNKNOWN("unknown"),
}

/** 表示可精确携带的有理数步长。 */
data class CameraRational(
  /** 有理数分子。 */
  val numerator: Int,
  /** 有理数正分母。 */
  val denominator: Int,
)

/** 表示设备报告的数值上下界和可选量化步长。 */
data class CameraNumberRange(
  /** 设备报告的最小值。 */
  val minimum: Double,
  /** 设备报告的最大值。 */
  val maximum: Double,
  /** 设备报告的量化步长；未知时为空。 */
  val step: CameraRational? = null,
)

/** 表示一个可查询的数值能力。 */
data class CameraNumericCapability(
  /** 能力查询状态。 */
  val status: CameraCapabilityStatus,
  /** 已知数值范围；未知或不可用时为空。 */
  val range: CameraNumberRange?,
  /** 无法查询或能力未知的原因。 */
  val reason: String?,
)

/** 表示设备支持的语义模式及查询状态。 */
data class CameraModeCapability(
  /** 能力查询状态。 */
  val status: CameraCapabilityStatus,
  /** 设备明确支持的语义模式；无法读取时为空。 */
  val modes: List<String>?,
  /** 能力已部分读取但支持状态仍未知的语义名称。 */
  val unknownModes: List<String>,
  /** 无法查询或能力未知的原因。 */
  val reason: String?,
)

/** 表示补光或算法锁定等布尔能力。 */
data class CameraBooleanCapability(
  /** 能力查询状态。 */
  val status: CameraCapabilityStatus,
  /** 已知能力值；未知或不可用时为空。 */
  val value: Boolean?,
  /** 无法查询或能力未知的原因。 */
  val reason: String?,
)

/** 描述当前设备枚举到的一个可选择逻辑相机。 */
data class CameraDescriptor(
  /** 当前设备枚举得到的相机标识。 */
  val cameraId: String,
  /** 相机相对于设备机身的朝向。 */
  val facing: CameraFacing,
  /** 传感器安装方向角度；设备未提供时为空。 */
  val sensorOrientationDegrees: Int?,
)

/** 表示以像素为单位的候选分析尺寸。 */
data class CameraResolution(
  /** 水平像素数；边界接收原始数值后再校验整数约束。 */
  val width: Double,
  /** 垂直像素数；边界接收原始数值后再校验整数约束。 */
  val height: Double,
)

/** 表示设备报告的帧率范围，单位帧／秒。 */
data class CameraFpsRange(
  /** 最小帧率。 */
  val minimum: Double,
  /** 最大帧率。 */
  val maximum: Double,
)

/** 表示 Preview 与 YUV 分析组合的单个候选项。 */
data class CameraCaptureOption(
  /** 候选分析尺寸。 */
  val resolution: CameraResolution,
  /** 设备报告的帧率范围；未知时为空。 */
  val fpsRanges: List<CameraFpsRange>?,
  /** Preview 与分析组合的兼容性查询状态。 */
  val compatibility: CameraCapabilityStatus,
  /** 不兼容或无法确认时的原因。 */
  val reason: String?,
)

/** 表示处理器可承受的有限分块约束。 */
data class CameraProcessingLimits(
  /** 单帧最大块数。 */
  val maxBlockCount: Int,
  /** 目标尺寸允许的最大列数。 */
  val maxColumns: Int,
  /** 目标尺寸允许的最大行数。 */
  val maxRows: Int,
)

/** 返回指定相机的组合候选项与本地分块约束。 */
data class CameraCaptureOptions(
  /** 候选项所属的相机标识。 */
  val cameraId: String,
  /** Preview 与 YUV 分析组合的候选配置。 */
  val options: List<CameraCaptureOption>,
  /** 本地处理器约束，不代表相机硬件能力。 */
  val processing: CameraProcessingLimits,
)

/** 表示组合能力查询使用的尺寸与帧率偏好。 */
data class CameraCaptureOptionsRequest(
  /** 待查询的目标尺寸；为空时使用主动采集默认候选值。 */
  val targetResolution: CameraResolution?,
  /** 待查询的目标帧率偏好；为空时返回组合支持的全部范围。 */
  val targetFps: Double?,
)

/** 汇总指定相机可查询的主动采集参数。 */
data class CameraCapabilities(
  /** 能力所属的相机标识。 */
  val cameraId: String,
  /** 自动或手动曝光模式能力。 */
  val exposureModes: CameraModeCapability,
  /** 手动曝光时间范围，单位纳秒。 */
  val exposureTimeNanos: CameraNumericCapability,
  /** 手动感光度范围，单位 ISO。 */
  val iso: CameraNumericCapability,
  /** 曝光补偿索引范围及 EV 步长。 */
  val exposureCompensationIndex: CameraNumericCapability,
  /** 白平衡模式能力。 */
  val whiteBalanceModes: CameraModeCapability,
  /** 对焦模式能力。 */
  val focusModes: CameraModeCapability,
  /** 手动对焦距离范围，单位屈光度；0 表示无穷远。 */
  val focusDistanceDiopters: CameraNumericCapability,
  /** 补光灯能力。 */
  val torch: CameraBooleanCapability,
  /** 自动曝光锁定能力。 */
  val aeLock: CameraBooleanCapability,
  /** 自动白平衡锁定能力。 */
  val awbLock: CameraBooleanCapability,
)
