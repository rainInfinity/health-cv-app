/** 公开采集控制客户端及 JS 可见的低频状态与产物类型。 */

export {
  AcquisitionClient,
  AcquisitionError,
  createAcquisitionClient,
} from './client'
export type {
  AcquisitionArtifact,
  AcquisitionArtifactFile,
  AcquisitionArtifactFileKind,
  AcquisitionCommandResult,
  AcquisitionSnapshot,
  AcquisitionState,
  StopCaptureResult,
} from './native/Acquisition.nitro'
