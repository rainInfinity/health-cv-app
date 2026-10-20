/** 拥有单次 PPG 采集的有界队列、写入器与正常停止屏障。 */

package com.healthcvapp.acquisition.session

import com.healthcvapp.acquisition.camera.CameraFrameMetadata
import com.healthcvapp.acquisition.camera.CaptureRecord
import com.healthcvapp.acquisition.camera.FrameCorrelationFailure
import com.healthcvapp.acquisition.camera.FrameMetadataCorrelator
import com.healthcvapp.acquisition.pipeline.DataHub
import com.healthcvapp.acquisition.pipeline.DataHubOfferResult
import com.healthcvapp.acquisition.processing.PpgRecord
import com.healthcvapp.acquisition.writers.FrameBatchWriter
import com.healthcvapp.acquisition.writers.FrameBatchWriterFactory
import com.healthcvapp.acquisition.writers.FrameCsvWriter
import com.healthcvapp.acquisition.writers.PpgBatchWriter
import com.healthcvapp.acquisition.writers.PpgBatchWriterFactory
import com.healthcvapp.acquisition.writers.PpgCsvWriter
import java.io.File
import java.io.IOException
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

/** 会话失败时保留给调用方的稳定错误码和根因。 */
class CaptureFailure(
  /** 原生协议中的稳定错误码。 */
  val code: String,
  message: String,
  cause: Throwable? = null,
) : IllegalStateException(message, cause)

/** 标识会话完成产物中的 CSV 类型。 */
enum class SessionFileKind {
  /** 八列 PPG 像素统计。 */
  PPG,
  /** Camera2 逐帧拍摄参数。 */
  FRAME,
}

/** 描述一份正常完成且已关闭的会话 CSV 文件。 */
data class SessionFileArtifact(
  /** 文件用途。 */
  val kind: SessionFileKind,
  /** 应用私有持久目录中的已完成文件路径。 */
  val path: String,
  /** 已关闭文件的字节数。 */
  val sizeBytes: Long,
)

/** 仅在两份尾批均已消费、文件关闭并提升后返回的会话产物。 */
data class SessionArtifact(
  /** 唯一采集会话标识。 */
  val sessionId: String,
  /** 按 PPG、逐帧元数据顺序列出的已完成文件。 */
  val files: List<SessionFileArtifact>,
  /** 采集开始时的单调时间，单位毫秒。 */
  val startedAtMillis: Long,
  /** 文件关闭时的单调时间，单位毫秒。 */
  val finishedAtMillis: Long,
)

