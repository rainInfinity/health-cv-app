/** 从已定稿有效滤波波形检测可信局部峰，独立于频谱窗口输出最新 RR。 */
package com.healthcvapp.acquisition.rppg.signal

import com.healthcvapp.acquisition.rppg.model.RPPGConfig
import com.healthcvapp.acquisition.rppg.model.RPPGInstantHeartRate
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong

/** 单线程使用；只有新合格读数分配结果，逐样本状态和幅值回看环均复用。 */
internal class RppgBeatHeartRateEstimator(private val config: RPPGConfig) {
  private val rules = config.beatDetection
  private val samplePeriodNanos = 1_000_000_000.0 / config.resamplingRateHz
  private val timestampToleranceNanos = max(1.0, samplePeriodNanos * rules.maximumSamplePeriodDeviationFraction)
  private val minimumIntervalNanos = floor(60_000_000_000.0 / config.maximumHeartRateBpm).toLong()
  private val maximumIntervalNanos = ceil(60_000_000_000.0 / config.minimumHeartRateBpm).toLong()
  private val prominenceValues: DoubleArray
  private var rangeCount = 0
  private var rangePosition = 0
  private var activeSegment = -1L
  private var lastSampleIndex = -1L
  private var lastSampleTimestamp = -1L
  private var shapeCount = 0
  private var leftValue = 0.0
  private var middleValue = 0.0
  private var leftTimestamp = 0L
  private var middleTimestamp = 0L
  private var troughValue = Double.POSITIVE_INFINITY
  private var hasCandidate = false
  private var candidateTimestamp = 0L
  private var candidateValue = 0.0
  private var candidateProminence = 0.0
  private var candidateThreshold = 0.0
  private var lastPeakTimestamp = -1L
  private var previousIntervalNanos = 0L

  /** 当前合格逐搏值；无效或过期后为空，不回显旧值。 */
  var latestHeartRate: RPPGInstantHeartRate? = null
    private set

  init {
    val capacity = ceil(rules.prominenceWindowNanos / samplePeriodNanos)
    require(capacity.isFinite() && capacity >= 3.0 && capacity <= Int.MAX_VALUE.toDouble())
    require(rules.refractoryNanos < minimumIntervalNanos)
    require(rules.resultTimeoutNanos > maximumIntervalNanos)
    prominenceValues = DoubleArray(capacity.toInt())
  }

  /** 返回读数是否更新或被清空；片段、有效区间、样本和采集时间缺口均重新确认。 */
  fun accept(input: RppgFilteredSample): Boolean {
    if (!input.hasSample) return false
    val previousResult = latestHeartRate
    if (!input.value.isFinite() || input.segmentIndex < 0L || input.sampleIndex < 0L || input.timestampNanos < 0L) {
      resetSession()
      return previousResult != null
    }
    val discontinuous = activeSegment != input.segmentIndex || input.beginsValidRange ||
      (lastSampleIndex >= 0L && (lastSampleIndex == Long.MAX_VALUE || input.sampleIndex != lastSampleIndex + 1L)) ||
      (lastSampleTimestamp >= 0L && (
        input.timestampNanos <= lastSampleTimestamp ||
          abs((input.timestampNanos - lastSampleTimestamp).toDouble() - samplePeriodNanos) > timestampToleranceNanos
        ))
    if (discontinuous) clearDetection()
    if (lastPeakTimestamp >= 0L && input.timestampNanos - lastPeakTimestamp > rules.resultTimeoutNanos) {
      clearDetection()
    }
    activeSegment = input.segmentIndex
    lastSampleIndex = input.sampleIndex
    lastSampleTimestamp = input.timestampNanos

    prominenceValues[rangePosition] = input.value
    rangePosition++
    if (rangePosition == prominenceValues.size) rangePosition = 0
    if (rangeCount < prominenceValues.size) rangeCount++
    troughValue = min(troughValue, input.value)

    if (hasCandidate && input.timestampNanos - candidateTimestamp > maximumIntervalNanos) hasCandidate = false
    if (shapeCount >= 2 && middleValue > leftValue && middleValue >= input.value) {
      val threshold = prominenceThreshold()
      if (!threshold.isFinite()) {
        clearDetection()
        return previousResult !== latestHeartRate
      }
      if (!hasCandidate || middleValue > candidateValue) {
        hasCandidate = true
        candidateTimestamp = interpolatedPeakTimestamp(input.timestampNanos, input.value)
        candidateValue = middleValue
        candidateProminence = middleValue - troughValue
        candidateThreshold = threshold
      }
    }
    if (hasCandidate && candidateProminence >= candidateThreshold && candidateValue - input.value >= candidateThreshold) {
      acceptPeak(candidateTimestamp)
      hasCandidate = false
      troughValue = input.value
    }

    leftValue = middleValue
    leftTimestamp = middleTimestamp
    middleValue = input.value
    middleTimestamp = input.timestampNanos
    if (shapeCount < 2) shapeCount++
    return previousResult !== latestHeartRate
  }

