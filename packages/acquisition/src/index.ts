/** 公开采集控制、低频事实与独立有界展示脉搏类型，不暴露原始像素或记录。 */

export {
  RPPGClient,
  RPPGError,
  createRPPGClient,
} from './rppg/client'

export type {
  RPPGArtifact,
  RPPGArtifactFile,
  RPPGArtifactFileKind,
  RPPGCommandResult,
  RPPGFailure,
  RPPGHeartRateWindow,
  RPPGInstantHeartRate,
  RPPGPhase,
  RPPGRealtimeBatch,
  RPPGSignalStatus,
  RPPGSampleCounts,
  RPPGSnapshot,
  RPPGTerminationReason,
  RPPGSource,
} from './native/RPPG.nitro'

export {
  AcquisitionClient,
  AcquisitionError,
  createAcquisitionClient,
} from './ppg/client'

export {
  PassiveCaptureClient,
  PassiveCaptureError,
  createPassiveCaptureClient,
} from './passive/client'
export {
  SensorCaptureError,
  SensorClient,
  createSensorClient,
} from './sensors/client'
export type {
  AcquisitionArtifact,
  AcquisitionArtifactFile,
  AcquisitionArtifactFileKind,
  AcquisitionCommandResult,
  AcquisitionSnapshot,
  AcquisitionState,
  FingertipCaptureConfig,
  FingertipCoverageState,
  FingertipPhase,
  FingertipPulseBatch,
  FingertipSnapshot,
  FingertipStartResult,
  StopCaptureResult,
} from './native/Acquisition.nitro'

export type {
  CameraBlockLayout,
  CameraBooleanCapability,
  CameraCaptureOption,
  CameraCaptureOptions,
  CameraCaptureOptionsRequest,
  CameraCapabilities,
  CameraCapabilityStatus,
  CameraConfig,
  CameraConfigAdjustment,
  CameraConfigSummary,
  CameraDescriptor,
  CameraExposureConfig,
  CameraExposureMode,
  CameraFacing,
  CameraFocusConfig,
  CameraFocusMode,
  CameraFrameCrop,
  CameraFrameGeometry,
  CameraFpsRange,
  CameraLockPhase,
  CameraLockStatus,
  CameraModeCapability,
  CameraNumberRange,
  CameraNumericCapability,
  CameraProcessingConfig,
  CameraProcessingLimits,
  CameraRational,
  CameraResolution,
  CameraWhiteBalanceConfig,
  CameraWhiteBalanceMode,
} from './native/Acquisition.nitro'

export type {
  PassiveCaptureConfig,
  PassiveCaptureNotificationChannelState,
  PassiveCaptureNotificationSettings,
  PassiveCaptureSnapshot,
  PassiveCaptureState,
  PassiveVideoArtifact,
} from './native/PassiveCapture.nitro'
export type {
  SensorArtifact,
  SensorCapabilities,
  SensorCaptureCommandResult,
  SensorCaptureConfig,
  SensorCapturePhase,
  SensorKind,
  SensorSnapshot,
  SensorStopCaptureResult,
} from './native/SensorCapture.nitro'
