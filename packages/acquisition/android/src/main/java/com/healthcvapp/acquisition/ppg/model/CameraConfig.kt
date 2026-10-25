/** 定义主动相机请求、应用摘要、分块布局与算法锁状态。 */

package com.healthcvapp.acquisition.ppg.model

/** 主动采集的自动或手动曝光模式。 */
enum class CameraExposureMode(val wireValue: String) {
  AUTO("auto"),
  MANUAL("manual"),
}

/** 主动采集可表达的白平衡语义模式。 */
enum class CameraWhiteBalanceMode(val wireValue: String) {
  AUTO("auto"),
  OFF("off"),
  INCANDESCENT("incandescent"),
  FLUORESCENT("fluorescent"),
  WARM_FLUORESCENT("warm-fluorescent"),
  DAYLIGHT("daylight"),
  CLOUDY_DAYLIGHT("cloudy-daylight"),
  TWILIGHT("twilight"),
  SHADE("shade"),
}

/** 主动采集可表达的对焦语义模式。 */
enum class CameraFocusMode(val wireValue: String) {
  AUTO("auto"),
  OFF("off"),
  MANUAL("manual"),
}

/** 表示应用主动相机配置时的可判别失败。 */
class CameraConfigFailure(
  /** 调用方可判别的稳定错误码。 */
  val code: String,
  message: String,
) : IllegalArgumentException(message)


/** 表示一个非空、行优先的二维网格。 */
data class CameraBlockLayout(
  /** 网格行数，必须为正整数。 */
  val rows: Int,
  /** 网格列数，必须为正整数。 */
  val columns: Int,
) {
  /** 该布局包含的块数，以 Long 计算以避免乘积溢出。 */
  val blockCount: Long = rows.toLong() * columns.toLong()

  init {
    if (rows <= 0 || columns <= 0) {
      throw CameraConfigFailure("INVALID_CAMERA_CONFIG", "分块行数和列数必须为正整数。")
    }
  }

  companion object {
    /** 单帧允许处理的最大图像块数。 */
    const val MAX_BLOCK_COUNT = 64
    /** 校验桥接数组并只保留两个整数维度，不保留调用方可变数组。 */
    fun fromBlocks(blocks: DoubleArray): CameraBlockLayout {
      if (blocks.size != 2 || blocks.any {
          !it.isFinite() || it % 1.0 != 0.0 || it <= 0.0 || it > Int.MAX_VALUE.toDouble()
        }) {
        throw CameraConfigFailure(
          "INVALID_CAMERA_CONFIG",
          "分块配置必须恰有两个可表示的正整数行列值。",
        )
      }
      return CameraBlockLayout(rows = blocks[0].toInt(), columns = blocks[1].toInt())
    }
  }
}

/** 保存一组自动或手动曝光请求参数。 */
data class CameraExposureConfig(
  /** 曝光控制模式。 */
  val mode: CameraExposureMode,
  /** 自动曝光补偿索引；不适用时为空，验证前保留桥接浮点数。 */
  val compensationIndex: Double?,
  /** 手动曝光时间，单位纳秒；不适用时为空，验证前保留桥接浮点数。 */
  val timeNanos: Double?,
  /** 手动感光度 ISO；不适用时为空，验证前保留桥接浮点数。 */
  val iso: Double?,
  /** 是否请求在正式采集前锁定自动曝光。 */
  val locked: Boolean,
)

/** 保存白平衡模式及自动算法锁定请求。 */
data class CameraWhiteBalanceConfig(
  /** 白平衡控制模式。 */
  val mode: CameraWhiteBalanceMode,
  /** 是否请求在正式采集前锁定自动白平衡。 */
  val locked: Boolean,
)

/** 保存对焦模式及可选手动距离。 */
data class CameraFocusConfig(
  /** 对焦控制模式。 */
  val mode: CameraFocusMode,
  /** 手动对焦距离，单位屈光度；不适用时为空。 */
  val distanceDiopters: Double?,
)

