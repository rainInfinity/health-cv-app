/** 仅转换血压低频事实与同轮完成引用，不跨桥发送 IMU 或波形样本。 */
package com.margelo.nitro.acquisition

import com.healthcvapp.acquisition.ppg.bloodpressure.BloodPressureSnapshotData
import com.healthcvapp.acquisition.ppg.model.PPGArtifact
import com.healthcvapp.acquisition.sensors.model.SensorArtifact as ModelSensorArtifact
import com.healthcvapp.acquisition.sensors.model.SensorKind as ModelSensorKind
import com.margelo.nitro.core.NullType

/** 血压阶段独立映射，不能交给指尖阶段枚举转换。 */
internal fun BloodPressureSnapshotData.toNitro(artifactMapper: (PPGArtifact) -> AcquisitionArtifact) = BloodPressureSnapshot(
  captureId = capture.captureId,
  sessionId = capture.sessionId.bloodPressureNullable(),
  accSessionId = accSessionId.bloodPressureNullable(),
  phase = BloodPressurePhase.valueOf(capture.phase.uppercase()),
  coveragePercent = capture.coverage.percent.bloodPressureNullable(),
  coverageState = FingertipCoverageState.valueOf(capture.coverage.state.name),
  coverageReady = capture.coverageReady,
  tiltDegrees = imu.tiltDegrees.bloodPressureNullable(),
  stable = imu.stable.bloodPressureNullable(),
  scgCandidate = imu.scgCandidate.bloodPressureNullable(),
  targetDurationMillis = capture.targetDurationMillis.toDouble(),
  elapsedMillis = capture.elapsedMillis,
  remainingMillis = capture.remainingMillis,
  endReason = capture.endReason.bloodPressureNullable(),
  errorCode = capture.errorCode.bloodPressureNullable(),
  errorMessage = capture.errorMessage.bloodPressureNullable(),
  artifact = capture.artifact?.let { Variant_NullType_AcquisitionArtifact.create(artifactMapper(it)) }
    ?: Variant_NullType_AcquisitionArtifact.create(NullType.NULL),
  accArtifact = accArtifact?.let { Variant_NullType_SensorArtifact.create(it.toBloodPressureNitro()) }
    ?: Variant_NullType_SensorArtifact.create(NullType.NULL),
  windowStartElapsedNanos = capture.windowStart?.toString().bloodPressureNullable(),
  windowEndElapsedNanos = capture.windowEnd?.toString().bloodPressureNullable(),
  stoppedAtElapsedNanos = stoppedAt?.toString().bloodPressureNullable(),
  receivedFrameCount = capture.receivedFrameCount.toDouble(),
  receivedAccCount = receivedAccCount.toDouble(),
  firstFrameTimestampNanos = capture.firstTimestamp?.toString().bloodPressureNullable(),
  lastFrameTimestampNanos = capture.lastTimestamp?.toString().bloodPressureNullable(),
  firstAccTimestampNanos = firstAccTimestamp?.toString().bloodPressureNullable(),
  lastAccTimestampNanos = lastAccTimestamp?.toString().bloodPressureNullable(),
  cameraConfigSummary = capture.configuration?.let { Variant_NullType_CameraConfigSummary.create(it.toNitro()) }
    ?: Variant_NullType_CameraConfigSummary.create(NullType.NULL),
  resourcesReleased = capture.resourcesReleased,
)

/** 保留原始传感器产物的单位、自然坐标、实采计数和注册间隔。 */
private fun ModelSensorArtifact.toBloodPressureNitro() = SensorArtifact(
  kind = when (kind) {
    ModelSensorKind.ACCELEROMETER -> SensorKind.ACCELEROMETER
    ModelSensorKind.GYROSCOPE -> SensorKind.GYROSCOPE
    ModelSensorKind.MAGNETOMETER -> SensorKind.MAGNETOMETER
    ModelSensorKind.GRAVITY -> SensorKind.GRAVITY
  },
  sessionId = sessionId,
  path = path,
  sizeBytes = sizeBytes.toDouble(),
  sampleCount = sampleCount.toDouble(),
  startedAtMillis = startedAtMillis.toDouble(),
  finishedAtMillis = finishedAtMillis.toDouble(),
  requestedSamplingPeriodMicros = requestedSamplingPeriodMicros.toDouble(),
  registeredSamplingPeriodMicros = registeredSamplingPeriodMicros.toDouble(),
  unit = unit,
  coordinateSystem = coordinateSystem,
)

/** 未知字段保留显式空分支，不用零、空串或 false 代替。 */
private fun String?.bloodPressureNullable(): Variant_NullType_String = this?.let { Variant_NullType_String.create(it) }
  ?: Variant_NullType_String.create(NullType.NULL)

private fun Double?.bloodPressureNullable(): Variant_NullType_Double = this?.let { Variant_NullType_Double.create(it) }
  ?: Variant_NullType_Double.create(NullType.NULL)

private fun Boolean?.bloodPressureNullable(): Variant_Boolean_NullType = this?.let { Variant_Boolean_NullType.create(it) }
  ?: Variant_Boolean_NullType.create(NullType.NULL)
