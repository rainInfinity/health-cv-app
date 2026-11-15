/** 只转换指尖低频事实与有界标量批次，不跨桥传原始帧。 */
package com.margelo.nitro.acquisition

import com.healthcvapp.acquisition.ppg.fingertip.FingertipPulseBatchData
import com.healthcvapp.acquisition.ppg.fingertip.FingertipSnapshotData
import com.healthcvapp.acquisition.ppg.model.PPGArtifact
import com.margelo.nitro.core.NullType

/** 保留可空字段与绝对纳秒的十进制字符串语义。 */
internal fun FingertipSnapshotData.toNitro(artifactMapper: (PPGArtifact) -> AcquisitionArtifact) = FingertipSnapshot(
  captureId = captureId,
  sessionId = sessionId.fingertipNullable(),
  phase = FingertipPhase.valueOf(phase.uppercase()),
  coveragePercent = coverage.percent?.let { Variant_NullType_Double.create(it) }
    ?: Variant_NullType_Double.create(NullType.NULL),
  coverageState = FingertipCoverageState.valueOf(coverage.state.name),
  coverageReady = coverageReady,
  targetDurationMillis = targetDurationMillis.toDouble(),
  elapsedMillis = elapsedMillis,
  remainingMillis = remainingMillis,
  endReason = endReason.fingertipNullable(),
  errorCode = errorCode.fingertipNullable(),
  errorMessage = errorMessage.fingertipNullable(),
  artifact = artifact?.let { Variant_NullType_AcquisitionArtifact.create(artifactMapper(it)) }
    ?: Variant_NullType_AcquisitionArtifact.create(NullType.NULL),
  windowStartElapsedNanos = windowStart?.toString().fingertipNullable(),
  windowEndElapsedNanos = windowEnd?.toString().fingertipNullable(),
  receivedFrameCount = receivedFrameCount.toDouble(),
  firstFrameTimestampNanos = firstTimestamp?.toString().fingertipNullable(),
  lastFrameTimestampNanos = lastTimestamp?.toString().fingertipNullable(),
  cameraConfigSummary = configuration?.let { Variant_NullType_CameraConfigSummary.create(it.toNitro()) }
    ?: Variant_NullType_CameraConfigSummary.create(NullType.NULL),
  resourcesReleased = resourcesReleased,
)

/** 转换真实时间数组与幅值，不补成固定帧率。 */
internal fun FingertipPulseBatchData.toNitro() = FingertipPulseBatch(
  captureId, sessionId, segmentId.toDouble(), sequence.toDouble(), timesMillis.toDoubleArray(), values.toDoubleArray(),
)

/** 显式空分支不能被空字符串或数值零替代。 */
private fun String?.fingertipNullable(): Variant_NullType_String = this?.let { Variant_NullType_String.create(it) }
  ?: Variant_NullType_String.create(NullType.NULL)
