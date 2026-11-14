/** 计算滑动 POS 脉搏波，并只输出不再受未来窗口影响的样本。 */
package com.healthcvapp.acquisition.rppg.signal

import com.healthcvapp.acquisition.rppg.model.RPPGConfig
import kotlin.math.ceil
import kotlin.math.sqrt

/** 表示滑动 POS 当前尚在积累窗口或已定稿一个样本。 */
internal enum class RppgPosEvent {
  ACCUMULATING_WINDOW,
  SAMPLE_FINALIZED,
}

/** 说明最终脉搏样本缺少有效 POS 窗口贡献的原因。 */
internal enum class RppgPosRejectionReason {
  NO_VALID_WINDOW_CONTRIBUTION,
}

/** 可复用的单点输出容器；无效样本的幅值保持为有限零值并由状态区分。 */
internal class RppgPosOutput {
  /** 本次调用是否已定稿样本。 */
  var hasSample: Boolean = false
    private set
  /** 定稿幅值是否有效；false 时不得将 value 当作测量值。 */
  var valid: Boolean = false
    private set
  /** 样本所属片段序号。 */
  var segmentIndex: Long = -1L
    private set
  /** 样本所属会话中的单调序号。 */
  var sampleIndex: Long = -1L
    private set
  /** 原始采集时间，单位纳秒。 */
  var timestampNanos: Long = 0L
    private set
  /** 定稿脉搏幅值，任意单位；无效时为有限零值。 */
  var value: Double = 0.0
    private set
  /** 参与重叠归一化的有效窗口数。 */
  var contributionCount: Int = 0
    private set
  /** 无效样本的稳定拒绝原因。 */
  var rejectionReason: RppgPosRejectionReason? = null
    private set

  /** 清除前一次调用的输出状态。 */
  internal fun clear() {
    hasSample = false
    valid = false
    segmentIndex = -1L
    sampleIndex = -1L
    timestampNanos = 0L
    value = 0.0
    contributionCount = 0
    rejectionReason = null
  }

  /** 写入一条已定稿 POS 输出。 */
  internal fun setFinalized(
    segmentIndex: Long,
    sampleIndex: Long,
    timestampNanos: Long,
    value: Double,
    contributionCount: Int,
  ) {
    hasSample = true
    this.segmentIndex = segmentIndex
    this.sampleIndex = sampleIndex
    this.timestampNanos = timestampNanos
    this.contributionCount = contributionCount
    valid = contributionCount > 0 && value.isFinite()
    this.value = if (valid) value else 0.0
    rejectionReason = if (valid) null else RppgPosRejectionReason.NO_VALID_WINDOW_CONTRIBUTION
  }
}

/** 记录结束或片段切换时无法等待未来窗口定稿的样本闭区间。 */
internal class RppgPosDiscardedTail {
  /** 是否存在被丢弃的未定稿范围。 */
  var hasRange: Boolean = false
    private set
  /** 范围所属片段序号。 */
  var segmentIndex: Long = -1L
    private set
  /** 首个未定稿样本序号，包含端点。 */
  var firstSampleIndex: Long = -1L
    private set
  /** 最后一个输入样本序号，包含端点。 */
  var lastSampleIndex: Long = -1L
    private set

  /** 清除前一次调用留下的范围。 */
  internal fun clear() {
    hasRange = false
    segmentIndex = -1L
    firstSampleIndex = -1L
    lastSampleIndex = -1L
  }

  /** 记录一段确实尚未定稿的样本。 */
  internal fun set(segmentIndex: Long, firstSampleIndex: Long, lastSampleIndex: Long) {
    hasRange = true
    this.segmentIndex = segmentIndex
    this.firstSampleIndex = firstSampleIndex
    this.lastSampleIndex = lastSampleIndex
  }
}

