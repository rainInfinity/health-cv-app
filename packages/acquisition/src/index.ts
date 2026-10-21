/** 公开采集控制客户端及 JS 可见的低频状态与产物类型。 */

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
  StopCaptureResult,
} from './native/Acquisition.nitro'

export type {
  PassiveCaptureArtifact,
  PassiveCaptureConfig,
  PassiveCaptureSnapshot,
  PassiveCaptureState,
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
