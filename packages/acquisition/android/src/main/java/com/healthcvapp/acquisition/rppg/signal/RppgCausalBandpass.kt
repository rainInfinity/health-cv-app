/** 以双线性变换构造因果一阶高通／低通级联并排除启动区间。 */
package com.healthcvapp.acquisition.rppg.signal

import com.healthcvapp.acquisition.rppg.model.RPPGConfig
import kotlin.math.PI
import kotlin.math.tan

/** 表示滤波输入积累、启动排除或有效输出状态。 */
internal enum class RppgFilterEvent {
  NO_INPUT,
  STARTUP_EXCLUDED,
  SAMPLE_FILTERED,
  INVALID_INPUT,
  NUMERIC_FAILURE,
}

/** 可复用的有效滤波样本；有效区间首点附带实测启动延迟。 */
internal class RppgFilteredSample {
  /** 本次调用是否产生可发布的有效样本。 */
  var hasSample: Boolean = false
    private set
  /** 所属信号片段序号。 */
  var segmentIndex: Long = -1L
    private set
  /** 所属会话中的单调样本序号。 */
  var sampleIndex: Long = -1L
    private set
  /** 输入信号的采集时间，单位纳秒；滤波不平移时间轴。 */
  var timestampNanos: Long = 0L
    private set
  /** 因果带通后的脉搏幅值，任意单位。 */
  var value: Double = 0.0
    private set
  /** 此点是否是本滤波运行的首个有效点。 */
  var beginsValidRange: Boolean = false
    private set
  /** 首个有效点实际等待的传感器时间，非首点为空。 */
  var startupElapsedNanos: Long? = null
    private set
  /** 配置的启动排除时长，单位纳秒。 */
  var configuredStartupExclusionNanos: Long = 0L
    private set
  /** 因果滤波没有未来样本依赖，前视延迟恒为零纳秒。 */
  var lookaheadDelayNanos: Long = 0L
    private set

  /** 清除前一次调用的输出状态。 */
  internal fun clear() {
    hasSample = false
    segmentIndex = -1L
    sampleIndex = -1L
    timestampNanos = 0L
    value = 0.0
    beginsValidRange = false
    startupElapsedNanos = null
    configuredStartupExclusionNanos = 0L
    lookaheadDelayNanos = 0L
  }

  /** 写入一条有效滤波输出。 */
  internal fun setFiltered(
    segmentIndex: Long,
    sampleIndex: Long,
    timestampNanos: Long,
    value: Double,
    beginsValidRange: Boolean,
    startupElapsedNanos: Long?,
    configuredStartupExclusionNanos: Long,
  ) {
    hasSample = true
    this.segmentIndex = segmentIndex
    this.sampleIndex = sampleIndex
    this.timestampNanos = timestampNanos
    this.value = value
    this.beginsValidRange = beginsValidRange
    this.startupElapsedNanos = startupElapsedNanos
    this.configuredStartupExclusionNanos = configuredStartupExclusionNanos
    lookaheadDelayNanos = 0L
  }
}