  /** 无效 ROI 和会话结束时由调用方主动清空；下一次输入从独立区间开始。 */
  fun resetSession() {
    clearDetection()
    activeSegment = -1L
    lastSampleIndex = -1L
    lastSampleTimestamp = -1L
  }

  /** 仅在候选峰处扫描固定环，不逐样本复制或重新计算整段历史。 */
  private fun prominenceThreshold(): Double {
    var minimum = Double.POSITIVE_INFINITY
    var maximum = Double.NEGATIVE_INFINITY
    for (index in 0 until rangeCount) {
      minimum = min(minimum, prominenceValues[index])
      maximum = max(maximum, prominenceValues[index])
    }
    return max(rules.minimumProminence, (maximum - minimum) * rules.prominenceRangeFraction)
  }

  /** 三点抛物线插值只细化采集峰时间，不使用处理或发布时间。 */
  private fun interpolatedPeakTimestamp(rightTimestamp: Long, rightValue: Double): Long {
    val curvature = leftValue - 2.0 * middleValue + rightValue
    if (!curvature.isFinite() || curvature >= 0.0) return middleTimestamp
    val fraction = (0.5 * (leftValue - rightValue) / curvature).coerceIn(-0.5, 0.5)
    if (!fraction.isFinite()) return middleTimestamp
    val offset = (fraction * (rightTimestamp - leftTimestamp) / 2.0).roundToLong()
    return middleTimestamp + offset
  }

  /** 校验新峰的间隔和一致性，仅确认后创建当前 RR 的读数。 */
  private fun acceptPeak(timestampNanos: Long) {
    if (lastPeakTimestamp < 0L) {
      lastPeakTimestamp = timestampNanos
      return
    }
    val interval = timestampNanos - lastPeakTimestamp
    // 不应期中的局部重复峰不构成一个新 RR，也不替换前一个可信峰。
    if (interval < rules.refractoryNanos) return
    if (interval < minimumIntervalNanos || interval > maximumIntervalNanos) {
      restartConfirmation(timestampNanos)
      return
    }
    if (previousIntervalNanos > 0L &&
      abs(interval - previousIntervalNanos).toDouble() > previousIntervalNanos * rules.maximumIntervalChangeFraction
    ) {
      restartConfirmation(timestampNanos)
      return
    }
    if (previousIntervalNanos > 0L) {
      latestHeartRate = RPPGInstantHeartRate(
        segmentIndex = activeSegment,
        previousPeakTimestampNanos = lastPeakTimestamp,
        peakTimestampNanos = timestampNanos,
        intervalNanos = interval,
        heartRateBpm = 60_000_000_000.0 / interval,
      )
    }
    previousIntervalNanos = interval
    lastPeakTimestamp = timestampNanos
  }

  /** 异常 RR 只留下当前峰作为新起点，之后仍需两个全新的合格间隔。 */
  private fun restartConfirmation(timestampNanos: Long) {
    latestHeartRate = null
    lastPeakTimestamp = timestampNanos
    previousIntervalNanos = 0L
  }

  /** 清空峰、突出度和读数历史，下一段必须重新完成三峰确认。 */
  private fun clearDetection() {
    latestHeartRate = null
    rangeCount = 0
    rangePosition = 0
    shapeCount = 0
    troughValue = Double.POSITIVE_INFINITY
    hasCandidate = false
    lastPeakTimestamp = -1L
    previousIntervalNanos = 0L
  }
}
