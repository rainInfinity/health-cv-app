/** 按采集时间插值 RGB 样本，并在缺口或时间异常时开启新片段。 */
package com.healthcvapp.acquisition.rppg.signal

import com.healthcvapp.acquisition.rppg.model.RPPGConfig
import com.healthcvapp.acquisition.rppg.roi.RppgRgbMean
import kotlin.math.ceil
import kotlin.math.roundToLong

/** 表示一次输入对当前重采样片段的影响。 */
internal enum class RppgResamplerEvent {
  SEGMENT_STARTED,
  SAMPLE_ACCEPTED,
  INVALID_SAMPLE,
  INVALID_TIMESTAMP,
  NON_MONOTONIC_TIMESTAMP,
}

/** 说明最近一次重采样片段边界的成因。 */
internal enum class RppgSegmentBoundaryReason {
  INVALID_SAMPLE,
  LONG_GAP,
  INVALID_TIMESTAMP,
  NON_MONOTONIC_TIMESTAMP,
}

/** 将同帧 RGB 均值重采样到配置频率；所有时间都来自传感器采集时钟。 */
internal class RppgTimeResampler(
  private val config: RPPGConfig,
  bufferCapacity: Int = defaultBufferCapacity(config),
) {
  /** 当前片段的最近规则采样点；片段边界会清空它以阻止跨段窗口。 */
  val samples = RppgRgbRingBuffer(bufferCapacity)
  /** 当前片段序号；尚未收到有效样本时为 -1。 */
  var segmentIndex: Long = -1L
    private set
  /** 下一个会话级样本序号，亦即已生成样本数。 */
  var nextSampleIndex: Long = 0L
    private set
  /** 最近一次导致片段边界的原因，未发生边界时为空。 */
  var lastBoundaryReason: RppgSegmentBoundaryReason? = null
    private set

  private val sampleIntervalNanos = (NANOS_PER_SECOND / config.resamplingRateHz).roundToLong()
  private var active = false
  private var lastInputTimestampNanos: Long? = null
  private var previousRawTimestampNanos = 0L
  private var previousRawRed = 0.0
  private var previousRawGreen = 0.0
  private var previousRawBlue = 0.0
  private var nextGridTimestampNanos = 0L

  init {
    require(sampleIntervalNanos > 0L) { "resampling frequency is too high for nanosecond timestamps" }
  }

  /** 接受一帧的 RGB 均值；无效样本和非递增时间会切断当前片段。 */
  fun accept(timestampNanos: Long, sample: RppgRgbMean?): RppgResamplerEvent {
    if (timestampNanos < 0L) {
      terminateSegment(RppgSegmentBoundaryReason.INVALID_TIMESTAMP)
      lastInputTimestampNanos = null
      return RppgResamplerEvent.INVALID_TIMESTAMP
    }

    val previousInputTimestamp = lastInputTimestampNanos
    if (previousInputTimestamp != null && timestampNanos <= previousInputTimestamp) {
      terminateSegment(RppgSegmentBoundaryReason.NON_MONOTONIC_TIMESTAMP)
      lastInputTimestampNanos = timestampNanos
      return RppgResamplerEvent.NON_MONOTONIC_TIMESTAMP
    }
    lastInputTimestampNanos = timestampNanos

    if (!sample.isUsable()) {
      terminateSegment(RppgSegmentBoundaryReason.INVALID_SAMPLE)
      return RppgResamplerEvent.INVALID_SAMPLE
    }
    val rgb = checkNotNull(sample)

    if (timestampNanos > Long.MAX_VALUE - sampleIntervalNanos) {
      terminateSegment(RppgSegmentBoundaryReason.INVALID_TIMESTAMP)
      return RppgResamplerEvent.INVALID_TIMESTAMP
    }

    if (!active) {
      startSegment(timestampNanos, rgb)
      return RppgResamplerEvent.SEGMENT_STARTED
    }

    val gapNanos = timestampNanos - previousRawTimestampNanos
    if (gapNanos > config.maximumInterpolationGapNanos) {
      terminateSegment(RppgSegmentBoundaryReason.LONG_GAP)
      startSegment(timestampNanos, rgb)
      return RppgResamplerEvent.SEGMENT_STARTED
    }

    while (nextGridTimestampNanos <= timestampNanos) {
      val interpolationFraction =
        (nextGridTimestampNanos - previousRawTimestampNanos).toDouble() / gapNanos.toDouble()
      appendSample(
        timestampNanos = nextGridTimestampNanos,
        red = interpolate(previousRawRed, rgb.red, interpolationFraction),
        green = interpolate(previousRawGreen, rgb.green, interpolationFraction),
        blue = interpolate(previousRawBlue, rgb.blue, interpolationFraction),
      )
      nextGridTimestampNanos += sampleIntervalNanos
    }

    previousRawTimestampNanos = timestampNanos
    previousRawRed = rgb.red
    previousRawGreen = rgb.green
    previousRawBlue = rgb.blue
    return RppgResamplerEvent.SAMPLE_ACCEPTED
  }

  /** 清空会话序号、规则网格和缓冲，供新会话复用处理器。 */
  fun resetSession() {
    samples.clear()
    segmentIndex = -1L
    nextSampleIndex = 0L
    lastBoundaryReason = null
    active = false
    lastInputTimestampNanos = null
    previousRawTimestampNanos = 0L
    previousRawRed = 0.0
    previousRawGreen = 0.0
    previousRawBlue = 0.0
    nextGridTimestampNanos = 0L
  }

  private fun startSegment(timestampNanos: Long, rgb: RppgRgbMean) {
    check(segmentIndex < Long.MAX_VALUE) { "segment index overflow" }
    segmentIndex++
    active = true
    previousRawTimestampNanos = timestampNanos
    previousRawRed = rgb.red
    previousRawGreen = rgb.green
    previousRawBlue = rgb.blue
    nextGridTimestampNanos = timestampNanos + sampleIntervalNanos
    appendSample(timestampNanos, rgb.red, rgb.green, rgb.blue)
  }

  private fun terminateSegment(reason: RppgSegmentBoundaryReason) {
    samples.clear()
    active = false
    previousRawTimestampNanos = 0L
    previousRawRed = 0.0
    previousRawGreen = 0.0
    previousRawBlue = 0.0
    nextGridTimestampNanos = 0L
    lastBoundaryReason = reason
  }

  private fun appendSample(timestampNanos: Long, red: Double, green: Double, blue: Double) {
    check(nextSampleIndex < Long.MAX_VALUE) { "sample index overflow" }
    samples.append(segmentIndex, nextSampleIndex, timestampNanos, red, green, blue)
    nextSampleIndex++
  }

  private fun RppgRgbMean?.isUsable(): Boolean =
    this != null && pixelCount > 0 && coverageFraction.isFinite() && coverageFraction in 0.0..1.0 &&
      red.isFinite() && red in 0.0..255.0 &&
      green.isFinite() && green in 0.0..255.0 &&
      blue.isFinite() && blue in 0.0..255.0

  private fun interpolate(before: Double, after: Double, fraction: Double): Double =
    before + (after - before) * fraction

  private companion object {
    const val NANOS_PER_SECOND = 1_000_000_000.0

    fun defaultBufferCapacity(config: RPPGConfig): Int {
      val requiredCapacity = ceil(
        config.posWindowNanos.toDouble() * config.resamplingRateHz / NANOS_PER_SECOND,
      ) + 2.0
      require(requiredCapacity.isFinite() && requiredCapacity <= Int.MAX_VALUE.toDouble()) {
        "POS window is too large for a fixed RGB ring buffer"
      }
      return requiredCapacity.toInt().coerceAtLeast(2)
    }
  }
}