/** 约束正式帧的接收、错误终止与文件完成顺序。 */
class CaptureSession(
  private val filesDirectory: File,
  val sessionId: String = UUID.randomUUID().toString(),
  private val writerFactory: PpgBatchWriterFactory = PpgBatchWriterFactory(::PpgCsvWriter),
  private val frameWriterFactory: FrameBatchWriterFactory = FrameBatchWriterFactory(::FrameCsvWriter),
  private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
  private val consumerDispatcher: CoroutineDispatcher = Dispatchers.IO,
  private val capacity: Int = 256,
  private val batchSize: Int = 50,
  private val flushIntervalMillis: Long = 1_000,
  private val onFailure: (CaptureFailure) -> Unit = {},
) {
  private enum class Phase { NEW, PREPARING, CAPTURING, STOPPING, COMPLETED, FAILED }

  private val lock = Any()
  private val commands = Mutex()
  private val cleanupScope = CoroutineScope(SupervisorJob() + ioDispatcher)
  private val cleanupStarted = AtomicBoolean(false)
  private val writersClosed = AtomicBoolean(false)
  private val cleanupComplete = CompletableDeferred<Unit>()
  private val sessionDirectory = File(File(filesDirectory, "acquisition"), sessionId)
  private val partialFile = File(sessionDirectory, "ppg.csv.part")
  private val completedFile = File(sessionDirectory, "ppg.csv")
  private val framePartialFile = File(sessionDirectory, "frame.csv.part")
  private val frameCompletedFile = File(sessionDirectory, "frame.csv")
  private val metadataCorrelator = FrameMetadataCorrelator(capacity)
  private val correlationLock = Any()
  private var phase = Phase.NEW
  private var acceptingFrames = false
  private var startedAtElapsedNanos = 0L
  private var startedAtMillis = 0L
  private var nextFrameIndex = 0L
  private var inFlightFrames = 0
  private var frameDrain: CompletableDeferred<Unit>? = null
  private var stopRequested = false
  private var ppgWriter: PpgBatchWriter? = null
  private var frameWriter: FrameBatchWriter? = null
  private var dataHub: DataHub<CaptureRecord>? = null
  private var failure: CaptureFailure? = null
  private var artifact: SessionArtifact? = null
  init {
    require(sessionId.matches(SESSION_ID_PATTERN)) { "sessionId must be a safe path component" }
    require(capacity > 0 && batchSize in 1..capacity) { "invalid DataHub capacity or batch size" }
    require(flushIntervalMillis > 0) { "flushIntervalMillis must be positive" }
  }

  /** 先创建会话文件和消费者，再打开正式帧入口并建立单调采集边界。 */
  suspend fun start(startedAtElapsedNanos: Long, startedAtMillis: Long) = commands.withLock {
    synchronized(lock) {
      check(phase == Phase.NEW) { "capture session can only start once" }
      phase = Phase.PREPARING
    }

    try {
      val openedWriters = withContext(ioDispatcher) {
        if (!sessionDirectory.isDirectory && !sessionDirectory.mkdirs()) {
          throw IOException("无法创建采集会话目录：${sessionDirectory.absolutePath}")
        }
        val openedPpgWriter = writerFactory.open(partialFile)
        try {
          openedPpgWriter to frameWriterFactory.open(framePartialFile)
        } catch (error: Throwable) {
          runCatching { openedPpgWriter.close() }
          throw error
        }
      }
      synchronized(lock) {
        ppgWriter = openedWriters.first
        frameWriter = openedWriters.second
      }
      val hub = DataHub<CaptureRecord>(
        capacity = capacity,
        batchSize = batchSize,
        intervalMillis = flushIntervalMillis,
        dispatcher = consumerDispatcher,
      ) { records ->
        try {
          openedWriters.first.writeBatch(records)
          openedWriters.second.writeBatch(records)
        } catch (error: Throwable) {
          val writeFailure = CaptureFailure("FILE_WRITE_FAILED", "PPG 或 frame CSV 写入失败。", error)
          markFailed(writeFailure)
          throw writeFailure
        }
      }

      synchronized(lock) {
        dataHub = hub
        this.startedAtElapsedNanos = startedAtElapsedNanos
        this.startedAtMillis = startedAtMillis
        acceptingFrames = true
        phase = Phase.CAPTURING
      }
    } catch (error: Throwable) {
      val startFailure = error as? CaptureFailure
        ?: CaptureFailure("FILE_OPEN_FAILED", "无法创建 PPG 与 frame 采集文件。", error)
      markFailed(startFailure)
      cleanupFailedResources()
      throw failure ?: startFailure
    }
  }

  /** 在进入帧处理作用域时登记正式帧；返回负值表示该帧不属于本次采集。 */
  fun beginFrame(processingElapsedNanos: Long): Long = synchronized(lock) {
    if (!acceptingFrames || phase != Phase.CAPTURING || processingElapsedNanos < startedAtElapsedNanos) {
      return@synchronized NO_FRAME
    }
    inFlightFrames += 1
    nextFrameIndex++
    nextFrameIndex - 1
  }

  /** 像素帧已释放后保存其数值，并等待精确匹配的 Camera2 结果。 */
  fun offerPpgRecord(record: PpgRecord, sensorTimestampNanos: Long) {
    synchronized(correlationLock) {
      applyCorrelationUpdate(metadataCorrelator.offerPpg(record, sensorTimestampNanos))
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
  private fun applyCorrelationUpdate(update: com.healthcvapp.acquisition.camera.FrameCorrelationUpdate) {
    val correlationFailure = update.failure
    if (correlationFailure != null) {
      val cause = CaptureFailure(correlationFailure.code, correlationFailure.message)
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
  fun finishFrame(frameIndex: Long, record: CaptureRecord?, processingError: Throwable? = null) {
    if (frameIndex == NO_FRAME) return

    var newFailure: CaptureFailure? = null
    var hubToFail: DataHub<CaptureRecord>? = null
    var scheduleCleanup = false
    synchronized(lock) {
      if (inFlightFrames == 0) return
      inFlightFrames -= 1
      if (failure == null) {
        if (processingError != null) {
          newFailure = processingError as? CaptureFailure
            ?: CaptureFailure("PIXEL_PROCESSING_FAILED", "PPG 像素处理失败。", processingError)
        } else if (record == null) {
          newFailure = CaptureFailure("PIXEL_PROCESSING_FAILED", "正式采集帧没有生成配对记录。")
        } else {
          when (dataHub?.offer(record)) {
            DataHubOfferResult.ACCEPTED -> Unit
            DataHubOfferResult.CAPACITY_EXCEEDED -> {
              newFailure = CaptureFailure("DATAHUB_CAPACITY_EXCEEDED", "采集数据队列容量已满。")
            }
            DataHubOfferResult.CLOSED -> {
              newFailure = CaptureFailure("DATAHUB_CLOSED", "采集数据队列已关闭。")
            }
            DataHubOfferResult.FAILED -> {
              newFailure = CaptureFailure("DATAHUB_CONSUMER_FAILED", "采集数据队列消费者已失败。", dataHub?.failure)
            }
            null -> newFailure = CaptureFailure("DATAHUB_UNAVAILABLE", "采集数据队列尚未就绪。")
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
      if (inFlightFrames == 0) {
        frameDrain?.complete(Unit)
      } else if (failure != null && frameDrain == null) {
        frameDrain = CompletableDeferred()
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
  fun fail(cause: CaptureFailure): Boolean = markFailed(cause)

  /** 停止收帧、等待配对与两份 CSV 排空、关闭并完成后才返回产物。 */
  suspend fun stop(finishedAtMillis: Long): SessionArtifact = commands.withLock {
    var shouldWaitForFrames: CompletableDeferred<Unit>? = null
    var currentFailure: CaptureFailure? = null
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
      closeWriters()
      val completed = synchronized(lock) {
        failure?.let { throw it }
        if (
          completedFile.exists() || frameCompletedFile.exists()
          || !partialFile.isFile || !framePartialFile.isFile
        ) {
          throw IOException("PPG 或 frame CSV 临时文件不存在，或完成路径已被占用。")
        }
        if (!partialFile.renameTo(completedFile)) {
          throw IOException("无法将 PPG CSV 提升为完成产物：${completedFile.absolutePath}")
        }
        if (!framePartialFile.renameTo(frameCompletedFile)) {
          val restored = completedFile.renameTo(partialFile)
          val rollbackMessage = if (restored) "" else "；PPG 临时文件回退失败"
          throw IOException("无法将 frame CSV 提升为完成产物：${frameCompletedFile.absolutePath}$rollbackMessage")
        }
        if (!completedFile.isFile || !frameCompletedFile.isFile) {
          throw IOException("PPG 或 frame 完成文件不存在。")
        }

        SessionArtifact(
          sessionId = sessionId,
          files = listOf(
            SessionFileArtifact(SessionFileKind.PPG, completedFile.absolutePath, completedFile.length()),
            SessionFileArtifact(SessionFileKind.FRAME, frameCompletedFile.absolutePath, frameCompletedFile.length()),
          ),
          startedAtMillis = startedAtMillis,
          finishedAtMillis = finishedAtMillis,
        ).also {
          artifact = it
          phase = Phase.COMPLETED
        }
      }
      cleanupScope.cancel()
      completed
    } catch (error: Throwable) {
      val stopFailure = error as? CaptureFailure
        ?: CaptureFailure("FILE_FINALIZATION_FAILED", "PPG 与 frame CSV 未能正常完成。", error)
      markFailed(stopFailure)
      cleanupFailedResources()
      throw failure ?: stopFailure
    }
  }

  /** 获取会话当前终态错误，供低频状态快照使用。 */
  val terminalFailure: CaptureFailure?
    get() = synchronized(lock) { failure }

  /** 当前会话仍允许登记正式帧时为真。 */
  val isCapturing: Boolean
    get() = synchronized(lock) { acceptingFrames }

  private fun markFailed(cause: CaptureFailure): Boolean {
    var firstFailure = false
    var hub: DataHub<CaptureRecord>? = null
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
  private fun abortPendingCorrelations(cause: CaptureFailure) = synchronized(correlationLock) {
    val update = metadataCorrelator.abort(
      FrameCorrelationFailure(cause.code, cause.message ?: "采集会话已失败。"),
    )
    for (frameIndex in update.failedFrameIndexes) finishFrame(frameIndex, null, cause)
  }

  private fun notifyFailure(cause: CaptureFailure) {
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
        closeWriters()
      } catch (_: Throwable) {
        // 失败文件不作为产物返回，关闭错误不替换原始错误。
      }
    } finally {
      cleanupComplete.complete(Unit)
      cleanupScope.cancel()
    }
  }

  private suspend fun closeWriters() {
    if (!writersClosed.compareAndSet(false, true)) return
    val (activePpgWriter, activeFrameWriter) = synchronized(lock) { ppgWriter to frameWriter }
    withContext(ioDispatcher) {
      var closeFailure: Throwable? = null
      try {
        activePpgWriter?.close()
      } catch (error: Throwable) {
        closeFailure = error
      }
      try {
        activeFrameWriter?.close()
      } catch (error: Throwable) {
        val priorFailure = closeFailure
        if (priorFailure == null) closeFailure = error else priorFailure.addSuppressed(error)
      }
      closeFailure?.let { throw it }
    }
  }


  private companion object {
    const val NO_FRAME = -1L
    const val CAPTURE_RESULT_WAIT_TIMEOUT_MILLIS = 1_000L
    val SESSION_ID_PATTERN = Regex("[A-Za-z0-9_-]+")
  }
}
