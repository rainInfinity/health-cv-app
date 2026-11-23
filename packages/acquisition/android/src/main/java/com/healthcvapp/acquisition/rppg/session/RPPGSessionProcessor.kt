/** 将借用相机帧串行转换为就绪状态与定稿 RPPG 记录。 */

package com.healthcvapp.acquisition.rppg.session

import android.os.SystemClock
import com.healthcvapp.acquisition.rppg.face.FaceLandmarkerFrameProcessor
import com.healthcvapp.acquisition.rppg.face.FaceLandmarkerModel
import com.healthcvapp.acquisition.rppg.face.FaceReadinessReason
import com.healthcvapp.acquisition.rppg.face.FaceReadinessTracker
import com.healthcvapp.acquisition.rppg.face.FaceReadinessUpdate
import com.healthcvapp.acquisition.rppg.model.RPPGConfig
import com.healthcvapp.acquisition.rppg.model.RPPGHeartRateWindow
import com.healthcvapp.acquisition.rppg.model.RPPGInstantHeartRate
import com.healthcvapp.acquisition.rppg.model.RPPGPulseSample
import com.healthcvapp.acquisition.rppg.model.RPPGSessionRecord
import com.healthcvapp.acquisition.rppg.roi.RppgRgbMean
import com.healthcvapp.acquisition.rppg.signal.RppgCausalBandpass
import com.healthcvapp.acquisition.rppg.signal.RppgBeatHeartRateEstimator
import com.healthcvapp.acquisition.rppg.signal.RppgFilteredSample
import com.healthcvapp.acquisition.rppg.signal.RppgHeartRateEstimator
import com.healthcvapp.acquisition.rppg.signal.RppgHeartRateOutput
import com.healthcvapp.acquisition.rppg.signal.RppgPosDiscardedTail
import com.healthcvapp.acquisition.rppg.signal.RppgPosOutput
import com.healthcvapp.acquisition.rppg.signal.RppgPosProcessor
import com.healthcvapp.acquisition.rppg.signal.RppgResampledRgb
import com.healthcvapp.acquisition.rppg.signal.RppgResamplerEvent
import com.healthcvapp.acquisition.rppg.signal.RppgTimeResampler

/** 为状态机提供同帧人脸就绪判断及可发布算法记录。 */
internal interface RPPGSessionProcessor : AutoCloseable {
  /** 在当前借用帧内完成模型推理和 ROI 取色。 */
  fun observe(
    frame: RPPGCameraFrame,
    frameIndex: Long,
    sensorTimeOriginNanos: Long,
  ): FaceReadinessUpdate

  /** 在连续就绪后的测量边界清空信号算法状态。 */
  fun beginMeasurement()

  /** 最近一个通过逐搏确认的当前值；无效、过期或停止后为空。 */
  val latestInstantHeartRate: RPPGInstantHeartRate?

  /** 在处理线程上清空逐搏历史，避免停帧过期后直接接续旧峰。 */
  fun resetInstantHeartRate()

  /** 推进一个正式测量帧，并同步提交所有新定稿记录。 */
  fun acceptMeasurementSample(
    timestampNanos: Long,
    sample: RppgRgbMean?,
    emit: (RPPGSessionRecord) -> Unit,
  )

  /** 丢弃尚无未来上下文可定稿的 POS 尾部。 */
  fun finishMeasurement()
}

/** 创建独占于单次主动会话的模型与信号处理器。 */
internal fun interface RPPGSessionProcessorFactory {
  /** 按会话冻结参数构造串行处理器。 */
  fun create(sessionId: String, config: RPPGConfig): RPPGSessionProcessor
}

