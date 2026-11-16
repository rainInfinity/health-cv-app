/** 管理单一传感器 CSV 的打开、顺序写入、关闭和完成路径发布。 */

package com.healthcvapp.acquisition.sensors.output

import com.healthcvapp.acquisition.sensors.model.SensorArtifact
import com.healthcvapp.acquisition.sensors.model.SensorCaptureFailure
import com.healthcvapp.acquisition.sensors.model.SensorConfig
import com.healthcvapp.acquisition.sensors.model.SensorKind
import com.healthcvapp.acquisition.sensors.model.SensorSample
import com.healthcvapp.acquisition.storage.AcquisitionFileStore
import com.healthcvapp.acquisition.storage.AcquisitionPaths
import com.healthcvapp.acquisition.storage.csv.BatchWriter
import com.healthcvapp.acquisition.storage.csv.BatchWriterFactory
import com.healthcvapp.acquisition.storage.csv.CsvBatchWriterFactory
import java.io.File
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** 由单个有序消费者调用；只有关闭且非空的文件才可发布。 */
internal class SensorSessionOutput(
  filesDirectory: File,
  private val kind: SensorKind,
  private val sessionId: String,
  private val config: SensorConfig,
  private val fileStore: AcquisitionFileStore = AcquisitionFileStore(),
  private val writerFactory: BatchWriterFactory<SensorSample> =
    CsvBatchWriterFactory(fileStore, SensorCsvEncoder(kind)),
  private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
  private val paths = AcquisitionPaths(filesDirectory)
  private var writer: BatchWriter<SensorSample>? = null
  private var opened = false
  private var closed = false
  private var published = false
  private var sampleCount = 0L
  private var closeFailure: SensorCaptureFailure? = null

  init {
    paths.sensorSessionDirectory(kind, sessionId)
  }

  /** 创建类型与会话隔离目录，并以拒覆盖语义打开临时文件。 */
  suspend fun open() = withContext(ioDispatcher) {
    check(!opened && !closed) { "sensor session output can only be opened once" }
    opened = true
    try {
      val directory = paths.sensorSessionDirectory(kind, sessionId)
      fileStore.ensureDirectory(directory)
      writer = writerFactory.open(paths.sensorPartialFile(kind, sessionId))
    } catch (error: Throwable) {
      throw SensorCaptureFailure("FILE_OPEN_FAILED", "无法创建传感器 CSV 文件。", error)
    }
  }

  /** 按收到顺序写入一批数值，并只在批次完整写入后累加样本数。 */
  suspend fun writeBatch(records: List<SensorSample>) {
    val activeWriter = writer ?: throw SensorCaptureFailure("FILE_WRITE_FAILED", "传感器 CSV writer 尚未打开或已关闭。")
    try {
      activeWriter.writeBatch(records)
      sampleCount += records.size
    } catch (error: Throwable) {
      throw SensorCaptureFailure("FILE_WRITE_FAILED", "传感器 CSV 写入失败。", error)
    }
  }

  /** 关闭 writer；关闭失败会使本会话永远不能发布完成路径。 */
  suspend fun close() = withContext(ioDispatcher) {
    if (closed) return@withContext
    val activeWriter = writer
    try {
      activeWriter?.close()
      writer = null
      closed = true
    } catch (error: Throwable) {
      SensorCaptureFailure("FILE_FINALIZATION_FAILED", "传感器 CSV 文件关闭失败。", error)
        .also { closeFailure = it }
        .also { throw it }
    }
  }

  /** 撤销未开窗输出，释放 writer 后删除临时文件，允许同轮重新准备。 */
  suspend fun discard() = withContext(ioDispatcher) {
    check(!published && sampleCount == 0L) { "cannot discard recorded sensor output" }
    close()
    val partial = paths.sensorPartialFile(kind, sessionId)
    if (partial.exists() && !partial.delete()) {
      throw SensorCaptureFailure("FILE_FINALIZATION_FAILED", "无法撤销传感器准备文件。")
    }
    opened = false
    closed = false
    closeFailure = null
  }

  /** 提升非空关闭文件并创建仅描述该类型的完成产物。 */
  fun publish(startedAtMillis: Long, finishedAtMillis: Long): SensorArtifact {
    closeFailure?.let { throw it }
    check(closed) { "sensor session output must be closed before publication" }
    check(!published) { "sensor session output can only be published once" }
    if (sampleCount == 0L) {
      throw SensorCaptureFailure("SENSOR_NO_SAMPLES", "传感器会话没有收到有效样本。")
    }

    published = true
    val completedFile = try {
      fileStore.promote(
        paths.sensorPartialFile(kind, sessionId),
        paths.sensorCompletedFile(kind, sessionId),
      )
    } catch (error: Throwable) {
      throw SensorCaptureFailure("FILE_FINALIZATION_FAILED", "传感器 CSV 无法完成发布。", error)
    }

    return SensorArtifact(
      kind = kind,
      sessionId = sessionId,
      path = completedFile.absolutePath,
      sizeBytes = completedFile.length(),
      sampleCount = sampleCount,
      startedAtMillis = startedAtMillis,
      finishedAtMillis = finishedAtMillis,
      requestedSamplingPeriodMicros = config.requestedSamplingPeriodMicros,
      registeredSamplingPeriodMicros = config.registeredSamplingPeriodMicros,
      unit = kind.unit,
      coordinateSystem = kind.coordinateSystem,
    )
  }
}