/** 保存单个相机打开周期内冻结的完整请求配置。 */
data class CameraConfig(
  /** 当前设备枚举得到的逻辑相机标识。 */
  val cameraId: String,
  /** 期望分析像素尺寸。 */
  val targetResolution: CameraResolution,
  /** 期望帧率，单位帧／秒。 */
  val targetFps: Double,
  /** 是否明确请求启用补光灯。 */
  val torchEnabled: Boolean,
  /** 曝光模式与数值配置。 */
  val exposure: CameraExposureConfig,
  /** 白平衡模式配置。 */
  val whiteBalance: CameraWhiteBalanceConfig,
  /** 对焦模式配置。 */
  val focus: CameraFocusConfig,
  /** 分块处理布局。 */
  val processing: CameraBlockLayout,
)

/** 描述配置协商时某字段的请求值与实际提交值差异。 */
data class CameraConfigAdjustment(
  /** 被调整字段的配置路径。 */
  val field: String,
  /** 原始请求值的可读表示。 */
  val requestedValue: String,
  /** 实际提交值的可读表示。 */
  val submittedValue: String,
  /** 设备或组合能力导致调整的原因。 */
  val reason: String,
)

/** 表示交付图像中的原生有效区域。 */
data class CameraFrameCrop(
  /** 有效区域左边界，坐标相对于交付帧。 */
  val left: Int,
  /** 有效区域上边界，坐标相对于交付帧。 */
  val top: Int,
  /** 有效区域宽度，单位像素。 */
  val width: Int,
  /** 有效区域高度，单位像素。 */
  val height: Int,
)

/** 描述真实交付图像的尺寸、裁剪和原生方向语义。 */
data class CameraFrameGeometry(
  /** 实际帧宽度，单位像素。 */
  val width: Int,
  /** 实际帧高度，单位像素。 */
  val height: Int,
  /** 图像实际有效区域。 */
  val crop: CameraFrameCrop,
  /** 传感器安装方向角度；设备未提供时为空。 */
  val sensorOrientationDegrees: Int?,
  /** 原生分析帧是否镜像。 */
  val mirrored: Boolean,
)

/** 汇总不可变请求、原生提交、协商原因和实际采集结果。 */
data class CameraConfigSummary(
  /** 本周期绑定的相机标识。 */
  val cameraId: String,
  /** 调用方提交的原始配置。 */
  val requestedConfig: CameraConfig,
  /** 原生提交给相机用例的配置。 */
  val submittedConfig: CameraConfig,
  /** 尺寸或帧率协商的明确原因。 */
  val adjustments: List<CameraConfigAdjustment>,
  /** 首帧到达后的真实图像几何；尚无帧时为空。 */
  val actualFrame: CameraFrameGeometry?,
  /** 观测到的帧率；尚无测量窗口时为空。 */
  val observedFps: Double?,
  /** 当前周期实际用于写出的分块布局。 */
  val blockLayout: CameraBlockLayout,
)

/** 自动算法锁定的低频状态阶段。 */
enum class CameraLockPhase(val wireValue: String) {
  NOT_REQUESTED("not-requested"),
  APPLYING("applying"),
  LOCKED("locked"),
  RELEASED("released"),
  FAILED("failed"),
}

/** 保存当前相机周期的 AE／AWB 锁定确认状态。 */
data class CameraLockStatus(
  /** 当前锁定阶段。 */
  val phase: CameraLockPhase,
  /** 最近拍摄结果确认的 AE 锁状态；未知时为空。 */
  val aeLocked: Boolean?,
  /** 最近拍摄结果确认的 AWB 锁状态；未知时为空。 */
  val awbLocked: Boolean?,
  /** 锁定失败时的稳定错误码。 */
  val errorCode: String?,
  /** 锁定失败时的可读说明。 */
  val errorMessage: String?,
)