/** 每个重采样点推进一个 POS 窗口，保存有限原始点及重叠和／权重。 */
internal class RppgPosProcessor(
  /** 版本化 POS 窗口与采样率参数。 */
  private val config: RPPGConfig,
) {
  /** 窗口样本数，由配置时长和规则采样率确定。 */
  val windowSampleCount: Int = calculateWindowSampleCount(config)

  private val red = DoubleArray(windowSampleCount)
  private val green = DoubleArray(windowSampleCount)
  private val blue = DoubleArray(windowSampleCount)
  private val sampleIndices = LongArray(windowSampleCount)
  private val timestampsNanos = LongArray(windowSampleCount)
  private val overlapSums = DoubleArray(windowSampleCount)
  private val overlapContributions = IntArray(windowSampleCount)
  private val projectionOne = DoubleArray(windowSampleCount)
  private val projectionTwo = DoubleArray(windowSampleCount)
  private var writePosition = 0
  private var samplesInWindow = 0
  private var activeSegmentIndex: Long? = null
  private var lastClosedSegmentIndex: Long? = null
  private var firstSegmentSampleIndex: Long? = null
  private var lastSegmentSampleIndex: Long? = null
  private var lastFinalizedSampleIndex: Long? = null
  private var lastSessionSampleIndex: Long? = null
  private var lastInputTimestampNanos: Long? = null

  /** 读取一个重采样点并推进窗口；片段切换时先通过 tail 记录上一段未定稿范围。 */
  fun accept(
    sample: RppgResampledRgb,
    output: RppgPosOutput,
    tail: RppgPosDiscardedTail,
  ): RppgPosEvent {
    output.clear()
    require(sample.segmentIndex >= 0L && sample.sampleIndex >= 0L && sample.timestampNanos >= 0L)
    require(
      sample.red.isFinite() && sample.red in 0.0..255.0 &&
        sample.green.isFinite() && sample.green in 0.0..255.0 &&
        sample.blue.isFinite() && sample.blue in 0.0..255.0,
    )
    lastSessionSampleIndex?.let { previous ->
      require(previous < Long.MAX_VALUE && sample.sampleIndex == previous + 1L) {
        "POS input sample indexes must be contiguous within a session"
      }
    }

    val currentSegment = activeSegmentIndex
    if (currentSegment != null && currentSegment != sample.segmentIndex) {
      require(sample.segmentIndex > currentSegment) { "POS segment indexes must increase" }
      finishSegment(tail)
    } else {
      tail.clear()
    }
    if (activeSegmentIndex == null) beginSegment(sample.segmentIndex, sample.sampleIndex)

    lastInputTimestampNanos?.let { previous ->
      require(sample.timestampNanos > previous) { "POS timestamps must increase within a segment" }
    }

    red[writePosition] = sample.red
    green[writePosition] = sample.green
    blue[writePosition] = sample.blue
    sampleIndices[writePosition] = sample.sampleIndex
    timestampsNanos[writePosition] = sample.timestampNanos
    overlapSums[writePosition] = 0.0
    overlapContributions[writePosition] = 0
    advanceWritePosition()
    if (samplesInWindow < windowSampleCount) samplesInWindow++

    lastSegmentSampleIndex = sample.sampleIndex
    lastInputTimestampNanos = sample.timestampNanos
    lastSessionSampleIndex = sample.sampleIndex
    if (samplesInWindow < windowSampleCount) return RppgPosEvent.ACCUMULATING_WINDOW

    val oldestPosition = writePosition
    if (calculateWindowProjection(oldestPosition)) addWindowContributions(oldestPosition)
    finalizeOldestSample(oldestPosition, output)
    return RppgPosEvent.SAMPLE_FINALIZED
  }

  /** 丢弃并记录本段无法定稿的尾部，清除状态以防下一段继承窗口。 */
  fun finishSegment(tail: RppgPosDiscardedTail): Boolean {
    tail.clear()
    val segment = activeSegmentIndex ?: return false
    val firstSample = firstSegmentSampleIndex ?: return false
    val lastSample = lastSegmentSampleIndex ?: return false
    val firstUnfinalizedSample = lastFinalizedSampleIndex?.plus(1L) ?: firstSample
    val hasTail = firstUnfinalizedSample <= lastSample
    lastClosedSegmentIndex = segment
    if (hasTail) tail.set(segment, firstUnfinalizedSample, lastSample)
    clearSegmentState()
    return hasTail
  }

  /** 清空本会话所有编号与 POS 状态；分段收尾应先调用 finishSegment 记录尾部。 */
  fun resetSession() {
    clearSegmentState()
    lastSessionSampleIndex = null
    lastClosedSegmentIndex = null
  }

  private fun beginSegment(segmentIndex: Long, firstSampleIndex: Long) {
    lastClosedSegmentIndex?.let { previous ->
      require(segmentIndex > previous) { "POS segment indexes must increase after a close" }
    }
    activeSegmentIndex = segmentIndex
    firstSegmentSampleIndex = firstSampleIndex
    lastSegmentSampleIndex = null
    lastFinalizedSampleIndex = null
    lastInputTimestampNanos = null
    writePosition = 0
    samplesInWindow = 0
  }

  private fun clearSegmentState() {
    for (index in 0 until windowSampleCount) {
      overlapSums[index] = 0.0
      overlapContributions[index] = 0
    }
    writePosition = 0
    samplesInWindow = 0
    activeSegmentIndex = null
    firstSegmentSampleIndex = null
    lastSegmentSampleIndex = null
    lastFinalizedSampleIndex = null
    lastInputTimestampNanos = null
  }

  private fun advanceWritePosition() {
    writePosition++
    if (writePosition == windowSampleCount) writePosition = 0
  }

  private fun calculateWindowProjection(oldestPosition: Int): Boolean {
    var redMean = 0.0
    var greenMean = 0.0
    var blueMean = 0.0
    for (offset in 0 until windowSampleCount) {
      val position = ringPosition(oldestPosition, offset)
      redMean += red[position]
      greenMean += green[position]
      blueMean += blue[position]
    }
    redMean /= windowSampleCount
    greenMean /= windowSampleCount
    blueMean /= windowSampleCount
    if (redMean <= MIN_CHANNEL_MEAN || greenMean <= MIN_CHANNEL_MEAN || blueMean <= MIN_CHANNEL_MEAN) {
      return false
    }

    var firstMean = 0.0
    var secondMean = 0.0
    for (offset in 0 until windowSampleCount) {
      val position = ringPosition(oldestPosition, offset)
      val normalizedRed = red[position] / redMean
      val normalizedGreen = green[position] / greenMean
      val normalizedBlue = blue[position] / blueMean
      val first = normalizedGreen - normalizedBlue
      val second = -2.0 * normalizedRed + normalizedGreen + normalizedBlue
      projectionOne[offset] = first
      projectionTwo[offset] = second
      firstMean += first
      secondMean += second
    }
    firstMean /= windowSampleCount
    secondMean /= windowSampleCount

    var firstVariance = 0.0
    var secondVariance = 0.0
    for (offset in 0 until windowSampleCount) {
      val firstDelta = projectionOne[offset] - firstMean
      val secondDelta = projectionTwo[offset] - secondMean
      firstVariance += firstDelta * firstDelta
      secondVariance += secondDelta * secondDelta
    }
    val firstDeviation = sqrt(firstVariance / windowSampleCount)
    val secondDeviation = sqrt(secondVariance / windowSampleCount)
    if (!firstDeviation.isFinite() || !secondDeviation.isFinite() ||
      firstDeviation <= MIN_PROJECTION_DEVIATION || secondDeviation <= MIN_PROJECTION_DEVIATION
    ) {
      return false
    }
    val ratio = firstDeviation / secondDeviation
    if (!ratio.isFinite()) return false

    var combinedMean = 0.0
    for (offset in 0 until windowSampleCount) {
      val combined = projectionOne[offset] + ratio * projectionTwo[offset]
      if (!combined.isFinite()) return false
      projectionOne[offset] = combined
      combinedMean += combined
    }
    combinedMean /= windowSampleCount
    for (offset in 0 until windowSampleCount) {
      projectionOne[offset] -= combinedMean
      if (!projectionOne[offset].isFinite()) return false
    }
    return true
  }

  private fun addWindowContributions(oldestPosition: Int) {
    for (offset in 0 until windowSampleCount) {
      val position = ringPosition(oldestPosition, offset)
      overlapSums[position] += projectionOne[offset]
      overlapContributions[position]++
    }
  }

  private fun finalizeOldestSample(position: Int, output: RppgPosOutput) {
    val contributions = overlapContributions[position]
    val value = if (contributions > 0) overlapSums[position] / contributions else 0.0
    output.setFinalized(
      segmentIndex = checkNotNull(activeSegmentIndex),
      sampleIndex = sampleIndices[position],
      timestampNanos = timestampsNanos[position],
      value = value,
      contributionCount = contributions,
    )
    lastFinalizedSampleIndex = sampleIndices[position]
    overlapSums[position] = 0.0
    overlapContributions[position] = 0
  }

  private fun ringPosition(start: Int, offset: Int): Int {
    val position = start + offset
    return if (position >= windowSampleCount) position - windowSampleCount else position
  }

  private companion object {
    const val MIN_CHANNEL_MEAN = 1e-9
    const val MIN_PROJECTION_DEVIATION = 1e-9

    fun calculateWindowSampleCount(config: RPPGConfig): Int {
      val count = ceil(
        config.posWindowNanos.toDouble() * config.resamplingRateHz / NANOS_PER_SECOND,
      )
      require(count.isFinite() && count in 2.0..Int.MAX_VALUE.toDouble()) {
        "POS window must contain at least two samples and fit in memory"
      }
      return count.toInt()
    }
  }
}

/** 纳秒与秒的换算常量。 */
private const val NANOS_PER_SECOND = 1_000_000_000.0
