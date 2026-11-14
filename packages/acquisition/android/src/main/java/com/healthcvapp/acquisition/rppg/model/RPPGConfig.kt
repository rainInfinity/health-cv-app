/** 集中冻结 RPPG 试验参数、颜色假设版本及会话可记录的配置快照。 */
package com.healthcvapp.acquisition.rppg.model

import kotlin.math.ceil
import kotlin.math.roundToLong

/** 表示配置尚未完成真实设备与方法学评审。 */
internal enum class RPPGConfigReviewStatus(val wireValue: String) {
  PENDING_REVIEW("pending-review"),
}

/** 记录配置请求的前置镜头；设备实际选择单独写入相机摘要。 */
internal enum class RPPGCameraFacing(val wireValue: String) {
  FRONT("front"),
}

/** 额头与双颊就绪门槛；这些工程试验值不是医学标准。 */
internal data class RPPGFaceReadinessConfig(
  /** 有效输入画面中面宽的最小比例，范围 [0, 1]。 */
  val minimumFaceWidthFraction: Double,
  /** 最大绝对 yaw，单位度。 */
  val maximumYawDegrees: Double,
  /** 最大绝对 pitch，单位度。 */
  val maximumPitchDegrees: Double,
  /** 最大绝对 roll，单位度。 */
  val maximumRollDegrees: Double,
  /** 每个 ROI 必须落在有效输入画面内的最小面积比例，范围 [0, 1]。 */
  val minimumRoiCoverageFraction: Double,
  /** 连续就绪所需时长，单位纳秒。 */
  val requiredContinuousNanos: Long,
  /** 相邻有效帧允许的最大间隔，单位纳秒。 */
  val maximumAdjacentValidGapNanos: Long,
  /** 相邻人脸中心允许移动的最大面宽倍数。 */
  val maximumCenterShiftFaceWidths: Double,
  /** 相邻人脸宽、高各自允许的最小比例。 */
  val minimumFaceScaleRatio: Double,
  /** 相邻人脸宽、高各自允许的最大比例。 */
  val maximumFaceScaleRatio: Double,
  /** 相邻人脸宽高比允许的最大相对变化量。 */
  val maximumAspectRatioChangeFraction: Double,
) {
  init {
    require(minimumFaceWidthFraction.isFinite() && minimumFaceWidthFraction in 0.0..1.0)
    require(
      maximumYawDegrees.isFinite() && maximumPitchDegrees.isFinite() && maximumRollDegrees.isFinite() &&
        maximumYawDegrees >= 0.0 && maximumPitchDegrees >= 0.0 && maximumRollDegrees >= 0.0,
    )
    require(minimumRoiCoverageFraction.isFinite() && minimumRoiCoverageFraction in 0.0..1.0)
    require(requiredContinuousNanos >= 0L && maximumAdjacentValidGapNanos > 0L)
    require(maximumCenterShiftFaceWidths.isFinite() && maximumCenterShiftFaceWidths >= 0.0)
    require(
      minimumFaceScaleRatio.isFinite() && maximumFaceScaleRatio.isFinite() &&
        minimumFaceScaleRatio > 0.0 && maximumFaceScaleRatio >= minimumFaceScaleRatio,
    )
    require(maximumAspectRatioChangeFraction.isFinite() && maximumAspectRatioChangeFraction >= 0.0)
  }
}

