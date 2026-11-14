/** 原子发布 RPPG 三件套，并从最终目录重建本地产物列表。 */

package com.healthcvapp.acquisition.rppg.output

import com.healthcvapp.acquisition.rppg.model.RPPGArtifact
import com.healthcvapp.acquisition.rppg.model.RPPGArtifactFile
import com.healthcvapp.acquisition.rppg.model.RPPGArtifactFileKind
import com.healthcvapp.acquisition.rppg.model.RPPGSessionSource
import com.healthcvapp.acquisition.rppg.model.RPPGSessionSampleCounts
import com.healthcvapp.acquisition.rppg.model.RPPGSignalStatus
import com.healthcvapp.acquisition.rppg.model.RPPGTerminationReason
import com.healthcvapp.acquisition.storage.AcquisitionFileStore
import com.healthcvapp.acquisition.storage.AcquisitionPaths
import java.io.File
import java.io.IOException
import java.util.concurrent.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** 只把元信息完整且三份文件齐全的目录发布或列为完成结果。 */
internal class RPPGArtifactStore(
  filesDirectory: File,
  private val fileStore: AcquisitionFileStore = AcquisitionFileStore(),
  private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
  private val paths = AcquisitionPaths(filesDirectory)
  /** 从已写入的 session.json 读取可展示的来源、结束、质量和计数摘要。 */
  private data class SessionMetadata(
    /** 本地结果所属采集流程。 */
    val source: RPPGSessionSource,
    /** 正常结束原因。 */
    val termination: RPPGTerminationReason,
    /** 最终信号质量结论。 */
    val signalStatus: RPPGSignalStatus,
    /** 两份 CSV 中已落盘的实际记录数量。 */
    val sampleCounts: RPPGSessionSampleCounts,
  )

  /** 校验临时三件套后，以同文件系统目录重命名一次性发布。 */
  fun publish(
    sessionId: String,
    claimPublication: () -> Boolean = { true },
  ): RPPGArtifact {
    val temporaryDirectory = paths.rppgPartialSessionDirectory(sessionId)
    val completedDirectory = paths.rppgSessionDirectory(sessionId)
    if (completedDirectory.exists()) {
      throw IOException("RPPG 最终会话目录已存在，拒绝覆盖：${completedDirectory.absolutePath}")
    }
    val temporaryFiles = sessionFiles(sessionId, partial = true)
    if (!temporaryDirectory.isDirectory || temporaryFiles.any { !it.isFile || it.length() <= 0L }) {
      throw IOException("RPPG 临时会话缺少完整三件套。")
    }
    val metadata = readMetadata(temporaryFiles[0], sessionId)
      ?: throw IOException("RPPG session.json 缺失完整标记、质量摘要或会话身份不匹配。")
    if (!claimPublication()) throw CancellationException("RPPG 会话关闭先于完整产物发布。")

    fileStore.promoteDirectory(temporaryDirectory, completedDirectory)
    val completedFiles = sessionFiles(sessionId, partial = false)
    if (!completedDirectory.isDirectory || completedFiles.any { !it.isFile || it.length() <= 0L }) {
      throw IOException("RPPG 三件套目录提升后不完整。")
    }
    return toArtifact(sessionId, metadata, completedFiles)
  }

  /** 从最终目录扫描完整三件套；默认仅列出主动来源，可显式查询被动或全部来源。 */
  suspend fun listArtifacts(source: RPPGSessionSource? = RPPGSessionSource.ACTIVE): List<RPPGArtifact> =
    withContext(ioDispatcher) {
      val root = paths.rppgRootDirectory()
      val canonicalRoot = root.canonicalFile
      root.listFiles()
        .orEmpty()
        .asSequence()
        .filter(File::isDirectory)
        .filter { directory -> directory.canonicalFile.parentFile == canonicalRoot }
        .mapNotNull { directory ->
          val sessionId = directory.name
          val expectedDirectory = runCatching { paths.rppgSessionDirectory(sessionId) }.getOrNull()
            ?: return@mapNotNull null
          if (expectedDirectory.canonicalFile != directory.canonicalFile) return@mapNotNull null
          val files = sessionFiles(sessionId, partial = false)
          if (files.any { !it.isFile || it.length() <= 0L }) return@mapNotNull null
          val metadata = readMetadata(files[0], sessionId) ?: return@mapNotNull null
          if (source != null && metadata.source != source) return@mapNotNull null
          toArtifact(sessionId, metadata, files)
        }
        .sortedBy(RPPGArtifact::sessionId)
        .toList()
    }

  /** 按稳定顺序返回临时或最终会话目录中的三份文件。 */
  private fun sessionFiles(sessionId: String, partial: Boolean): List<File> = if (partial) {
    listOf(
      paths.rppgPartialSessionJsonFile(sessionId),
      paths.rppgPartialPulseFile(sessionId),
      paths.rppgPartialHeartRateFile(sessionId),
    )
  } else {
    listOf(
      paths.rppgSessionJsonFile(sessionId),
      paths.rppgPulseFile(sessionId),
      paths.rppgHeartRateFile(sessionId),
    )
  }

  /** 只接受当前 schema、匹配目录标识且包含有效结束、质量和计数信息的完整元数据。 */
  private fun readMetadata(file: File, expectedSessionId: String): SessionMetadata? {
    val text = runCatching { file.readText(Charsets.UTF_8) }.getOrNull() ?: return null
    if (!text.trimEnd().endsWith(COMPLETE_MARKER_SUFFIX)) return null
    val identity = METADATA_IDENTITY_PATTERN.find(text) ?: return null
    if (identity.groupValues[1] != expectedSessionId) return null
    val source = RPPGSessionSource.entries.firstOrNull { it.wireValue == identity.groupValues[2] }
      ?: return null
    val terminationValue = TERMINATION_PATTERN.find(text)?.groupValues?.get(1) ?: return null
    val termination = RPPGTerminationReason.entries.firstOrNull { it.wireValue == terminationValue }
      ?: return null
    val signalStatusValue = SIGNAL_STATUS_PATTERN.find(text)?.groupValues?.get(1) ?: return null
    val signalStatus = RPPGSignalStatus.entries.firstOrNull { it.wireValue == signalStatusValue }
      ?: return null
    val counts = SAMPLE_COUNTS_PATTERN.find(text)?.groupValues ?: return null
    val pulseSamples = counts[1].toLongOrNull() ?: return null
    val heartRateWindows = counts[2].toLongOrNull() ?: return null
    val validHeartRateWindows = counts[3].toLongOrNull() ?: return null
    val rejectedHeartRateWindows = counts[4].toLongOrNull() ?: return null
    if (validHeartRateWindows > heartRateWindows ||
      rejectedHeartRateWindows != heartRateWindows - validHeartRateWindows
    ) {
      return null
    }
    if (!signalStatusMatchesCounts(signalStatus, pulseSamples, heartRateWindows, validHeartRateWindows)) {
      return null
    }
    return SessionMetadata(
      source = source,
      termination = termination,
      signalStatus = signalStatus,
      sampleCounts = RPPGSessionSampleCounts(
        pulseSamples = pulseSamples,
        heartRateWindows = heartRateWindows,
        validHeartRateWindows = validHeartRateWindows,
      ),
    )
  }

  /** 拒绝质量结论与已落盘样本计数互相矛盾的目录。 */
  private fun signalStatusMatchesCounts(
    signalStatus: RPPGSignalStatus,
    pulseSamples: Long,
    heartRateWindows: Long,
    validHeartRateWindows: Long,
  ): Boolean = when (signalStatus) {
    RPPGSignalStatus.VALID_HEART_RATE -> validHeartRateWindows > 0L
    RPPGSignalStatus.NO_VALID_HEART_RATE ->
      validHeartRateWindows == 0L && (pulseSamples > 0L || heartRateWindows > 0L)
    RPPGSignalStatus.NO_WAVEFORM -> pulseSamples == 0L && heartRateWindows == 0L
  }

  /** 将已验证的会话摘要、文件绝对路径及实际字节数装入查询结果。 */
  private fun toArtifact(sessionId: String, metadata: SessionMetadata, files: List<File>) =
    RPPGArtifact(
      sessionId = sessionId,
      source = metadata.source,
      termination = metadata.termination,
      signalStatus = metadata.signalStatus,
      sampleCounts = metadata.sampleCounts,
      files = listOf(
        artifactFile(RPPGArtifactFileKind.SESSION_JSON, files[0]),
        artifactFile(RPPGArtifactFileKind.PULSE, files[1]),
        artifactFile(RPPGArtifactFileKind.HEART_RATE, files[2]),
      ),
    )

  /** 构造一份已关闭文件的绝对路径及字节数。 */
  private fun artifactFile(kind: RPPGArtifactFileKind, file: File) = RPPGArtifactFile(
    kind = kind,
    path = file.absolutePath,
    sizeBytes = file.length(),
  )

  private companion object {
    const val COMPLETE_MARKER_SUFFIX = ",\"complete\":true}"
    val METADATA_IDENTITY_PATTERN = Regex(
      """^\{"schemaVersion":"rppg-session-v1","algorithmVersion":"(?:\\.|[^"\\])*","sessionId":"([A-Za-z0-9_-]+)","source":"(active|passive)","sensorTimeOriginNs":"[0-9]+","startedAt":"(?:\\.|[^"\\])*","finishedAt":""",
    )
    val TERMINATION_PATTERN = Regex(""""termination":"([a-z_]+)"""")
    val SIGNAL_STATUS_PATTERN = Regex(""""signalStatus":"([a-z_]+)"""")
    val SAMPLE_COUNTS_PATTERN = Regex(
      """"sampleCounts":\{"pulseSamples":([0-9]+),"heartRateWindows":([0-9]+),"validHeartRateWindows":([0-9]+),"rejectedHeartRateWindows":([0-9]+)\}""",
    )
  }
}
