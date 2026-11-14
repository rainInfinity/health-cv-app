/** 将共用 RPPG 原生产物模型无损映射为 Nitro 公开类型。 */

package com.margelo.nitro.acquisition

import com.healthcvapp.acquisition.rppg.model.RPPGArtifact as ModelRPPGArtifact
import com.healthcvapp.acquisition.rppg.model.RPPGArtifactFileKind as ModelRPPGArtifactFileKind
import com.healthcvapp.acquisition.rppg.model.RPPGSessionSource as ModelRPPGSessionSource
import com.healthcvapp.acquisition.rppg.model.RPPGSignalStatus as ModelRPPGSignalStatus
import com.healthcvapp.acquisition.rppg.model.RPPGTerminationReason as ModelRPPGTerminationReason

/** 集中映射主动与被动查询共享的完成产物。 */
internal object RPPGArtifactNitroMapper {
  /** 保留会话结束、信号质量、实际计数及三份文件的来源数据。 */
  fun toNitro(artifact: ModelRPPGArtifact) = RPPGArtifact(
    sessionId = artifact.sessionId,
    source = artifact.source.toNitro(),
    termination = artifact.termination.toNitro(),
    signalStatus = artifact.signalStatus.toNitro(),
    sampleCounts = RPPGSampleCounts(
      pulseSamples = artifact.sampleCounts.pulseSamples.toDouble(),
      heartRateWindows = artifact.sampleCounts.heartRateWindows.toDouble(),
      validHeartRateWindows = artifact.sampleCounts.validHeartRateWindows.toDouble(),
      rejectedHeartRateWindows = artifact.sampleCounts.rejectedHeartRateWindows.toDouble(),
    ),
    files = artifact.files.map { file ->
      RPPGArtifactFile(
        kind = file.kind.toNitro(),
        path = file.path,
        sizeBytes = file.sizeBytes.toDouble(),
      )
    }.toTypedArray(),
  )

  /** 映射已持久化的主动或被动来源。 */
  private fun ModelRPPGSessionSource.toNitro(): RPPGSource = when (this) {
    ModelRPPGSessionSource.ACTIVE -> RPPGSource.ACTIVE
    ModelRPPGSessionSource.PASSIVE -> RPPGSource.PASSIVE
  }

  /** 映射合法结束原因，技术失败由会话错误单独表达。 */
  private fun ModelRPPGTerminationReason.toNitro(): RPPGTerminationReason = when (this) {
    ModelRPPGTerminationReason.TARGET_DURATION -> RPPGTerminationReason.TARGET_DURATION
    ModelRPPGTerminationReason.USER_STOP -> RPPGTerminationReason.USER_STOP
    ModelRPPGTerminationReason.PAGE_LEFT -> RPPGTerminationReason.PAGE_LEFT
    ModelRPPGTerminationReason.APP_BACKGROUND -> RPPGTerminationReason.APP_BACKGROUND
    ModelRPPGTerminationReason.OBSERVATION_TIMEOUT -> RPPGTerminationReason.OBSERVATION_TIMEOUT
    ModelRPPGTerminationReason.INTERRUPTED -> RPPGTerminationReason.INTERRUPTED
  }

  /** 映射最终信号质量结论。 */
  private fun ModelRPPGSignalStatus.toNitro(): RPPGSignalStatus = when (this) {
    ModelRPPGSignalStatus.VALID_HEART_RATE -> RPPGSignalStatus.VALID_HEART_RATE
    ModelRPPGSignalStatus.NO_VALID_HEART_RATE -> RPPGSignalStatus.NO_VALID_HEART_RATE
    ModelRPPGSignalStatus.NO_WAVEFORM -> RPPGSignalStatus.NO_WAVEFORM
  }

  /** 映射三件套中文件用途。 */
  private fun ModelRPPGArtifactFileKind.toNitro(): RPPGArtifactFileKind = when (this) {
    ModelRPPGArtifactFileKind.SESSION_JSON -> RPPGArtifactFileKind.SESSION
    ModelRPPGArtifactFileKind.PULSE -> RPPGArtifactFileKind.PULSE
    ModelRPPGArtifactFileKind.HEART_RATE -> RPPGArtifactFileKind.HEART_RATE
  }
}