/** 一次实验会话使用的不可变算法参数及可序列化快照。 */
internal data class RPPGConfig(
  /** 试验配置版本；算法版本及结果格式版本另行记录。 */
  val version: String,
  /** 是否仍待评审，不表示信号或设备已验证。 */
  val reviewStatus: RPPGConfigReviewStatus,
  /** 输入帧没有可靠颜色元数据时采用的转换假设标识。 */
  val colorAssumptionId: String,
  /** 请求的分析图像宽度，单位像素；不是实际协商结果。 */
  val preferredCameraWidthPx: Int,
  /** 请求的分析图像高度，单位像素；不是实际协商结果。 */
  val preferredCameraHeightPx: Int,
  /** 请求的相机目标帧率，单位帧／秒；不是实测帧率。 */
  val preferredCameraFps: Double,
  /** 请求使用的镜头朝向；设备实际镜头另由 CameraConfigSummary 记录。 */
  val cameraFacing: RPPGCameraFacing,
  /** 请求相机使用自动曝光。 */
  val cameraExposureAuto: Boolean,
  /** 请求相机使用自动白平衡。 */
  val cameraWhiteBalanceAuto: Boolean,
  /** 请求相机使用自动对焦。 */
  val cameraFocusAuto: Boolean,
  /** 请求保持自动曝光，不锁定曝光参数。 */
  val cameraExposureLocked: Boolean,
  /** 请求保持自动白平衡，不锁定白平衡参数。 */
  val cameraWhiteBalanceLocked: Boolean,
  /** 请求不启用补光灯。 */
  val cameraTorchEnabled: Boolean,
  /** 开始后允许寻找连续合格人脸的最长时长，单位纳秒。 */
  val observationTimeoutNanos: Long,
  /** 正式测量目标时长，单位纳秒，不因短时无效帧顺延。 */
  val targetMeasurementDurationNanos: Long,
  /** 人脸姿态、大小、ROI 与目标连续性配置。 */
  val faceReadiness: RPPGFaceReadinessConfig,
  /** 规则重采样率，单位 Hz。 */
  val resamplingRateHz: Double,
  /** 允许线性插值的最大样本间隔，单位纳秒。 */
  val maximumInterpolationGapNanos: Long,
  /** POS 滑动窗口时长，单位纳秒。 */
  val posWindowNanos: Long,
  /** 因果滤波启动排除时长，单位纳秒。 */
  val filterStartupExclusionNanos: Long,
  /** 因果带通下限，单位 Hz。 */
  val bandpassLowHz: Double,
  /** 因果带通上限，单位 Hz。 */
  val bandpassHighHz: Double,
  /** 心率频谱窗口时长，单位纳秒。 */
  val heartRateWindowNanos: Long,
  /** 心率估计步长，单位纳秒。 */
  val heartRateStepNanos: Long,
  /** 心率搜索下限，单位 bpm。 */
  val minimumHeartRateBpm: Double,
  /** 心率搜索上限，单位 bpm。 */
  val maximumHeartRateBpm: Double,
  /** 心率窗口最低频谱 SNR，单位 dB。 */
  val minimumHeartRateSnrDb: Double,
  /** 实时展示批次时长，单位纳秒。 */
  val realtimeBatchNanos: Long,
  /** 页面侧波形缓存时长，单位纳秒。 */
  val realtimeBufferNanos: Long,
  /** 独立逐搏估计规则；不会改写频谱窗口和滤波参数。 */
  val beatDetection: RPPGBeatDetectionConfig = RPPGBeatDetectionConfig.EXPERIMENTAL_V1,
) {
  init {
    require(version.isNotBlank())
    require(colorAssumptionId == COLOR_ASSUMPTION_BT601_LIMITED_V1)
    require(preferredCameraWidthPx > 0 && preferredCameraHeightPx > 0)
    require(preferredCameraFps.isFinite() && preferredCameraFps > 0.0)
    require(observationTimeoutNanos > 0L && targetMeasurementDurationNanos > 0L)
    require(resamplingRateHz.isFinite() && resamplingRateHz > 0.0)
    require(maximumInterpolationGapNanos > 0L && posWindowNanos > 0L)
    require(filterStartupExclusionNanos >= 0L)
    require(
      bandpassLowHz.isFinite() && bandpassHighHz.isFinite() &&
        bandpassLowHz > 0.0 && bandpassHighHz > bandpassLowHz && bandpassHighHz < resamplingRateHz / 2.0,
    )
    require(heartRateWindowNanos > 0L && heartRateStepNanos > 0L && heartRateStepNanos <= heartRateWindowNanos)
    require(
      minimumHeartRateBpm.isFinite() && maximumHeartRateBpm.isFinite() &&
        minimumHeartRateBpm > 0.0 && maximumHeartRateBpm > minimumHeartRateBpm &&
        minimumHeartRateBpm / 60.0 >= bandpassLowHz &&
        maximumHeartRateBpm / 60.0 <= bandpassHighHz,
    )
    require(minimumHeartRateSnrDb.isFinite())
    require(realtimeBatchNanos > 0L && realtimeBufferNanos >= realtimeBatchNanos)
  }

  /** 连续有效输入形成首个频谱窗所需的数据时长，不包含找脸、相机启动或质量拒绝。 */
  val minimumSpectralMeasurementNanos: Long = run {
    val intervalNanos = (1_000_000_000.0 / resamplingRateHz).roundToLong()
    require(intervalNanos > 0L)
    val posSamples = ceil(posWindowNanos * resamplingRateHz / 1_000_000_000.0).toLong()
    val startupSamples = ceil(filterStartupExclusionNanos.toDouble() / intervalNanos).toLong()
    val heartRateSamples = ceil(heartRateWindowNanos * resamplingRateHz / 1_000_000_000.0).toLong()
    val totalIntervals = Math.addExact(Math.addExact(posSamples - 1L, startupSamples), heartRateSamples - 1L)
    Math.multiplyExact(totalIntervals, intervalNanos)
  }

  /** 为正式会话冻结全套处理参数；相机实测信息另由 CameraConfigSummary 记录。 */
  fun sessionSnapshot(): Map<String, Any> = mapOf(
    "configVersion" to version,
    "reviewStatus" to reviewStatus.wireValue,
    "colorAssumptionId" to colorAssumptionId,
    "cameraRequest" to mapOf(
      "lensFacing" to cameraFacing.wireValue,
      "preferredWidthPx" to preferredCameraWidthPx,
      "preferredHeightPx" to preferredCameraHeightPx,
      "preferredFps" to preferredCameraFps,
      "exposureAuto" to cameraExposureAuto,
      "whiteBalanceAuto" to cameraWhiteBalanceAuto,
      "focusAuto" to cameraFocusAuto,
      "exposureLocked" to cameraExposureLocked,
      "whiteBalanceLocked" to cameraWhiteBalanceLocked,
      "torchEnabled" to cameraTorchEnabled,
    ),
    "observationTimeoutNanos" to observationTimeoutNanos,
    "targetMeasurementDurationNanos" to targetMeasurementDurationNanos,
    "faceReadiness" to mapOf(
      "minimumFaceWidthFraction" to faceReadiness.minimumFaceWidthFraction,
      "maximumYawDegrees" to faceReadiness.maximumYawDegrees,
      "maximumPitchDegrees" to faceReadiness.maximumPitchDegrees,
      "maximumRollDegrees" to faceReadiness.maximumRollDegrees,
      "minimumRoiCoverageFraction" to faceReadiness.minimumRoiCoverageFraction,
      "requiredContinuousNanos" to faceReadiness.requiredContinuousNanos,
      "maximumAdjacentValidGapNanos" to faceReadiness.maximumAdjacentValidGapNanos,
      "maximumCenterShiftFaceWidths" to faceReadiness.maximumCenterShiftFaceWidths,
      "minimumFaceScaleRatio" to faceReadiness.minimumFaceScaleRatio,
      "maximumFaceScaleRatio" to faceReadiness.maximumFaceScaleRatio,
      "maximumAspectRatioChangeFraction" to faceReadiness.maximumAspectRatioChangeFraction,
    ),
    "resamplingRateHz" to resamplingRateHz,
    "maximumInterpolationGapNanos" to maximumInterpolationGapNanos,
    "posWindowNanos" to posWindowNanos,
    "filterStartupExclusionNanos" to filterStartupExclusionNanos,
    "bandpassLowHz" to bandpassLowHz,
    "bandpassHighHz" to bandpassHighHz,
    "minimumHeartRateBpm" to minimumHeartRateBpm,
    "maximumHeartRateBpm" to maximumHeartRateBpm,
    "heartRateWindowNanos" to heartRateWindowNanos,
    "heartRateStepNanos" to heartRateStepNanos,
    "minimumHeartRateSnrDb" to minimumHeartRateSnrDb,
    "beatDetection" to mapOf(
      "version" to beatDetection.version,
      "prominenceWindowNanos" to beatDetection.prominenceWindowNanos,
      "minimumProminence" to beatDetection.minimumProminence,
      "prominenceRangeFraction" to beatDetection.prominenceRangeFraction,
      "refractoryNanos" to beatDetection.refractoryNanos,
      "maximumIntervalChangeFraction" to beatDetection.maximumIntervalChangeFraction,
      "resultTimeoutNanos" to beatDetection.resultTimeoutNanos,
      "maximumSamplePeriodDeviationFraction" to beatDetection.maximumSamplePeriodDeviationFraction,
      "minimumHeartRateBpm" to minimumHeartRateBpm,
      "maximumHeartRateBpm" to maximumHeartRateBpm,
    ),
    "realtimeBatchNanos" to realtimeBatchNanos,
    "realtimeBufferNanos" to realtimeBufferNanos,
  )

  companion object {
    /** 唯一颜色转换假设；修改公式或范围必须使用新标识。 */
    const val COLOR_ASSUMPTION_BT601_LIMITED_V1 = "BT601_LIMITED_V1"

    /** 当前推荐试验基线；所有参数均待评审，不是医学阈值。 */
    val EXPERIMENTAL_V1 = RPPGConfig(
      version = "rppg-experiment-v1",
      reviewStatus = RPPGConfigReviewStatus.PENDING_REVIEW,
      colorAssumptionId = COLOR_ASSUMPTION_BT601_LIMITED_V1,
      preferredCameraWidthPx = 640,
      preferredCameraHeightPx = 480,
      preferredCameraFps = 30.0,
      cameraFacing = RPPGCameraFacing.FRONT,
      cameraExposureAuto = true,
      cameraWhiteBalanceAuto = true,
      cameraFocusAuto = true,
      cameraExposureLocked = false,
      cameraWhiteBalanceLocked = false,
      cameraTorchEnabled = false,
      observationTimeoutNanos = 5_000_000_000L,
      targetMeasurementDurationNanos = 30_000_000_000L,
      faceReadiness = RPPGFaceReadinessConfig(
        minimumFaceWidthFraction = 0.25,
        maximumYawDegrees = 20.0,
        maximumPitchDegrees = 20.0,
        maximumRollDegrees = 25.0,
        minimumRoiCoverageFraction = 0.95,
        requiredContinuousNanos = 1_000_000_000L,
        maximumAdjacentValidGapNanos = 200_000_000L,
        maximumCenterShiftFaceWidths = 0.5,
        minimumFaceScaleRatio = 0.65,
        maximumFaceScaleRatio = 1.55,
        maximumAspectRatioChangeFraction = 0.4,
      ),
      resamplingRateHz = 20.0,
      maximumInterpolationGapNanos = 100_000_000L,
      posWindowNanos = 1_600_000_000L,
      filterStartupExclusionNanos = 2_000_000_000L,
      bandpassLowHz = 0.75,
      bandpassHighHz = 3.0,
      heartRateWindowNanos = 12_000_000_000L,
      heartRateStepNanos = 1_000_000_000L,
      minimumHeartRateBpm = 45.0,
      maximumHeartRateBpm = 180.0,
      minimumHeartRateSnrDb = 3.0,
      realtimeBatchNanos = 200_000_000L,
      realtimeBufferNanos = 15_000_000_000L,
    )
  }
}
