/** 管理 PPG 双 CSV 的打开、顺序写入、关闭与完成发布。 */

package com.healthcvapp.acquisition.ppg.output

import com.healthcvapp.acquisition.ppg.model.PPGArtifact
import com.healthcvapp.acquisition.ppg.model.PPGArtifactFile
import com.healthcvapp.acquisition.ppg.model.PPGArtifactFileKind
import com.healthcvapp.acquisition.ppg.model.PPGCaptureRecord
import com.healthcvapp.acquisition.storage.AcquisitionFileStore
import com.healthcvapp.acquisition.storage.AcquisitionPaths
import com.healthcvapp.acquisition.storage.csv.BatchWriter
import com.healthcvapp.acquisition.storage.csv.BatchWriterFactory
import com.healthcvapp.acquisition.storage.csv.CsvBatchWriterFactory
import java.io.File
import java.io.IOException
import com.healthcvapp.acquisition.ppg.model.PPGConfigSummary
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** 由一个有序消费者调用，成功时只返回两份已关闭并提升的产物。 */
internal class PPGSessionOutput(
  filesDirectory: File,
  private val sessionId: String,
  private val fileStore: AcquisitionFileStore = AcquisitionFileStore(),
  private val ppgWriterFactory: BatchWriterFactory<PPGCaptureRecord> =
    CsvBatchWriterFactory(fileStore, PPGCsvEncoder),
  private val frameWriterFactory: BatchWriterFactory<PPGCaptureRecord> =
    CsvBatchWriterFactory(fileStore, FrameCsvEncoder),
  private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
  private val paths = AcquisitionPaths(filesDirectory)
  private val openStarted = AtomicBoolean(false)
  private val ppgWriterClosed = AtomicBoolean(false)
  private var ppgWriter: BatchWriter<PPGCaptureRecord>? = null
  private var frameWriter: BatchWriter<PPGCaptureRecord>? = null
  private var publicationStarted = false
  init {
    paths.ppgSessionDirectory(sessionId)
  }

  /** 创建会话目录并按 PPG、frame 顺序打开拒覆盖输出。 */
  suspend fun open() = withContext(ioDispatcher) {
    check(openStarted.compareAndSet(false, true) && !ppgWriterClosed.get()) {
      "PPG session output can only be opened once"
    }
    fileStore.ensureDirectory(paths.ppgSessionDirectory(sessionId))
    val openedPpgWriter = ppgWriterFactory.open(paths.ppgPartialFile(sessionId))
    ppgWriter = openedPpgWriter
    try {
      frameWriter = frameWriterFactory.open(paths.framePartialFile(sessionId))
    } catch (error: Throwable) {
      ppgWriter = null
      try {
        openedPpgWriter.close()
      } catch (closeError: Throwable) {
        if (closeError !== error) error.addSuppressed(closeError)
      }
      ppgWriterClosed.set(true)
      throw error
    }
  }

  /** 将同一批配对记录先交给 PPG，再交给 frame writer。 */
  suspend fun writeBatch(records: List<PPGCaptureRecord>) {
    val activePpgWriter = ppgWriter ?: throw IOException("PPG CSV writer 尚未打开或已关闭")
    val activeFrameWriter = frameWriter ?: throw IOException("frame CSV writer 尚未打开或已关闭")
    activePpgWriter.writeBatch(records)
    activeFrameWriter.writeBatch(records)
  }

  /** 尝试关闭两侧 writer；第二侧错误不会跳过第一侧回收。 */
  suspend fun close() = withContext(ioDispatcher) {
    if (!ppgWriterClosed.compareAndSet(false, true)) return@withContext
    val activePpgWriter = ppgWriter
    val activeFrameWriter = frameWriter
    ppgWriter = null
    frameWriter = null
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
      if (priorFailure == null) closeFailure = error else if (error !== priorFailure) priorFailure.addSuppressed(error)
    }
    closeFailure?.let { throw it }
  }

  /** 提升两份已关闭文件并在第二侧失败时回退第一侧。 */
  fun publish(
    startedAtMillis: Long,
    finishedAtMillis: Long,
    cameraConfigSummary: PPGConfigSummary? = null,
  ): PPGArtifact {
    check(ppgWriterClosed.get()) { "PPG session output must be closed before publication" }
    check(!publicationStarted) { "PPG session output can only be published once" }
    publicationStarted = true

    val ppgPartial = paths.ppgPartialFile(sessionId)
    val ppgCompleted = paths.ppgCompletedFile(sessionId)
    val framePartial = paths.framePartialFile(sessionId)
    val frameCompleted = paths.frameCompletedFile(sessionId)
    val publishedPpg = fileStore.promote(ppgPartial, ppgCompleted)
    try {
      fileStore.promote(framePartial, frameCompleted)
    } catch (error: Throwable) {
      try {
        fileStore.promote(ppgCompleted, ppgPartial)
      } catch (rollbackError: Throwable) {
        if (rollbackError !== error) error.addSuppressed(rollbackError)
      }
      throw error
    }

    return PPGArtifact(
      sessionId = sessionId,
      files = listOf(
        PPGArtifactFile(PPGArtifactFileKind.PPG, publishedPpg.absolutePath, publishedPpg.length()),
        PPGArtifactFile(PPGArtifactFileKind.FRAME, frameCompleted.absolutePath, frameCompleted.length()),
      ),
      startedAtMillis = startedAtMillis,
      finishedAtMillis = finishedAtMillis,
      cameraConfigSummary = cameraConfigSummary,
    )
  }
}
