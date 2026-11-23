/** 从同片段滤波脉搏波计算带质量语义的滑动心率窗口。 */
package com.healthcvapp.acquisition.rppg.signal

import com.healthcvapp.acquisition.rppg.model.RPPGConfig
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.log10
import kotlin.math.roundToLong
import kotlin.math.sin
import kotlin.math.cos

/** 表示心率窗口积累、等待步长或已经评估。 */
internal enum class RppgHeartRateEvent {
  NO_INPUT,
  ACCUMULATING,
  WAITING_FOR_STEP,
  WINDOW_EVALUATED,
}

/** 稳定描述当前心率窗口无有效 bpm 的原因。 */
internal enum class RppgHeartRateRejectionReason {
  INSUFFICIENT_SAMPLES,
  ZERO_ENERGY,
  BOUNDARY_PEAK,
  DEGENERATE_PEAK,
  UNDEFINED_SNR,
  LOW_SNR,
  OUT_OF_RANGE,
  NUMERIC_FAILURE,
}

/** 可复用的 HR 窗口结果；无效 bpm 由 hasHeartRate 和拒绝原因表达。 */
internal class RppgHeartRateOutput {
  /** 本次调用是否评估了完整 HR 窗口。 */
  var hasWindow: Boolean = false
    private set
  /** 窗口是否通过质量条件并产生 bpm。 */
  var hasHeartRate: Boolean = false
    private set
  /** 有效心率，单位 bpm；无效时为有限零值且 hasHeartRate=false。 */
  var heartRateBpm: Double = 0.0
    private set
  /** 是否存在可计算的频谱 SNR。 */
  var hasSnr: Boolean = false
    private set
  /** 主峰质量指标，单位 dB；hasSnr=false 时不得解释此值。 */
  var snrDb: Double = 0.0
    private set
  /** 是否已得到范围内的主峰频率。 */
  var hasPeakFrequency: Boolean = false
    private set
  /** 抛物线插值后的主峰频率，单位 Hz。 */
  var peakFrequencyHz: Double = 0.0
    private set
  /** 结果所属连续片段序号。 */
  var segmentIndex: Long = -1L
    private set
  /** HR 窗口首个样本的会话序号。 */
  var windowStartSampleIndex: Long = -1L
    private set
  /** HR 窗口最后一个样本的会话序号。 */
  var windowEndSampleIndex: Long = -1L
    private set
  /** HR 窗口首样本采集时间，单位纳秒。 */
  var windowStartTimestampNanos: Long = 0L
    private set
  /** HR 窗口末样本采集时间，单位纳秒。 */
  var windowEndTimestampNanos: Long = 0L
    private set
  /** 配置的 HR 窗口长度，单位纳秒。 */
  var configuredWindowNanos: Long = 0L
    private set
  /** 当前片段已积累的有效滤波样本数。 */
  var samplesCollected: Int = 0
    private set
  /** 当前结果无有效心率时的稳定原因；积累阶段为 INSUFFICIENT_SAMPLES。 */
  var rejectionReason: RppgHeartRateRejectionReason? = null
    private set

  /** 清除前一次调用的输出状态。 */
  internal fun clear() {
    hasWindow = false
    hasHeartRate = false
    heartRateBpm = 0.0
    hasSnr = false
    snrDb = 0.0
    hasPeakFrequency = false
    peakFrequencyHz = 0.0
    segmentIndex = -1L
    windowStartSampleIndex = -1L
    windowEndSampleIndex = -1L
    windowStartTimestampNanos = 0L
    windowEndTimestampNanos = 0L
    configuredWindowNanos = 0L
    samplesCollected = 0
    rejectionReason = null
  }

  /** 标记尚未形成完整窗口的积累状态，不构造虚假 HR 记录。 */
  internal fun setAccumulating(segmentIndex: Long, samplesCollected: Int) {
    this.segmentIndex = segmentIndex
    this.samplesCollected = samplesCollected
    rejectionReason = RppgHeartRateRejectionReason.INSUFFICIENT_SAMPLES
  }

