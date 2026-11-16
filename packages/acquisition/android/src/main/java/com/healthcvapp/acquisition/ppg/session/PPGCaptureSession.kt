/** 拥有单次 PPG 采集的有界队列、帧关联与停止屏障，并委派双文件输出。 */

package com.healthcvapp.acquisition.ppg.session

import com.healthcvapp.acquisition.camera.CameraFrameMetadata
import com.healthcvapp.acquisition.ppg.correlation.FrameCorrelationFailure
import com.healthcvapp.acquisition.ppg.correlation.FrameMetadataCorrelator
import com.healthcvapp.acquisition.ppg.model.CameraBlockLayout
import com.healthcvapp.acquisition.ppg.model.PPGConfigSummary
import com.healthcvapp.acquisition.ppg.model.PPGArtifact
import com.healthcvapp.acquisition.ppg.model.PPGCaptureRecord
import com.healthcvapp.acquisition.ppg.model.PPGFrameRecord
import com.healthcvapp.acquisition.ppg.output.PPGSessionOutput
import com.healthcvapp.acquisition.pipeline.DataHub
import com.healthcvapp.acquisition.pipeline.DataHubOfferResult
import java.io.File
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.withContext



/** 约束正式帧的接收、错误终止与文件完成顺序。 */
internal class PPGCaptureSession(
  filesDirectory: File,
  val sessionId: String = UUID.randomUUID().toString(),
  val blockLayout: CameraBlockLayout = CameraBlockLayout(rows = 1, columns = 1),
  private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
  private val output: PPGSessionOutput = PPGSessionOutput(filesDirectory, sessionId, ioDispatcher = ioDispatcher),
  private val consumerDispatcher: CoroutineDispatcher = Dispatchers.IO,
  private val capacity: Int = 256,
  private val batchSize: Int = 50,
  private val flushIntervalMillis: Long = 1_000,
  private val onFailure: (PPGCaptureFailure) -> Unit = {},
  private val onAcceptedRecord: (PPGCaptureRecord) -> Unit = {},
) {
  private enum class Phase { NEW, PREPARING, CAPTURING, STOPPING, COMPLETED, FAILED }

  private val lock = Any()
  private val commands = Mutex()
  private val cleanupScope = CoroutineScope(SupervisorJob() + ioDispatcher)
  private val cleanupStarted = AtomicBoolean(false)
  private val cleanupComplete = CompletableDeferred<Unit>()
  private val metadataCorrelator = FrameMetadataCorrelator(capacity)
  private val correlationLock = Any()
  private var phase = Phase.NEW
  private var acceptingFrames = false
  private var startedAtElapsedNanos = 0L
  private var endAtElapsedNanos = Long.MAX_VALUE
  private var lastEntranceNanos = 0L
  private var maximumFrameGapNanos = Long.MAX_VALUE
  private var windowEstablished = false
  private var groupActive: (() -> Boolean)? = null
  private var startedAtMillis = 0L
  private var nextFrameIndex = 0L
  private var inFlightFrames = 0
  private var frameDrain: CompletableDeferred<Unit>? = null
  private var stopRequested = false
  private var dataHub: DataHub<PPGCaptureRecord>? = null
  private var failure: PPGCaptureFailure? = null
  private var artifact: PPGArtifact? = null
  init {
    require(capacity > 0 && batchSize in 1..capacity) { "invalid DataHub capacity or batch size" }
    require(flushIntervalMillis > 0) { "flushIntervalMillis must be positive" }
    require(blockLayout.blockCount <= CameraBlockLayout.MAX_BLOCK_COUNT) {
      "当前采集会话的分块数超过本地处理上限。"
    }
  }

  /** 手动路径仍不设覆盖门控和截止；writer 准备完毕后才开放入口。 */
  suspend fun start(startedAtElapsedNanos: Long, startedAtMillis: Long) {
    prepare()
    openWindow(startedAtElapsedNanos, Long.MAX_VALUE, startedAtMillis)
  }

  /** 准备双 writer 与消费者，期间所有图像均不能入窗。 */
  suspend fun prepare() = commands.withLock {
    synchronized(lock) {
      check(phase == Phase.NEW) { "capture session can only start once" }
      phase = Phase.PREPARING
    }

    try {
      output.open()
      val hub = DataHub<PPGCaptureRecord>(
        capacity = capacity,
        batchSize = batchSize,
        intervalMillis = flushIntervalMillis,
        dispatcher = consumerDispatcher,
      ) { records ->
        try {
          output.writeBatch(records)
        } catch (error: Throwable) {
          val writeFailure = PPGCaptureFailure("FILE_WRITE_FAILED", "PPG 或 frame CSV 写入失败。", error)
          markFailed(writeFailure)
          throw writeFailure
        }
      }

      synchronized(lock) {
        dataHub = hub
        phase = Phase.PREPARING
      }
    } catch (error: Throwable) {
      val startFailure = error as? PPGCaptureFailure
        ?: PPGCaptureFailure("FILE_OPEN_FAILED", "无法创建 PPG 与 frame 采集文件。", error)
      markFailed(startFailure)
      cleanupFailedResources()
      throw failure ?: startFailure
    }
  }

  /** 调用方重新确认覆盖和关闭意图后，原子建立半开正式窗口。 */
  fun openWindow(startNanos: Long, endNanos: Long, startMillis: Long = startNanos / 1_000_000L,
    maximumFrameGapNanos: Long = Long.MAX_VALUE) =
    synchronized(lock) {
      check(phase == Phase.PREPARING && dataHub != null)
      require(endNanos > startNanos)
      startedAtElapsedNanos = startNanos
      endAtElapsedNanos = endNanos
      lastEntranceNanos = startNanos
      this.maximumFrameGapNanos = maximumFrameGapNanos
      startedAtMillis = startMillis
      windowEstablished = true
      acceptingFrames = true
      phase = Phase.CAPTURING
    }

  /** 双源窗口安装期间保持封闭；独立会话不安装组内门闩。 */
  fun installGroupActivation(isActive: () -> Boolean) = synchronized(lock) {
    check(phase == Phase.PREPARING && !windowEstablished)
    groupActive = isActive
  }

  /** 截止和停止意图先同步封闭入口，再异步等待配对及文件屏障。 */
  fun sealEntrance() = synchronized(lock) { acceptingFrames = false }

  /** 未开窗的准备失效只关闭文件，不发布一个伪正式产物。 */
  suspend fun discardPrepared() = commands.withLock {
    synchronized(lock) {
      if (phase == Phase.COMPLETED && !windowEstablished) return@withLock
      check(phase == Phase.PREPARING)
      acceptingFrames = false
    }
    dataHub?.closeAndDrain()
    output.close()
    synchronized(lock) { phase = Phase.COMPLETED }
    cleanupScope.cancel()
  }

  /** 在进入帧处理作用域时登记正式帧；返回负值表示该帧不属于本次采集。 */
  fun beginFrame(processingElapsedNanos: Long): Long = synchronized(lock) {
    if (!acceptingFrames || phase != Phase.CAPTURING || groupActive?.invoke() == false ||
      processingElapsedNanos < startedAtElapsedNanos || processingElapsedNanos >= endAtElapsedNanos) {
      return@synchronized NO_FRAME
    }
    if (processingElapsedNanos - lastEntranceNanos >= maximumFrameGapNanos) {
      acceptingFrames = false
      return@synchronized NO_FRAME
    }
    lastEntranceNanos = processingElapsedNanos
    inFlightFrames += 1
    nextFrameIndex++
    nextFrameIndex - 1
  }

  /** 像素帧已释放后一次性交付完整块数组，并等待精确匹配的 Camera2 结果。 */
  fun offerPpgFrame(record: PPGFrameRecord, sensorTimestampNanos: Long) {
    if (record.blockLayout != blockLayout) {
      finishFrame(
        record.frameIndex,
        null,
        PPGCaptureFailure("PIXEL_PROCESSING_FAILED", "正式帧的分块布局与会话冻结配置不一致。"),
      )
      return
    }
    synchronized(correlationLock) {
      applyCorrelationUpdate(metadataCorrelator.offerPpgFrame(record, sensorTimestampNanos))
    }
  }

  /** 接收相机实际拍摄结果；缓存和配对均不持有 Camera2 原生对象。 */
  fun offerCaptureMetadata(metadata: CameraFrameMetadata) {
    synchronized(correlationLock) {
      applyCorrelationUpdate(metadataCorrelator.offerMetadata(metadata))
    }
  }

  /** 在停止边界与相机回调串行关闭关联缓存。 */
  private fun finishCorrelations() = synchronized(correlationLock) {
    applyCorrelationUpdate(metadataCorrelator.finish())
  }

  /** 将关联器按帧序给出的记录入队，或终止并回收所有未完成帧。 */
  private fun applyCorrelationUpdate(update: com.healthcvapp.acquisition.ppg.correlation.FrameCorrelationUpdate) {
    val correlationFailure = update.failure
    if (correlationFailure != null) {
      val cause = PPGCaptureFailure(correlationFailure.code, correlationFailure.message)
      if (update.failedFrameIndexes.isEmpty()) {
        fail(cause)
      } else {
        for (frameIndex in update.failedFrameIndexes) finishFrame(frameIndex, null, cause)
      }
      return
    }
    for (record in update.records) finishFrame(record.ppg.frameIndex, record)
  }

  /** 接收配对记录或终止帧，并释放对应的在途计数。 */
  fun finishFrame(frameIndex: Long, record: PPGCaptureRecord?, processingError: Throwable? = null) {
    if (frameIndex == NO_FRAME) return

    var newFailure: PPGCaptureFailure? = null
    var hubToFail: DataHub<PPGCaptureRecord>? = null
    var scheduleCleanup = false
    var accepted = false
    synchronized(lock) {
      if (inFlightFrames == 0) return
      if (failure == null) {
        if (processingError != null) {
          newFailure = processingError as? PPGCaptureFailure
            ?: PPGCaptureFailure("PIXEL_PROCESSING_FAILED", "PPG 像素处理失败。", processingError)
        } else if (record == null) {
          newFailure = PPGCaptureFailure("PIXEL_PROCESSING_FAILED", "正式采集帧没有生成配对记录。")
        } else {
          when (dataHub?.offer(record)) {
            DataHubOfferResult.ACCEPTED -> accepted = true
            DataHubOfferResult.CAPACITY_EXCEEDED -> {
              newFailure = PPGCaptureFailure("DATAHUB_CAPACITY_EXCEEDED", "采集数据队列容量已满。")
            }
            DataHubOfferResult.CLOSED -> {
              newFailure = PPGCaptureFailure("DATAHUB_CLOSED", "采集数据队列已关闭。")
            }
            DataHubOfferResult.FAILED -> {
              newFailure = PPGCaptureFailure("DATAHUB_CONSUMER_FAILED", "采集数据队列消费者已失败。", dataHub?.failure)
            }
            null -> newFailure = PPGCaptureFailure("DATAHUB_UNAVAILABLE", "采集数据队列尚未就绪。")
          }
        }
      }

      if (newFailure != null) {
        failure = newFailure
        phase = Phase.FAILED
        acceptingFrames = false
        hubToFail = dataHub
        scheduleCleanup = !stopRequested
      }
    }
    try {
      if (accepted && record != null) onAcceptedRecord(record)
    } finally {
      synchronized(lock) {
        inFlightFrames -= 1
        if (inFlightFrames == 0) frameDrain?.complete(Unit)
        else if (failure != null && frameDrain == null) frameDrain = CompletableDeferred()
      }
    }

    newFailure?.let { currentFailure ->
      hubToFail?.fail(currentFailure)
      notifyFailure(currentFailure)
      abortPendingCorrelations(currentFailure)
      if (scheduleCleanup) scheduleFailureCleanup()
    }
  }

  /** 设备中断等外部错误关闭入口并启动异步收尾；产物已发布时返回 false。 */
  fun fail(cause: PPGCaptureFailure): Boolean = markFailed(cause)

  /** 停止收帧、等待配对与两份 CSV 排空、关闭并完成后才返回产物。 */
  suspend fun stop(
    finishedAtMillis: Long,
    cameraConfigSummary: PPGConfigSummary? = null,
  ): PPGArtifact = commands.withLock {
    var shouldWaitForFrames: CompletableDeferred<Unit>? = null
    var currentFailure: PPGCaptureFailure? = null
    synchronized(lock) {
      artifact?.let { return@withLock it }
      currentFailure = failure
      if (currentFailure == null) {
        check(phase == Phase.CAPTURING || phase == Phase.STOPPING) { "capture session is not running" }
        acceptingFrames = false
        stopRequested = true
        phase = Phase.STOPPING
        if (inFlightFrames > 0) {
          val barrier = CompletableDeferred<Unit>()
          frameDrain = barrier
          shouldWaitForFrames = barrier
        }
      }
    }

    if (currentFailure != null) {
      cleanupFailedResources()
      throw currentFailure
    }

    try {
      val frameBarrier = shouldWaitForFrames
      if (frameBarrier != null) {
        val associationsCompleted = withTimeoutOrNull(CAPTURE_RESULT_WAIT_TIMEOUT_MILLIS) {
          frameBarrier.await()
          true
        } ?: false
        if (!associationsCompleted) finishCorrelations()
        frameBarrier.await()
      }
      finishCorrelations()
      failure?.let { throw it }
      val hub = checkNotNull(dataHub) { "capture DataHub is unavailable" }
      hub.closeAndDrain()
      output.close()
      val completed = withContext(ioDispatcher) {
        synchronized(lock) {
          failure?.let { throw it }
          output.publish(startedAtMillis, finishedAtMillis, cameraConfigSummary).also {
            artifact = it
            phase = Phase.COMPLETED
          }
        }
      }
      cleanupScope.cancel()
      completed
    } catch (error: Throwable) {
      val stopFailure = error as? PPGCaptureFailure
        ?: PPGCaptureFailure("FILE_FINALIZATION_FAILED", "PPG 与 frame CSV 未能正常完成。", error)
      markFailed(stopFailure)
      cleanupFailedResources()
      throw failure ?: stopFailure
    }
  }

  /** 获取会话当前终态错误，供低频状态快照使用。 */
  val terminalFailure: PPGCaptureFailure?
    get() = synchronized(lock) { failure }

  /** 当前会话仍允许登记正式帧时为真。 */
  val isCapturing: Boolean
    get() = synchronized(lock) { acceptingFrames }

  /** 区分已封闭的正式窗口与尚未开窗的 writer 准备。 */
  val hasFormalWindow: Boolean
    get() = synchronized(lock) { windowEstablished }

  private fun markFailed(cause: PPGCaptureFailure): Boolean {
    var firstFailure = false
    var hub: DataHub<PPGCaptureRecord>? = null
    var scheduleCleanup = false
    synchronized(lock) {
      if (phase == Phase.COMPLETED) return false
      if (failure == null) {
        failure = cause
        phase = Phase.FAILED
        acceptingFrames = false
        firstFailure = true
      }
      hub = dataHub
      if (inFlightFrames > 0 && frameDrain == null) frameDrain = CompletableDeferred()
      scheduleCleanup = firstFailure && !stopRequested
    }
    hub?.fail(cause)
    abortPendingCorrelations(cause)
    if (firstFailure) notifyFailure(cause)
    if (scheduleCleanup) scheduleFailureCleanup()
    return true
  }

  /** 失败时释放关联器中等待结果或等待帧序的在途记录。 */
  private fun abortPendingCorrelations(cause: PPGCaptureFailure) = synchronized(correlationLock) {
    val update = metadataCorrelator.abort(
      FrameCorrelationFailure(cause.code, cause.message ?: "采集会话已失败。"),
    )
    for (frameIndex in update.failedFrameIndexes) finishFrame(frameIndex, null, cause)
  }

  private fun notifyFailure(cause: PPGCaptureFailure) {
    try {
      onFailure(cause)
    } catch (_: Throwable) {
      // 观察者错误不能覆盖导致会话失败的原始原因。
    }
  }

  private fun scheduleFailureCleanup() {
    if (!cleanupStarted.get()) {
      cleanupScope.launch { cleanupFailedResources() }
    }
  }

  private suspend fun cleanupFailedResources() {
    if (!cleanupStarted.compareAndSet(false, true)) {
      cleanupComplete.await()
      return
    }
    try {
      val barrier = synchronized(lock) { frameDrain }
      barrier?.await()
      try {
        dataHub?.closeAndDrain()
      } catch (_: Throwable) {
        // 终态错误已保存；此处只等待消费者退出并回收文件句柄。
      }
      try {
        output.close()
      } catch (_: Throwable) {
        // 失败文件不作为产物返回，关闭错误不替换原始错误。
      }
    } finally {
      cleanupComplete.complete(Unit)
      cleanupScope.cancel()
    }
  }



  private companion object {
    const val NO_FRAME = -1L
    const val CAPTURE_RESULT_WAIT_TIMEOUT_MILLIS = 1_000L
  }
}