/** 串行处理一个片段的 POS 输出；不依赖未来样本，也不修饰采集时间。 */
internal class RppgCausalBandpass(
  /** 版本化采样率、带通边界及启动排除参数。 */
  private val config: RPPGConfig,
) {
  /** 本滤波器配置的启动排除量，单位纳秒。 */
  val startupExclusionNanos: Long = config.filterStartupExclusionNanos
  /** 输出不等待未来样本，滤波前视延迟恒为零纳秒。 */
  val lookaheadDelayNanos: Long = 0L
  /** 当前滤波运行中首个有效采集时间；重置或片段切换后为空。 */
  var firstValidTimestampNanos: Long? = null
    private set

  private val highPassPole: Double
  private val highPassGain: Double
  private val lowPassPole: Double
  private val lowPassGain: Double
  private var activeSegmentIndex: Long? = null
  private var lastSegmentSampleIndex: Long? = null
  private var lastInputTimestampNanos: Long? = null
  private var runStartTimestampNanos: Long? = null
  private var initialized = false
  private var previousInput = 0.0
  private var previousHighPassOutput = 0.0
  private var previousLowPassInput = 0.0
  private var previousLowPassOutput = 0.0

  init {
    val highPassK = tan(PI * config.bandpassLowHz / config.resamplingRateHz)
    val lowPassK = tan(PI * config.bandpassHighHz / config.resamplingRateHz)
    require(highPassK.isFinite() && lowPassK.isFinite() && highPassK > 0.0 && lowPassK > 0.0)
    highPassPole = (1.0 - highPassK) / (1.0 + highPassK)
    highPassGain = 1.0 / (1.0 + highPassK)
    lowPassPole = (1.0 - lowPassK) / (1.0 + lowPassK)
    lowPassGain = lowPassK / (1.0 + lowPassK)
  }

  /** 按片段串行滤波；无效 POS 输入重置状态，不以零值填补。 */
  fun accept(input: RppgPosOutput, output: RppgFilteredSample): RppgFilterEvent {
    output.clear()
    if (!input.hasSample) return RppgFilterEvent.NO_INPUT

    require(input.segmentIndex >= 0L && input.sampleIndex >= 0L && input.timestampNanos >= 0L)
    val previousSegmentIndex = activeSegmentIndex
    if (previousSegmentIndex != null && input.segmentIndex != previousSegmentIndex) {
      require(input.segmentIndex > previousSegmentIndex) { "filter segment indexes must increase" }
      resetFilterRun()
      lastSegmentSampleIndex = null
      lastInputTimestampNanos = null
    }
    lastSegmentSampleIndex?.let { previous ->
      require(previous < Long.MAX_VALUE && input.sampleIndex == previous + 1L) {
        "filter input sample indexes must be contiguous within a segment"
      }
    }
    lastInputTimestampNanos?.let { previous ->
      require(input.timestampNanos > previous) { "filter timestamps must increase within a segment" }
    }
    activeSegmentIndex = input.segmentIndex
    lastSegmentSampleIndex = input.sampleIndex
    lastInputTimestampNanos = input.timestampNanos

    if (!input.valid || !input.value.isFinite()) {
      resetFilterRun()
      return if (input.valid) RppgFilterEvent.NUMERIC_FAILURE else RppgFilterEvent.INVALID_INPUT
    }

    if (!initialized) initializeRun(input.timestampNanos, input.value)
    val highPassOutput = highPassGain * (input.value - previousInput) + highPassPole * previousHighPassOutput
    previousInput = input.value
    previousHighPassOutput = highPassOutput
    val lowPassOutput = lowPassGain * (highPassOutput + previousLowPassInput) +
      lowPassPole * previousLowPassOutput
    previousLowPassInput = highPassOutput
    previousLowPassOutput = lowPassOutput
    if (!lowPassOutput.isFinite()) {
      resetFilterRun()
      return RppgFilterEvent.NUMERIC_FAILURE
    }

    val startTimestamp = checkNotNull(runStartTimestampNanos)
    val elapsedNanos = input.timestampNanos - startTimestamp
    if (elapsedNanos < startupExclusionNanos) return RppgFilterEvent.STARTUP_EXCLUDED

    val firstValid = firstValidTimestampNanos == null
    if (firstValid) firstValidTimestampNanos = input.timestampNanos
    output.setFiltered(
      segmentIndex = input.segmentIndex,
      sampleIndex = input.sampleIndex,
      timestampNanos = input.timestampNanos,
      value = lowPassOutput,
      beginsValidRange = firstValid,
      startupElapsedNanos = if (firstValid) elapsedNanos else null,
      configuredStartupExclusionNanos = startupExclusionNanos,
    )
    return RppgFilterEvent.SAMPLE_FILTERED
  }

  /** 清空片段样本编号、片段和所有滤波状态。 */
  fun resetSession() {
    resetFilterRun()
    activeSegmentIndex = null
    lastSegmentSampleIndex = null
    lastInputTimestampNanos = null
  }

  private fun initializeRun(timestampNanos: Long, firstInput: Double) {
    runStartTimestampNanos = timestampNanos
    firstValidTimestampNanos = null
    previousInput = firstInput
    previousHighPassOutput = 0.0
    previousLowPassInput = 0.0
    previousLowPassOutput = 0.0
    initialized = true
  }

  private fun resetFilterRun() {
    runStartTimestampNanos = null
    firstValidTimestampNanos = null
    initialized = false
    previousInput = 0.0
    previousHighPassOutput = 0.0
    previousLowPassInput = 0.0
    previousLowPassOutput = 0.0
  }
}