  /** 填充本次实际评估窗口的采集范围与配置长度。 */
  internal fun setWindow(
    segmentIndex: Long,
    startSampleIndex: Long,
    endSampleIndex: Long,
    startTimestampNanos: Long,
    endTimestampNanos: Long,
    configuredWindowNanos: Long,
  ) {
    hasWindow = true
    this.segmentIndex = segmentIndex
    windowStartSampleIndex = startSampleIndex
    windowEndSampleIndex = endSampleIndex
    windowStartTimestampNanos = startTimestampNanos
    windowEndTimestampNanos = endTimestampNanos
    this.configuredWindowNanos = configuredWindowNanos
  }

  /** 记录一个有限主峰频率。 */
  internal fun setPeak(frequencyHz: Double) {
    if (!frequencyHz.isFinite()) return
    hasPeakFrequency = true
    peakFrequencyHz = frequencyHz
  }

  /** 记录可计算的有限频谱质量值。 */
  internal fun setSnr(valueDb: Double) {
    if (!valueDb.isFinite()) return
    hasSnr = true
    snrDb = valueDb
  }

  /** 拒绝窗口且保持 bpm 为空语义。 */
  internal fun reject(reason: RppgHeartRateRejectionReason) {
    hasHeartRate = false
    heartRateBpm = 0.0
    rejectionReason = reason
  }

  /** 写入通过所有质量条件的有限 bpm。 */
  internal fun acceptHeartRate(valueBpm: Double) {
    hasHeartRate = true
    heartRateBpm = valueBpm
    rejectionReason = null
  }
}

