/** 定义 RPPG 会话落盘记录、来源及最终元信息。 */

package com.healthcvapp.acquisition.rppg.model

import com.healthcvapp.acquisition.camera.model.CameraConfigSummary

/** 会话内脉搏和心率记录的共同类型。 */
internal sealed class RPPGSessionRecord

/** 表示一条可落盘的因果滤波脉搏样本。 */
internal data class RPPGPulseSample(
  /** 连续信号片段序号。 */
  val segmentIndex: Long,
  /** 会话内单调递增的样本序号。 */
  val sampleIndex: Long,
  /** 传感器单调时钟上的绝对采集时间，单位纳秒。 */
  val timestampNanos: Long,
  /** 带通后脉搏幅值，任意单位。 */
  val value: Double,
) : RPPGSessionRecord() {
  init {
    require(segmentIndex >= 0L && sampleIndex >= 0L && timestampNanos >= 0L)
    require(value.isFinite())
  }
}

/** 表示一条已评估的心率窗口，包括被拒绝的窗口。 */
internal data class RPPGHeartRateWindow(
  /** 窗口所属连续信号片段序号。 */
  val segmentIndex: Long,
  /** 首个参与样本的传感器绝对时间，单位纳秒。 */
  val windowStartNanos: Long,
  /** 末个参与样本的传感器绝对时间，单位纳秒。 */
  val windowEndNanos: Long,
  /** 有效心率，单位 bpm；无效窗口必须为空。 */
  val heartRateBpm: Double?,
  /** 是否通过频谱质量检查。 */
  val valid: Boolean,
  /** 稳定拒绝原因；有效窗口必须为空。 */
  val reason: String?,
  /** 频谱 SNR，单位 dB；无法计算时为空。 */
  val spectralSnrDb: Double?,
) : RPPGSessionRecord() {
  init {
    require(segmentIndex >= 0L && windowStartNanos >= 0L && windowEndNanos >= windowStartNanos)
    require(spectralSnrDb == null || spectralSnrDb.isFinite())
    if (valid) {
      require(heartRateBpm != null && heartRateBpm.isFinite() && heartRateBpm > 0.0)
      require(reason == null)
    } else {
      require(heartRateBpm == null && !reason.isNullOrBlank())
    }
  }
}

/** 记录结果来自主动测量还是被动采集。 */
internal enum class RPPGSessionSource(val wireValue: String) {
  ACTIVE("active"),
  PASSIVE("passive"),
}

/** 描述用户或宿主正常结束会话的原因。 */
internal enum class RPPGTerminationReason(val wireValue: String) {
  TARGET_DURATION("target_duration"),
  USER_STOP("user_stop"),
  PAGE_LEFT("page_left"),
  APP_BACKGROUND("app_background"),
  OBSERVATION_TIMEOUT("observation_timeout"),
  INTERRUPTED("interrupted"),
}

/** 区分有有效读数、无有效读数和未形成波形。 */
internal enum class RPPGSignalStatus(val wireValue: String) {
  VALID_HEART_RATE("valid_heart_rate"),
  NO_VALID_HEART_RATE("no_valid_heart_rate"),
  NO_WAVEFORM("no_waveform"),
}

/** 保存会话开始时冻结的来源、时间原点与算法配置。 */
internal data class RPPGSessionDescriptor(
  /** 结果格式版本。 */
  val schemaVersion: String,
  /** 实时算法版本。 */
  val algorithmVersion: String,
  /** 会话标识，同时用于隔离临时目录。 */
  val sessionId: String,
  /** 会话所属采集来源。 */
  val source: RPPGSessionSource,
  /** 首个正式观察帧的传感器绝对时间，单位纳秒。 */
  val sensorTimeOriginNanos: Long,
  /** 开始时间的可读墙上时钟表示；不参与信号计算。 */
  val startedAt: String,
  /** 本次会话冻结的完整处理配置。 */
  val config: RPPGConfig,
) {
  init {
    require(schemaVersion.isNotBlank() && algorithmVersion.isNotBlank())
    require(sessionId.isNotBlank() && sensorTimeOriginNanos >= 0L && startedAt.isNotBlank())
  }
}

/** 保存停止时确定的结束时间、结束原因及实际相机协商摘要。 */
internal data class RPPGSessionFinalization(
  /** 结束时间的可读墙上时钟表示；不参与信号计算。 */
  val finishedAt: String,
  /** 用户或宿主触发的合法终止原因。 */
  val termination: RPPGTerminationReason,
  /** 从最终心率记录和波形得到的信号结论。 */
  val signalStatus: RPPGSignalStatus,
  /** 本会话的实际相机请求、提交及观测摘要。 */
  val cameraSummary: CameraConfigSummary,
) {
  init {
    require(finishedAt.isNotBlank())
  }
}

/** 汇总 CSV 中脉搏样本、评估窗口和有效心率的数量。 */
internal data class RPPGSessionSampleCounts(
  /** pulse.csv 中的样本行数。 */
  val pulseSamples: Long,
  /** hr.csv 中的窗口行数。 */
  val heartRateWindows: Long,
  /** 通过质量检查的 HR 窗口数。 */
  val validHeartRateWindows: Long,
) {
  /** 未通过质量检查的窗口数。 */
  val rejectedHeartRateWindows: Long
    get() = heartRateWindows - validHeartRateWindows

  init {
    require(pulseSamples >= 0L && heartRateWindows >= 0L)
    require(validHeartRateWindows in 0L..heartRateWindows)
  }
}

/** 保存 pulse.csv 中每个连续片段的实际记录范围。 */
internal data class RPPGSegmentRange(
  /** 连续片段序号。 */
  val segmentIndex: Long,
  /** 首个已落盘脉搏样本序号。 */
  val firstSampleIndex: Long,
  /** 最后一个已落盘脉搏样本序号。 */
  val lastSampleIndex: Long,
  /** 首个已落盘脉搏样本的传感器绝对时间，单位纳秒。 */
  val firstTimestampNanos: Long,
  /** 最后一个已落盘脉搏样本的传感器绝对时间，单位纳秒。 */
  val lastTimestampNanos: Long,
  /** 该片段实际写入的脉搏样本行数。 */
  val sampleCount: Long,
) {
  init {
    require(segmentIndex >= 0L && firstSampleIndex >= 0L && lastSampleIndex >= firstSampleIndex)
    require(firstTimestampNanos >= 0L && lastTimestampNanos >= firstTimestampNanos && sampleCount > 0L)
  }
}
