/** 血压轮次的真实 IMU 工程准入；不控制采集计时，不识别解剖学位置。 */
package com.healthcvapp.acquisition.ppg.bloodpressure.imu

import com.healthcvapp.acquisition.sensors.model.SensorSample
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.exp
import kotlin.math.min
import kotlin.math.sqrt

/**
 * 样本入口与快照串行化，全部推理历史使用固定容量；输入不产生逐样本对象。
 * 倾角和心震始终并行处理；正式采集控制器不得用后续 admitted 变化重开窗口。
 */
internal class BloodPressureImuProcessor(
  private val config: BloodPressureImuConfig = BloodPressureImuConfig(),
) {
  private val acceleration = ImuVectorWindow(2048)
  private val rotation = ImuVectorWindow(512)
  private val scgWindow = ScgObservationWindow()
  private val bandpass = ScgButterworthBandpass()
  private val intervals = LongArray(RATE_INTERVAL_COUNT)
  private var intervalCount = 0
  private var intervalHead = 0
  private var intervalSum = 0L
  private var unsupportedIntervals = 0
  private var lastAccEvent = 0L
  private var lastAccReceived = 0L
  private var lastGyroEvent = 0L
  private var lastGyroReceived = 0L
  private var gravityX = 0.0
  private var gravityY = 0.0
  private var gravityZ = 0.0
  private var tilt = Double.NaN
  private var stableState = UNKNOWN
  private var stablePassSince = 0L
  private var lastStableEvaluation = 0L
  private var scgState = UNKNOWN
  private var consecutiveScgPasses = 0
  private var lastScgEvaluation = 0L
  private var configuredRateHz = 0.0
  private var filterStarted = 0L
  private var scgBaseline = 0.0
  private var envelope = 0.0

  @Synchronized
  fun onAccelerometer(sample: SensorSample) {
    if (!validClock(sample)) { resetState(); return }
    if (discontinuous(sample, lastAccEvent, lastAccReceived)) resetState()
    val time = sample.eventTimestampNanos
    val previous = lastAccEvent
    val dtNanos = if (previous == 0L) 0L else time - previous
    if (previous == 0L) {
      gravityX = sample.x.toDouble()
      gravityY = sample.y.toDouble()
      gravityZ = sample.z.toDouble()
    } else {
      val alpha = 1.0 - exp(-2.0 * PI * 3.0 * dtNanos / 1e9)
      gravityX += alpha * (sample.x - gravityX)
      gravityY += alpha * (sample.y - gravityY)
      gravityZ += alpha * (sample.z - gravityZ)
    }
    lastAccEvent = time
    lastAccReceived = sample.receivedAtElapsedNanos
    val norm = sqrt(gravityX * gravityX + gravityY * gravityY + gravityZ * gravityZ)
    tilt = if (norm > 1e-6 && norm.isFinite()) acos((abs(gravityZ) / norm).coerceIn(0.0, 1.0)) * 180.0 / PI else Double.NaN
    acceleration.add(time, gravityX, gravityY, gravityZ)
    if (dtNanos > 0L) processScg(time, -sample.z.toDouble(), dtNanos)
    evaluateStability(sample.receivedAtElapsedNanos)
  }

  @Synchronized
  fun onGyroscope(sample: SensorSample) {
    if (!validClock(sample)) { resetState(); return }
    if (discontinuous(sample, lastGyroEvent, lastGyroReceived)) resetState()
    lastGyroEvent = sample.eventTimestampNanos
    lastGyroReceived = sample.receivedAtElapsedNanos
    rotation.add(lastGyroEvent, sample.x.toDouble(), sample.y.toDouble(), sample.z.toDouble())
    evaluateStability(sample.receivedAtElapsedNanos)
  }

  @Synchronized
  fun reset() = resetState()

  @Synchronized
  fun snapshot(nowElapsedNanos: Long): ImuAdmissionSnapshot {
    val fresh = inputsFresh(nowElapsedNanos)
    val angle = if (fresh && tilt.isFinite()) tilt else null
    val stable = if (fresh) knownBoolean(stableState) else null
    val candidate = if (fresh) knownBoolean(scgState) else null
    return ImuAdmissionSnapshot(
      tiltDegrees = angle,
      stable = stable,
      scgCandidate = candidate,
      fresh = fresh,
      admitted = stable == true && ((angle != null && angle >= 30.0) || candidate == true),
      scgEnergyMeanSquare = if (fresh && scgWindow.energyMeanSquare.isFinite()) scgWindow.energyMeanSquare else null,
      scgRepetition = if (fresh && scgWindow.repetition.isFinite()) scgWindow.repetition else null,
      accelerometerRateHz = if (fresh && intervalCount == RATE_INTERVAL_COUNT) 1e9 * intervalCount / intervalSum else null,
    )
  }

  private fun evaluateStability(now: Long) {
    // 两路回调独立排队，先收到的样本可能后处理；跨源新鲜度以当前已知的最新接收时刻评估。
    val observationTime = maxOf(now, lastAccReceived, lastGyroReceived)
    if (!inputsFresh(observationTime)) { stableState = UNKNOWN; stablePassSince = 0L; return }
    val end = min(lastAccEvent, lastGyroEvent)
    if (lastStableEvaluation != 0L && end - lastStableEvaluation < STABILITY_EVALUATION_NANOS) return
    lastStableEvaluation = end
    if (!acceleration.evaluate(end) || !rotation.evaluate(end)) {
      stableState = UNKNOWN
      stablePassSince = 0L
      return
    }
    if (acceleration.centeredRms < 0.15 && rotation.rawRms < 0.05) {
      if (stablePassSince == 0L) stablePassSince = end
      stableState = if (end - stablePassSince >= STABILITY_CONFIRM_NANOS) YES else NO
    } else {
      stableState = NO
      stablePassSince = 0L
    }
  }

  private fun processScg(time: Long, input: Double, dtNanos: Long) {
    if (intervalCount == RATE_INTERVAL_COUNT) {
      val old = intervals[intervalHead]
      intervalSum -= old
      if (!supportsBand(old)) unsupportedIntervals--
    } else intervalCount++
    intervals[intervalHead] = dtNanos
    intervalSum += dtNanos
    if (!supportsBand(dtNanos)) unsupportedIntervals++
    intervalHead = (intervalHead + 1) % RATE_INTERVAL_COUNT
    if (intervalCount < RATE_INTERVAL_COUNT || unsupportedIntervals > 0) {
      clearScg()
      return
    }
    val measuredRate = 1e9 * intervalCount / intervalSum
    if (configuredRateHz == 0.0 || abs(measuredRate - configuredRateHz) / configuredRateHz > 0.10) {
      clearScg()
      configuredRateHz = measuredRate
      bandpass.configure(measuredRate)
      filterStarted = time
      scgBaseline = input
      return
    }
    val filtered = bandpass.process(input - scgBaseline)
    if (!filtered.isFinite()) { clearScg(); return }
    envelope += (1.0 - exp(-2.0 * PI * 3.0 * dtNanos / 1e9)) * (abs(filtered) - envelope)
    if (time - filterStarted < config.scgFilterSettlingNanos) return
    scgWindow.add(time, filtered, envelope)
    if (lastScgEvaluation != 0L && time - lastScgEvaluation < SCG_EVALUATION_NANOS) return
    lastScgEvaluation = time
    if (!scgWindow.evaluate(time, config)) {
      scgState = UNKNOWN
      consecutiveScgPasses = 0
      return
    }
    if (scgWindow.passes) {
      consecutiveScgPasses = (consecutiveScgPasses + 1).coerceAtMost(2)
      scgState = if (consecutiveScgPasses >= 2) YES else NO
    } else {
      consecutiveScgPasses = 0
      scgState = NO
    }
  }

  private fun supportsBand(dtNanos: Long): Boolean = 1e9 / dtNanos > ScgButterworthBandpass.HIGH_HZ * 2.0

  private fun validClock(sample: SensorSample): Boolean =
    sample.receivedAtElapsedNanos >= sample.eventTimestampNanos &&
      sample.receivedAtElapsedNanos - sample.eventTimestampNanos <= FRESH_NANOS

  private fun discontinuous(sample: SensorSample, lastEvent: Long, lastReceived: Long): Boolean =
    lastEvent != 0L && (sample.eventTimestampNanos <= lastEvent ||
      sample.eventTimestampNanos - lastEvent > FRESH_NANOS ||
      sample.receivedAtElapsedNanos < lastReceived || sample.receivedAtElapsedNanos - lastReceived > FRESH_NANOS)

  private fun inputsFresh(now: Long): Boolean = lastAccEvent != 0L && lastGyroEvent != 0L &&
    now >= lastAccReceived && now - lastAccReceived <= FRESH_NANOS &&
    now >= lastGyroReceived && now - lastGyroReceived <= FRESH_NANOS

  private fun clearScg() {
    scgState = UNKNOWN
    consecutiveScgPasses = 0
    lastScgEvaluation = 0L
    configuredRateHz = 0.0
    filterStarted = 0L
    scgBaseline = 0.0
    envelope = 0.0
    bandpass.reset()
    scgWindow.clear()
  }

  private fun resetState() {
    lastAccEvent = 0L
    lastAccReceived = 0L
    lastGyroEvent = 0L
    lastGyroReceived = 0L
    gravityX = 0.0
    gravityY = 0.0
    gravityZ = 0.0
    tilt = Double.NaN
    stableState = UNKNOWN
    stablePassSince = 0L
    lastStableEvaluation = 0L
    acceleration.clear()
    rotation.clear()
    intervalCount = 0
    intervalHead = 0
    intervalSum = 0L
    unsupportedIntervals = 0
    clearScg()
  }

  private fun knownBoolean(state: Int): Boolean? = when (state) { YES -> true; NO -> false; else -> null }

  companion object {
    const val ACCELEROMETER_SAMPLING_PERIOD_MICROS = 5_000
    const val GYROSCOPE_SAMPLING_PERIOD_MICROS = 20_000
    const val FRESH_NANOS = 200_000_000L
    private const val STABILITY_EVALUATION_NANOS = 100_000_000L
    private const val STABILITY_CONFIRM_NANOS = 2_000_000_000L
    private const val SCG_EVALUATION_NANOS = 250_000_000L
    private const val RATE_INTERVAL_COUNT = 32
    private const val UNKNOWN = -1
    private const val NO = 0
    private const val YES = 1
  }
}