/** 组合官方模型、人脸连续性判断及有限 POS／滤波／心率算法。 */
internal class FaceRPPGSessionProcessor(
  model: FaceLandmarkerModel,
  private val sessionId: String,
  config: RPPGConfig,
) : RPPGSessionProcessor {
  private val faceProcessor = FaceLandmarkerFrameProcessor(model)
  private val readinessTracker = FaceReadinessTracker(config.faceReadiness)
  private val resampler = RppgTimeResampler(config)
  private val posProcessor = RppgPosProcessor(config)
  private val bandpass = RppgCausalBandpass(config)
  private val heartRateEstimator = RppgHeartRateEstimator(config)
  private val beatEstimator = RppgBeatHeartRateEstimator(config)
  private val resampledRgb = RppgResampledRgb()
  private val posOutput = RppgPosOutput()
  private val posTail = RppgPosDiscardedTail()
  private val filteredSample = RppgFilteredSample()
  private val heartRateOutput = RppgHeartRateOutput()
  private var lastLandmarkerTimestampMs: Long? = null
  private var measuring = false
  private var closed = false

  override val latestInstantHeartRate: RPPGInstantHeartRate?
    get() = beatEstimator.latestHeartRate

  /** 由会话在恢复处理首帧前调用，不跨线程直接修改估计器。 */
  override fun resetInstantHeartRate() = beatEstimator.resetSession()

  /** 同步处理单帧；毫秒量化不递增时拒绝推理且重置连续跟踪。 */
  override fun observe(
    frame: RPPGCameraFrame,
    frameIndex: Long,
    sensorTimeOriginNanos: Long,
  ): FaceReadinessUpdate {
    check(!closed) { "RPPG processor is closed" }
    require(frame.sensorTimestampNanos >= sensorTimeOriginNanos) { "RPPG frame precedes its sensor origin" }
    val timestampMs = (frame.sensorTimestampNanos - sensorTimeOriginNanos) / NANOS_PER_MILLISECOND
    if (lastLandmarkerTimestampMs?.let { timestampMs <= it } == true) {
      readinessTracker.reset()
      return FaceReadinessUpdate(
        ready = false,
        reason = FaceReadinessReason.NON_MONOTONIC_TIME,
        continuousNanos = 0L,
        faceWidthFraction = null,
        pose = null,
        roiSamples = null,
        rgbSample = null,
      )
    }
    lastLandmarkerTimestampMs = timestampMs
    val frameView = frame.pixelFrameView(
      sessionId = sessionId,
      frameIndex = frameIndex,
      processingElapsedNanos = SystemClock.elapsedRealtimeNanos(),
      timestampSystemNanos = System.nanoTime(),
    )
    return faceProcessor.process(frameView, timestampMs) { result, pixels ->
      readinessTracker.update(result, pixels, frame.sensorTimestampNanos)
    }
  }

  /** 重置规则重采样、POS、因果滤波和心率历史，不重置已满足的人脸就绪跟踪。 */
  override fun beginMeasurement() {
    check(!closed) { "RPPG processor is closed" }
    check(!measuring) { "RPPG measurement has already begun" }
    resampler.resetSession()
    posProcessor.resetSession()
    bandpass.resetSession()
    heartRateEstimator.resetSession()
    beatEstimator.resetSession()
    measuring = true
  }

  /** 仅在通过连续就绪判断的测量帧间推进算法。 */
  override fun acceptMeasurementSample(
    timestampNanos: Long,
    sample: RppgRgbMean?,
    emit: (RPPGSessionRecord) -> Unit,
  ) {
    check(!closed && measuring) { "RPPG measurement is not active" }
    val firstNewSample = resampler.nextSampleIndex
    val event = resampler.accept(timestampNanos, sample)
    if (event != RppgResamplerEvent.SAMPLE_ACCEPTED) beatEstimator.resetSession()
    val nextSample = resampler.nextSampleIndex
    val firstStoredSample = nextSample - resampler.samples.size
    var sampleIndex = firstNewSample
    while (sampleIndex < nextSample) {
      val offset = (sampleIndex - firstStoredSample).toInt()
      resampler.samples.copyAt(offset, resampledRgb)
      posProcessor.accept(resampledRgb, posOutput, posTail)
      if (posOutput.hasSample) emitFilteredRecords(emit)
      sampleIndex++
    }
  }

  /** 收尾时丢弃未定稿尾点并清空所有算法状态。 */
  override fun finishMeasurement() {
    if (closed || !measuring) return
    posProcessor.finishSegment(posTail)
    resampler.resetSession()
    posProcessor.resetSession()
    bandpass.resetSession()
    heartRateEstimator.resetSession()
    beatEstimator.resetSession()
    measuring = false
  }

  /** 释放模型与图像转换缓冲。 */
  override fun close() {
    if (closed) return
    finishMeasurement()
    closed = true
    faceProcessor.close()
  }

  /** 只将有效滤波点变成脉搏与心率记录，不输出无效零值。 */
  private fun emitFilteredRecords(emit: (RPPGSessionRecord) -> Unit) {
    bandpass.accept(posOutput, filteredSample)
    if (!filteredSample.hasSample) {
      beatEstimator.resetSession()
      return
    }
    val previousInstantHeartRate = beatEstimator.latestHeartRate
    beatEstimator.accept(filteredSample)
    emit(
      RPPGPulseSample(
        segmentIndex = filteredSample.segmentIndex,
        sampleIndex = filteredSample.sampleIndex,
        timestampNanos = filteredSample.timestampNanos,
        value = filteredSample.value,
      ),
    )
    val instantHeartRate = beatEstimator.latestHeartRate
    if (instantHeartRate != null && instantHeartRate !== previousInstantHeartRate) {
      emit(instantHeartRate)
    }
    heartRateEstimator.accept(filteredSample, heartRateOutput)
    if (!heartRateOutput.hasWindow) return
    emit(
      RPPGHeartRateWindow(
        segmentIndex = heartRateOutput.segmentIndex,
        windowStartNanos = heartRateOutput.windowStartTimestampNanos,
        windowEndNanos = heartRateOutput.windowEndTimestampNanos,
        heartRateBpm = heartRateOutput.heartRateBpm.takeIf { heartRateOutput.hasHeartRate },
        valid = heartRateOutput.hasHeartRate,
        reason = heartRateOutput.rejectionReason?.name,
        spectralSnrDb = heartRateOutput.snrDb.takeIf { heartRateOutput.hasSnr },
      ),
    )
  }

  private companion object {
    const val NANOS_PER_MILLISECOND = 1_000_000L
  }
}