/** 以有界同片段窗口、Hann 加窗 DFT 和 SNR 规则估计 HR。 */
internal class RppgHeartRateEstimator(
  /** 版本化 HR 搜索范围、窗口、步长和质量门槛。 */
  private val config: RPPGConfig,
) {
  /** HR 窗口样本数，按规则采样率向上取整。 */
  val windowSampleCount: Int = calculateWindowSampleCount(config)
  /** 相邻 HR 估计之间的规则样本数。 */
  val stepSampleCount: Int = calculateStepSampleCount(config)

  private val frequencyResolutionHz = config.resamplingRateHz / windowSampleCount
  // 覆盖与搜索区间相交的边界 bin，再各计算一个相邻 bin，避免短窗离散化缩窄范围。
  private val minimumSearchBin = floor(config.minimumHeartRateBpm / 60.0 / frequencyResolutionHz).toInt()
  private val maximumSearchBin = ceil(config.maximumHeartRateBpm / 60.0 / frequencyResolutionHz).toInt()
  private val minimumBin = minimumSearchBin - 1
  private val maximumBin = maximumSearchBin + 1
  private val spectrumBinCount = maximumBin - minimumBin + 1
  private val minimumSearchOffset = minimumSearchBin - minimumBin
  private val maximumSearchOffset = maximumSearchBin - minimumBin
  private val minimumPowerOffset =
    ceil(config.minimumHeartRateBpm / 60.0 / frequencyResolutionHz).toInt() - minimumBin
  private val maximumPowerOffset =
    floor(config.maximumHeartRateBpm / 60.0 / frequencyResolutionHz).toInt() - minimumBin
  private val snrPeakHalfWidthHz =
    RPPGConfig.HANN_MAIN_LOBE_HALF_WIDTH_BINS * config.resamplingRateHz / (windowSampleCount - 1)
  private val values = DoubleArray(windowSampleCount)
  private val sampleIndices = LongArray(windowSampleCount)
  private val timestampsNanos = LongArray(windowSampleCount)
  private val hannWindow = DoubleArray(windowSampleCount)
  private val cosineTable: DoubleArray
  private val sineTable: DoubleArray
  private val powers = DoubleArray(spectrumBinCount)
  private var writePosition = 0
  private var samplesInWindow = 0
  private var hasCompletedFirstWindow = false
  private var samplesUntilNextWindow = 0
  private var activeSegmentIndex: Long? = null
  private var lastAcceptedSampleIndex: Long? = null
  private var lastAcceptedTimestampNanos: Long? = null

  init {
    require(minimumSearchBin > 0 && maximumSearchBin < windowSampleCount / 2) {
      "heart-rate search range must leave neighboring bins below Nyquist"
    }
    require(maximumPowerOffset - minimumPowerOffset + 1 >= 3) {
      "heart-rate search range must contain at least three spectrum bins"
    }
    val tableElements = spectrumBinCount.toLong() * windowSampleCount
    require(tableElements <= Int.MAX_VALUE) { "heart-rate spectrum table is too large" }
    cosineTable = DoubleArray(tableElements.toInt())
    sineTable = DoubleArray(tableElements.toInt())
    for (index in 0 until windowSampleCount) {
      hannWindow[index] = 0.5 * (1.0 - cos(2.0 * PI * index / (windowSampleCount - 1)))
    }
    for (binOffset in 0 until spectrumBinCount) {
      val bin = minimumBin + binOffset
      val tableOffset = binOffset * windowSampleCount
      for (sampleOffset in 0 until windowSampleCount) {
        val angle = 2.0 * PI * bin * sampleOffset / windowSampleCount
        cosineTable[tableOffset + sampleOffset] = cos(angle)
        sineTable[tableOffset + sampleOffset] = sin(angle)
      }
    }
  }

  /** 接受有效因果滤波点；片段或有效区间变化都会清空历史窗口。 */
  fun accept(input: RppgFilteredSample, output: RppgHeartRateOutput): RppgHeartRateEvent {
    output.clear()
    if (!input.hasSample) return RppgHeartRateEvent.NO_INPUT
    require(input.segmentIndex >= 0L && input.sampleIndex >= 0L && input.timestampNanos >= 0L)
    require(input.value.isFinite()) { "filtered HR input must be finite" }

    val previousSegment = activeSegmentIndex
    val segmentChanged = previousSegment != null && previousSegment != input.segmentIndex
    if (segmentChanged) {
      require(input.segmentIndex > checkNotNull(previousSegment)) { "heart-rate segment indexes must increase" }
    }
    val beginNewRange = previousSegment == null || segmentChanged || input.beginsValidRange
    lastAcceptedSampleIndex?.let { previous ->
      require(input.sampleIndex > previous) { "heart-rate sample indexes must increase" }
      if (!beginNewRange) {
        require(previous < Long.MAX_VALUE && input.sampleIndex == previous + 1L) {
          "heart-rate input gaps must start a new valid range"
        }
      }
    }
    if (beginNewRange) {
      clearWindow()
      activeSegmentIndex = input.segmentIndex
      lastAcceptedTimestampNanos = null
    }
    lastAcceptedTimestampNanos?.let { previous ->
      require(input.timestampNanos > previous) { "heart-rate timestamps must increase within a valid range" }
    }
    lastAcceptedSampleIndex = input.sampleIndex
    lastAcceptedTimestampNanos = input.timestampNanos

    values[writePosition] = input.value
    sampleIndices[writePosition] = input.sampleIndex
    timestampsNanos[writePosition] = input.timestampNanos
    writePosition++
    if (writePosition == windowSampleCount) writePosition = 0
    if (samplesInWindow < windowSampleCount) samplesInWindow++

    if (samplesInWindow < windowSampleCount) {
      output.setAccumulating(input.segmentIndex, samplesInWindow)
      return RppgHeartRateEvent.ACCUMULATING
    }
    if (hasCompletedFirstWindow) {
      samplesUntilNextWindow--
      if (samplesUntilNextWindow > 0) return RppgHeartRateEvent.WAITING_FOR_STEP
    }
    hasCompletedFirstWindow = true
    samplesUntilNextWindow = stepSampleCount
    evaluateWindow(input.segmentIndex, output)
    return RppgHeartRateEvent.WINDOW_EVALUATED
  }

  /** 清除当前窗口与会话样本序号，防止下一会话继承频谱历史。 */
  fun resetSession() {
    clearWindow()
    activeSegmentIndex = null
    lastAcceptedSampleIndex = null
    lastAcceptedTimestampNanos = null
  }

  private fun evaluateWindow(segmentIndex: Long, output: RppgHeartRateOutput) {
    val startPosition = writePosition
    output.setWindow(
      segmentIndex = segmentIndex,
      startSampleIndex = sampleIndices[startPosition],
      endSampleIndex = sampleIndices[previousPosition(writePosition)],
      startTimestampNanos = timestampsNanos[startPosition],
      endTimestampNanos = timestampsNanos[previousPosition(writePosition)],
      configuredWindowNanos = config.heartRateWindowNanos,
    )

    var signalMean = 0.0
    for (offset in 0 until windowSampleCount) {
      signalMean += values[ringPosition(startPosition, offset)]
    }
    signalMean /= windowSampleCount
    if (!signalMean.isFinite()) {
      output.reject(RppgHeartRateRejectionReason.NUMERIC_FAILURE)
      return
    }

    for (binOffset in 0 until spectrumBinCount) {
      val tableOffset = binOffset * windowSampleCount
      var real = 0.0
      var imaginary = 0.0
      for (sampleOffset in 0 until windowSampleCount) {
        val position = ringPosition(startPosition, sampleOffset)
        val windowed = (values[position] - signalMean) * hannWindow[sampleOffset]
        real += windowed * cosineTable[tableOffset + sampleOffset]
        imaginary -= windowed * sineTable[tableOffset + sampleOffset]
      }
      powers[binOffset] = real * real + imaginary * imaginary
      if (!powers[binOffset].isFinite()) {
        output.reject(RppgHeartRateRejectionReason.NUMERIC_FAILURE)
        return
      }
    }

    var totalBandPower = 0.0
    for (offset in minimumPowerOffset..maximumPowerOffset) totalBandPower += powers[offset]
    var peakOffset = minimumSearchOffset
    var maximumPower = -1.0
    for (offset in minimumSearchOffset..maximumSearchOffset) {
      val power = powers[offset]
      if (power > maximumPower) {
        maximumPower = power
        peakOffset = offset
      }
    }
    if (!totalBandPower.isFinite()) {
      output.reject(RppgHeartRateRejectionReason.NUMERIC_FAILURE)
      return
    }
    if (totalBandPower <= 0.0) {
      output.reject(RppgHeartRateRejectionReason.ZERO_ENERGY)
      return
    }
    // 边界候选也必须是真正的局部峰；带外斜坡不能被搜索端点冒充心率。
    if (powers[peakOffset] < powers[peakOffset - 1] || powers[peakOffset] < powers[peakOffset + 1]) {
      output.setPeak((minimumBin + peakOffset) * frequencyResolutionHz)
      output.reject(RppgHeartRateRejectionReason.BOUNDARY_PEAK)
      return
    }

    val leftPower = powers[peakOffset - 1]
    val centerPower = powers[peakOffset]
    val rightPower = powers[peakOffset + 1]
    if (leftPower <= 0.0 || centerPower <= 0.0 || rightPower <= 0.0) {
      output.reject(RppgHeartRateRejectionReason.DEGENERATE_PEAK)
      return
    }
    val leftLog = ln(leftPower)
    val centerLog = ln(centerPower)
    val rightLog = ln(rightPower)
    val curvature = leftLog - 2.0 * centerLog + rightLog
    if (!curvature.isFinite() || curvature >= -MIN_PEAK_CURVATURE) {
      output.reject(RppgHeartRateRejectionReason.DEGENERATE_PEAK)
      return
    }
    val binOffset = 0.5 * (leftLog - rightLog) / curvature
    if (!binOffset.isFinite() || abs(binOffset) > 0.5) {
      output.reject(RppgHeartRateRejectionReason.DEGENERATE_PEAK)
      return
    }
    val peakFrequencyHz = (minimumBin + peakOffset + binOffset) * frequencyResolutionHz
    if (!peakFrequencyHz.isFinite()) {
      output.reject(RppgHeartRateRejectionReason.NUMERIC_FAILURE)
      return
    }
    output.setPeak(peakFrequencyHz)
    if (peakFrequencyHz < config.minimumHeartRateBpm / 60.0 ||
      peakFrequencyHz > config.maximumHeartRateBpm / 60.0
    ) {
      output.reject(RppgHeartRateRejectionReason.OUT_OF_RANGE)
      return
    }

    var peakBandPower = 0.0
    var remainingBandPower = 0.0
    // 仅统计心率搜索带内 bin 中心的功率；插值辅助 bin 不参与 SNR。
    // 对称 Hann 的主瓣半宽由 fs/(N-1) 决定，不能固定为小于短窗分辨率的 0.1 Hz。
    for (offset in minimumPowerOffset..maximumPowerOffset) {
      val frequencyHz = (minimumBin + offset) * frequencyResolutionHz
      if (abs(frequencyHz - peakFrequencyHz) <= snrPeakHalfWidthHz) {
        peakBandPower += powers[offset]
      } else {
        remainingBandPower += powers[offset]
      }
    }
    if (!peakBandPower.isFinite() || !remainingBandPower.isFinite()) {
      output.reject(RppgHeartRateRejectionReason.NUMERIC_FAILURE)
      return
    }
    if (peakBandPower <= 0.0) {
      output.reject(RppgHeartRateRejectionReason.ZERO_ENERGY)
      return
    }
    if (remainingBandPower <= 0.0) {
      output.reject(RppgHeartRateRejectionReason.UNDEFINED_SNR)
      return
    }
    val snrDb = 10.0 * (log10(peakBandPower) - log10(remainingBandPower))
    if (!snrDb.isFinite()) {
      output.reject(RppgHeartRateRejectionReason.UNDEFINED_SNR)
      return
    }
    output.setSnr(snrDb)
    if (snrDb < config.minimumHeartRateSnrDb) {
      output.reject(RppgHeartRateRejectionReason.LOW_SNR)
      return
    }

    val heartRateBpm = peakFrequencyHz * 60.0
    if (!heartRateBpm.isFinite()) {
      output.reject(RppgHeartRateRejectionReason.NUMERIC_FAILURE)
      return
    }
    output.acceptHeartRate(heartRateBpm)
  }

  private fun clearWindow() {
    writePosition = 0
    samplesInWindow = 0
    hasCompletedFirstWindow = false
    samplesUntilNextWindow = 0
  }

  private fun previousPosition(nextPosition: Int): Int =
    if (nextPosition == 0) windowSampleCount - 1 else nextPosition - 1

  private fun ringPosition(start: Int, offset: Int): Int {
    val position = start + offset
    return if (position >= windowSampleCount) position - windowSampleCount else position
  }

  private companion object {
    const val NANOS_PER_SECOND = 1_000_000_000.0
    const val MIN_PEAK_CURVATURE = 1e-12

    fun calculateWindowSampleCount(config: RPPGConfig): Int {
      val count = ceil(
        config.heartRateWindowNanos.toDouble() * config.resamplingRateHz / NANOS_PER_SECOND,
      )
      require(count.isFinite() && count >= 3.0 && count < Int.MAX_VALUE.toDouble()) {
        "heart-rate window must contain at least three samples and fit in memory"
      }
      return count.toInt()
    }

    fun calculateStepSampleCount(config: RPPGConfig): Int {
      val count = ceil(
        config.heartRateStepNanos.toDouble() * config.resamplingRateHz / NANOS_PER_SECOND,
      )
      require(count.isFinite() && count >= 1.0 && count < Int.MAX_VALUE.toDouble()) {
        "heart-rate step must contain at least one sample and fit in memory"
      }
      return count.toInt()
    }
  }
}
