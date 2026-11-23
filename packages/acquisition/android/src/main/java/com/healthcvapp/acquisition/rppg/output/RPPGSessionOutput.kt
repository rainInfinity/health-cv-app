/** 管理 RPPG 结果文件的打开、顺序写入、关闭与元信息定稿。 */

package com.healthcvapp.acquisition.rppg.output

import com.healthcvapp.acquisition.rppg.model.RPPGHeartRateWindow
import com.healthcvapp.acquisition.rppg.model.RPPGInstantHeartRate
import com.healthcvapp.acquisition.rppg.model.RPPGPulseSample
import com.healthcvapp.acquisition.rppg.model.RPPGSegmentRange
import com.healthcvapp.acquisition.rppg.model.RPPGSessionDescriptor
import com.healthcvapp.acquisition.rppg.model.RPPGSessionFinalization
import com.healthcvapp.acquisition.rppg.model.RPPGSessionRecord
import com.healthcvapp.acquisition.rppg.model.RPPGSessionSampleCounts
import com.healthcvapp.acquisition.rppg.model.RPPGSignalStatus
import com.healthcvapp.acquisition.storage.AcquisitionFileStore
import com.healthcvapp.acquisition.storage.AcquisitionPaths
import com.healthcvapp.acquisition.storage.csv.BatchWriter
import com.healthcvapp.acquisition.storage.csv.BatchWriterFactory
import com.healthcvapp.acquisition.storage.csv.CsvBatchWriterFactory
import java.io.File
import java.io.IOException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** 由单个有序消费者调用，CSV 关闭后才写入完整元信息。 */
internal class RPPGSessionOutput(
  filesDirectory: File,
  private val session: RPPGSessionDescriptor,
  private val fileStore: AcquisitionFileStore = AcquisitionFileStore(),
  private val pulseWriterFactory: BatchWriterFactory<RPPGPulseSample> =
    CsvBatchWriterFactory(fileStore, RPPGPulseCsvEncoder(session.sensorTimeOriginNanos)),
  private val heartRateWriterFactory: BatchWriterFactory<RPPGHeartRateWindow> =
    CsvBatchWriterFactory(fileStore, RPPGHeartRateCsvEncoder),
  private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
  private val beatWriterFactory: BatchWriterFactory<RPPGInstantHeartRate> =
    CsvBatchWriterFactory(fileStore, RPPGBeatCsvEncoder),
) {
  private val paths = AcquisitionPaths(filesDirectory)
  private val openStarted = AtomicBoolean(false)
  private val closed = AtomicBoolean(false)
  private val segmentRanges = ArrayList<SegmentRangeAccumulator>()
  private var pulseWriter: BatchWriter<RPPGPulseSample>? = null
  private var heartRateWriter: BatchWriter<RPPGHeartRateWindow>? = null
  private var beatWriter: BatchWriter<RPPGInstantHeartRate>? = null
  private val writeFailure = AtomicReference<Throwable?>(null)
  private var pulseSampleCount = 0L
  private var heartRateWindowCount = 0L
  private var validHeartRateWindowCount = 0L
  private var lastPulseSampleIndex: Long? = null
  private var lastPulseSegmentIndex: Long? = null
  private var lastPulseTimestampNanos: Long? = null
  private var lastHeartRateSegmentIndex: Long? = null
  private var lastHeartRateStartNanos: Long? = null
  private var lastHeartRateEndNanos: Long? = null
  private var lastBeatSegmentIndex: Long? = null
  private var lastBeatPeakTimestampNanos: Long? = null
  private val beatRecords = ArrayList<RPPGInstantHeartRate>()

  init {
    require(session.schemaVersion == "rppg-session-v1" || session.schemaVersion == "rppg-session-v2") {
      "不支持的 RPPG 会话格式版本。"
    }
    paths.rppgPartialSessionDirectory(session.sessionId)
  }

  /** 创建临时会话目录并打开当前 schema 要求的全部 CSV。 */
  suspend fun open() = withContext(ioDispatcher) {
    check(openStarted.compareAndSet(false, true) && !closed.get()) {
      "RPPG session output can only be opened once"
    }
    try {
      fileStore.ensureDirectory(paths.rppgPartialSessionDirectory(session.sessionId))
      pulseWriter = pulseWriterFactory.open(paths.rppgPartialPulseFile(session.sessionId))
      heartRateWriter = heartRateWriterFactory.open(paths.rppgPartialHeartRateFile(session.sessionId))
      if (session.schemaVersion == "rppg-session-v2") {
        beatWriter = beatWriterFactory.open(paths.rppgPartialBeatFile(session.sessionId))
      }
    } catch (error: Throwable) {
      closeWriter(pulseWriter, error)
      closeWriter(heartRateWriter, error)
      closeWriter(beatWriter, error)
      pulseWriter = null
      heartRateWriter = null
      beatWriter = null
      closed.set(true)
      throw error
    }
  }

  /** 按单一消费者顺序拆分批次，分别追加到波形、频谱和逐搏文件。 */
  suspend fun writeBatch(records: List<RPPGSessionRecord>) {
    if (records.isEmpty()) return
    check(openStarted.get() && !closed.get()) { "RPPG session output 尚未打开或已关闭。" }
    writeFailure.get()?.let { throw it }

    val pulseRecords = ArrayList<RPPGPulseSample>()
    val heartRateRecords = ArrayList<RPPGHeartRateWindow>()
    beatRecords.clear()
    records.forEach { record ->
      when (record) {
        is RPPGPulseSample -> pulseRecords.add(record)
        is RPPGHeartRateWindow -> heartRateRecords.add(record)
        is RPPGInstantHeartRate -> beatRecords.add(record)
      }
    }

    try {
      if (pulseRecords.isNotEmpty()) writePulseBatch(pulseRecords)
      if (heartRateRecords.isNotEmpty()) writeHeartRateBatch(heartRateRecords)
      if (beatRecords.isNotEmpty()) writeBeatBatch(beatRecords)
    } catch (error: Throwable) {
      writeFailure.compareAndSet(null, error)
      throw error
    }
  }

  /** 记录队列或会话处理失败，确保后续关闭不写出完整元信息。 */
  fun fail(cause: Throwable) {
    writeFailure.compareAndSet(null, cause)
  }


  /** 关闭全部 CSV 后，才将完整会话元信息写为最后一份文件。 */
  suspend fun close(finalization: RPPGSessionFinalization) = withContext(ioDispatcher) {
    if (!openStarted.get() || !closed.compareAndSet(false, true)) return@withContext
    val activePulseWriter = pulseWriter
    val activeHeartRateWriter = heartRateWriter
    val activeBeatWriter = beatWriter
    pulseWriter = null
    heartRateWriter = null
    beatWriter = null

    var closeFailure = writeFailure.get()
    closeFailure = closeWriter(activePulseWriter, closeFailure)
    closeFailure = closeWriter(activeHeartRateWriter, closeFailure)
    closeFailure = closeWriter(activeBeatWriter, closeFailure)
    closeFailure?.let { throw it }

    validateSignalStatus(finalization.signalStatus)
    val ranges = segmentRanges.map { it.freeze() }
    val metadata = RPPGSessionJsonEncoder.encode(
      session = session,
      finalization = finalization,
      counts = RPPGSessionSampleCounts(
        pulseSamples = pulseSampleCount,
        heartRateWindows = heartRateWindowCount,
        validHeartRateWindows = validHeartRateWindowCount,
      ),
      segmentRanges = ranges,
    )
    fileStore.createNewOutput(paths.rppgPartialSessionJsonFile(session.sessionId)).use { stream ->
      stream.writer(Charsets.UTF_8).use { writer -> writer.write(metadata) }
    }
  }

  /** 校验并写入严格递增的会话采集时间和样本序号。 */
  private suspend fun writePulseBatch(records: List<RPPGPulseSample>) {
    val writer = pulseWriter ?: throw IOException("RPPG pulse.csv writer 尚未打开或已关闭。")
    var sampleIndex = lastPulseSampleIndex
    var segmentIndex = lastPulseSegmentIndex
    var timestampNanos = lastPulseTimestampNanos
    records.forEach { record ->
      if (record.timestampNanos < session.sensorTimeOriginNanos) {
        throw IOException("脉搏样本早于会话时间原点。")
      }
      if (sampleIndex != null && record.sampleIndex <= sampleIndex) {
        throw IOException("脉搏样本序号必须在会话内严格递增。")
      }
      if (segmentIndex != null && record.segmentIndex < segmentIndex) {
        throw IOException("脉搏片段序号不能回退。")
      }
      if (timestampNanos != null && record.timestampNanos <= timestampNanos) {
        throw IOException("脉搏采集时间必须严格递增。")
      }
      sampleIndex = record.sampleIndex
      segmentIndex = record.segmentIndex
      timestampNanos = record.timestampNanos
    }

    writer.writeBatch(records)
    records.forEach(::updateSegmentRange)
    lastPulseSampleIndex = sampleIndex
    lastPulseSegmentIndex = segmentIndex
    lastPulseTimestampNanos = timestampNanos
    pulseSampleCount = Math.addExact(pulseSampleCount, records.size.toLong())
  }

  /** 校验心率窗口属于已有波形片段，再写入有效值或拒绝原因。 */
  private suspend fun writeHeartRateBatch(records: List<RPPGHeartRateWindow>) {
    val writer = heartRateWriter ?: throw IOException("RPPG hr.csv writer 尚未打开或已关闭。")
    var segmentIndex = lastHeartRateSegmentIndex
    var startNanos = lastHeartRateStartNanos
    var endNanos = lastHeartRateEndNanos
    records.forEach { record ->
      if (record.windowStartNanos < session.sensorTimeOriginNanos) {
        throw IOException("心率窗口早于会话时间原点。")
      }
      if (segmentIndex != null && record.segmentIndex < segmentIndex) {
        throw IOException("心率片段序号不能回退。")
      }
      if (startNanos != null && record.windowStartNanos <= startNanos) {
        throw IOException("心率窗口起始时间必须严格递增。")
      }
      if (endNanos != null && record.windowEndNanos <= endNanos) {
        throw IOException("心率窗口结束时间必须严格递增。")
      }
      val range = segmentRanges.firstOrNull { it.segmentIndex == record.segmentIndex }
        ?: throw IOException("心率窗口没有对应的已落盘脉搏片段。")
      if (record.windowStartNanos < range.firstTimestampNanos || record.windowEndNanos > range.lastTimestampNanos) {
        throw IOException("心率窗口超出其脉搏片段的已落盘范围。")
      }
      segmentIndex = record.segmentIndex
      startNanos = record.windowStartNanos
      endNanos = record.windowEndNanos
    }

    writer.writeBatch(records)
    lastHeartRateSegmentIndex = segmentIndex
    lastHeartRateStartNanos = startNanos
    lastHeartRateEndNanos = endNanos
    heartRateWindowCount = Math.addExact(heartRateWindowCount, records.size.toLong())
    validHeartRateWindowCount = Math.addExact(
      validHeartRateWindowCount,
      records.count { it.valid }.toLong(),
    )
  }

  /** 校验逐搏时间与已落盘波形一致，并拒绝重复快照或回退的峰。 */
  private suspend fun writeBeatBatch(records: List<RPPGInstantHeartRate>) {
    val writer = beatWriter ?: throw IOException("RPPG beat.csv writer 尚未打开或已关闭。")
    var segmentIndex = lastBeatSegmentIndex
    var peakTimestampNanos = lastBeatPeakTimestampNanos
    records.forEach { record ->
      if (record.previousPeakTimestampNanos < session.sensorTimeOriginNanos) {
        throw IOException("逐搏峰早于会话时间原点。")
      }
      if (segmentIndex != null && record.segmentIndex < segmentIndex) {
        throw IOException("逐搏片段序号不能回退。")
      }
      if (peakTimestampNanos != null &&
        (record.peakTimestampNanos <= peakTimestampNanos ||
          record.previousPeakTimestampNanos < peakTimestampNanos)
      ) {
        throw IOException("逐搏峰时间必须递增，不能重复或跨越已记录的间隔。")
      }
      val range = segmentRanges.firstOrNull { it.segmentIndex == record.segmentIndex }
        ?: throw IOException("逐搏读数没有对应的已落盘脉搏片段。")
      if (record.previousPeakTimestampNanos < range.firstTimestampNanos ||
        record.peakTimestampNanos > range.lastTimestampNanos
      ) {
        throw IOException("逐搏读数超出其脉搏片段的已落盘范围。")
      }
      segmentIndex = record.segmentIndex
      peakTimestampNanos = record.peakTimestampNanos
    }
    writer.writeBatch(records)
    lastBeatSegmentIndex = segmentIndex
    lastBeatPeakTimestampNanos = peakTimestampNanos
  }

  /** 累积一个片段的首末样本与实际采集时间。 */
  private fun updateSegmentRange(sample: RPPGPulseSample) {
    val current = segmentRanges.lastOrNull()
    if (current == null || sample.segmentIndex > current.segmentIndex) {
      segmentRanges.add(
        SegmentRangeAccumulator(
          segmentIndex = sample.segmentIndex,
          firstSampleIndex = sample.sampleIndex,
          lastSampleIndex = sample.sampleIndex,
          firstTimestampNanos = sample.timestampNanos,
          lastTimestampNanos = sample.timestampNanos,
          sampleCount = 1L,
        ),
      )
    } else {
      current.lastSampleIndex = sample.sampleIndex
      current.lastTimestampNanos = sample.timestampNanos
      current.sampleCount = Math.addExact(current.sampleCount, 1L)
    }
  }

  /** 确保最终信号状态与已写入的波形及有效心率数量一致。 */
  private fun validateSignalStatus(signalStatus: RPPGSignalStatus) {
    when (signalStatus) {
      RPPGSignalStatus.VALID_HEART_RATE -> check(validHeartRateWindowCount > 0L) {
        "有效心率状态必须对应至少一个有效 HR 窗口。"
      }
      RPPGSignalStatus.NO_VALID_HEART_RATE -> check(
        validHeartRateWindowCount == 0L && (pulseSampleCount > 0L || heartRateWindowCount > 0L),
      ) {
        "无有效心率状态必须有波形或已评估窗口，且不能包含有效 HR。"
      }
      RPPGSignalStatus.NO_WAVEFORM -> check(pulseSampleCount == 0L && heartRateWindowCount == 0L) {
        "未形成波形状态不能包含脉搏样本或心率窗口。"
      }
    }
  }

  /** 关闭单个 writer，并在已有失败时保留首个错误及附属错误。 */
  private fun closeWriter(writer: BatchWriter<*>?, priorFailure: Throwable?): Throwable? {
    if (writer == null) return priorFailure
    return try {
      writer.close()
      priorFailure
    } catch (error: Throwable) {
      if (priorFailure == null) error else {
        if (priorFailure !== error) priorFailure.addSuppressed(error)
        priorFailure
      }
    }
  }


  /** 将打开后的片段统计冻结为可序列化范围。 */
  private class SegmentRangeAccumulator(
    /** 连续片段序号。 */
    val segmentIndex: Long,
    /** 首个已落盘样本序号。 */
    val firstSampleIndex: Long,
    /** 最后一个已落盘样本序号。 */
    var lastSampleIndex: Long,
    /** 首个已落盘样本的绝对采集时间。 */
    val firstTimestampNanos: Long,
    /** 最后一个已落盘样本的绝对采集时间。 */
    var lastTimestampNanos: Long,
    /** 已写入的样本行数。 */
    var sampleCount: Long,
  ) {
    /** 构造不可变的落盘范围快照。 */
    fun freeze() = RPPGSegmentRange(
      segmentIndex = segmentIndex,
      firstSampleIndex = firstSampleIndex,
      lastSampleIndex = lastSampleIndex,
      firstTimestampNanos = firstTimestampNanos,
      lastTimestampNanos = lastTimestampNanos,
      sampleCount = sampleCount,
    )
  }
}
