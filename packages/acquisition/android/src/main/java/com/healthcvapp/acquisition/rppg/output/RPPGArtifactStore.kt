/** 原子发布 RPPG 结果文件集合，并从最终目录重建本地产物列表。 */

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

/** 按 schema 校验完整文件集合；旧三件套与新四件套可同时查询。 */
internal class RPPGArtifactStore(
  filesDirectory: File,
  private val fileStore: AcquisitionFileStore = AcquisitionFileStore(),
  private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
  private val paths = AcquisitionPaths(filesDirectory)
  /** 从已写入的 session.json 读取可展示的来源、结束、质量和计数摘要。 */
  private data class SessionMetadata(
    /** 决定必须具备三份还是四份文件。 */
    val schemaVersion: String,
    /** session.json 中原样保留的 UTC ISO 开始时间。 */
    val startedAt: String,
    /** 本地结果所属采集流程。 */
    val source: RPPGSessionSource,
    /** 正常结束原因。 */
    val termination: RPPGTerminationReason,
    /** 最终信号质量结论。 */
    val signalStatus: RPPGSignalStatus,
    /** 两份 CSV 中已落盘的实际记录数量。 */
    val sampleCounts: RPPGSessionSampleCounts,
  )

  /** 校验临时文件集合后，以同文件系统目录重命名一次性发布。 */
  fun publish(
    sessionId: String,
    claimPublication: () -> Boolean = { true },
  ): RPPGArtifact {
    val temporaryDirectory = paths.rppgPartialSessionDirectory(sessionId)
    val completedDirectory = paths.rppgSessionDirectory(sessionId)
    if (completedDirectory.exists()) {
      throw IOException("RPPG 最终会话目录已存在，拒绝覆盖：${completedDirectory.absolutePath}")
    }
    val metadata = readMetadata(paths.rppgPartialSessionJsonFile(sessionId), sessionId)
      ?: throw IOException("RPPG session.json 缺失完整标记、质量摘要或会话身份不匹配。")
    val temporaryFiles = sessionFiles(sessionId, partial = true, schemaVersion = metadata.schemaVersion)
    if (!temporaryDirectory.isDirectory || temporaryFiles.any { !it.isFile || it.length() <= 0L }) {
      throw IOException("RPPG 临时会话缺少当前格式要求的完整文件集合。")
    }
    if (!claimPublication()) throw CancellationException("RPPG 会话关闭先于完整产物发布。")

    fileStore.promoteDirectory(temporaryDirectory, completedDirectory)
    val completedFiles = sessionFiles(sessionId, partial = false, schemaVersion = metadata.schemaVersion)
    if (!completedDirectory.isDirectory || completedFiles.any { !it.isFile || it.length() <= 0L }) {
      throw IOException("RPPG 结果目录提升后不完整。")
    }
    return toArtifact(sessionId, metadata, completedFiles)
  }

  /** 扫描完整的 v1／v2 结果；默认仅列出主动来源，可查询被动或全部来源。 */
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
          val metadata = readMetadata(paths.rppgSessionJsonFile(sessionId), sessionId)
            ?: return@mapNotNull null
          val files = sessionFiles(sessionId, partial = false, schemaVersion = metadata.schemaVersion)
          if (files.any { !it.isFile || it.length() <= 0L }) return@mapNotNull null
          if (source != null && metadata.source != source) return@mapNotNull null
          toArtifact(sessionId, metadata, files)
        }
        .sortedWith(compareBy<RPPGArtifact> { it.startedAtSortKey }.thenBy { it.sessionId })
        .toList()
    }

  /** v1 只返回原有三件套；v2 逐搏文件即使只有表头也必须存在。 */
  private fun sessionFiles(sessionId: String, partial: Boolean, schemaVersion: String): List<File> = buildList {
    if (partial) {
      add(paths.rppgPartialSessionJsonFile(sessionId))
      add(paths.rppgPartialPulseFile(sessionId))
      add(paths.rppgPartialHeartRateFile(sessionId))
      if (schemaVersion == "rppg-session-v2") add(paths.rppgPartialBeatFile(sessionId))
    } else {
      add(paths.rppgSessionJsonFile(sessionId))
      add(paths.rppgPulseFile(sessionId))
      add(paths.rppgHeartRateFile(sessionId))
      if (schemaVersion == "rppg-session-v2") add(paths.rppgBeatFile(sessionId))
    }
  }

  /** 接受 v1／v2、匹配目录身份且包含有效结束、质量和计数信息的完整元数据。 */
  private fun readMetadata(file: File, expectedSessionId: String): SessionMetadata? {
    val text = runCatching { file.readText(Charsets.UTF_8) }.getOrNull() ?: return null
    if (!text.trimEnd().endsWith(COMPLETE_MARKER_SUFFIX)) return null
    val identity = METADATA_IDENTITY_PATTERN.find(text) ?: return null
    if (identity.groupValues[2] != expectedSessionId) return null
    val source = RPPGSessionSource.entries.firstOrNull { it.wireValue == identity.groupValues[3] }
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
      schemaVersion = identity.groupValues[1],
      startedAt = identity.groupValues[4],
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
      startedAt = metadata.startedAt,
      source = metadata.source,
      termination = metadata.termination,
      signalStatus = metadata.signalStatus,
      sampleCounts = metadata.sampleCounts,
      files = buildList {
        add(artifactFile(RPPGArtifactFileKind.SESSION_JSON, files[0]))
        add(artifactFile(RPPGArtifactFileKind.PULSE, files[1]))
        add(artifactFile(RPPGArtifactFileKind.HEART_RATE, files[2]))
        if (metadata.schemaVersion == "rppg-session-v2") {
          add(artifactFile(RPPGArtifactFileKind.INSTANT_HEART_RATE, files[3]))
        }
      },
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
      """^\{"schemaVersion":"(rppg-session-v[12])","algorithmVersion":"(?:\\.|[^"\\])*","sessionId":"([A-Za-z0-9_-]+)","source":"(active|passive)","sensorTimeOriginNs":"[0-9]+","startedAt":"([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?Z)","finishedAt":""",
    )
    val TERMINATION_PATTERN = Regex(""""termination":"([a-z_]+)"""")
    val SIGNAL_STATUS_PATTERN = Regex(""""signalStatus":"([a-z_]+)"""")
    val SAMPLE_COUNTS_PATTERN = Regex(
      """"sampleCounts":\{"pulseSamples":([0-9]+),"heartRateWindows":([0-9]+),"validHeartRateWindows":([0-9]+),"rejectedHeartRateWindows":([0-9]+)\}""",
    )
  }
}
