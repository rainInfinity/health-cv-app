/** 定义仅向 JS 暴露低频采集控制与状态的 Nitro 契约。 */

import type { HybridObject } from 'react-native-nitro-modules'

/** Android 相机与采集会话的可观察阶段。 */
export type AcquisitionState =
  | 'closed'
  | 'opening'
  | 'preview'
  | 'capturing'
  | 'stopping'
  | 'closing'
  | 'failed'

/** 描述完成会话中的 PPG 或逐帧元数据文件类型。 */
export type AcquisitionArtifactFileKind = 'ppg' | 'frame'

/** 引用一份已关闭且属于完成会话的 CSV 文件。 */
export interface AcquisitionArtifactFile {
  /** 文件用途；PPG 样本或相机逐帧拍摄结果。 */
  kind: AcquisitionArtifactFileKind
  /** 应用私有持久目录中的文件路径。 */
  path: string
  /** 已关闭文件的字节数。 */
  sizeBytes: number
}

/** 正常停止后可查询的应用私有会话文件引用。 */
export interface AcquisitionArtifact {
  /** 唯一采集会话标识。 */
  sessionId: string
  /** 按 PPG、逐帧元数据顺序列出的完成文件引用。 */
  files: AcquisitionArtifactFile[]
  /** 采集开始时的单调时间，单位毫秒。 */
  startedAtMillis: number
  /** 文件关闭时的单调时间，单位毫秒。 */
  finishedAtMillis: number
}

/** 原生相机与最近采集会话的低频状态快照。 */
export interface AcquisitionSnapshot {
  /** 当前后置相机与采集会话阶段。 */
  state: AcquisitionState
  /** 当前相机或正式采集会话标识；尚未建立时为空。 */
  sessionId: string | null
  /** 最近命令或设备失败的稳定错误码。 */
  errorCode: string | null
  /** 可直接展示的最近失败说明。 */
  errorMessage: string | null
  /** CameraX 实际交付帧宽度，单位像素；尚未收到帧时为 0。 */
  cameraWidth: number
  /** CameraX 实际交付帧高度，单位像素；尚未收到帧时为 0。 */
  cameraHeight: number
  /** 最近测量窗口内的实际分析帧率，单位帧／秒。 */
  framesPerSecond: number
  /** 后置相机是否报告具备补光灯硬件。 */
  torchAvailable: boolean
  /** 尚无有效像素统计时为空；否则表示光线经验提示是否触发。 */
  showSurroundingTip: boolean | null
  /** 尚无有效像素统计时为空；否则表示遮挡经验提示是否触发。 */
  showCoveringTip: boolean | null
  /** 最近一次正常停止并关闭文件后的产物引用。 */
  lastArtifact: AcquisitionArtifact | null
}

/** Nitro 控制命令的结构化结果；成功时错误字段均为空。 */
export interface AcquisitionCommandResult {
  /** 失败时提供稳定错误码，成功时为空。 */
  errorCode: string | null
  /** 失败时提供可展示说明，成功时为空。 */
  errorMessage: string | null
}

/** 停止命令返回的结构化结果及已完成文件引用。 */
export interface StopCaptureResult extends AcquisitionCommandResult {
  /** 正常停止后已关闭的产物；失败时为空。 */
  artifact: AcquisitionArtifact | null
}

/** 实现 Android 后摄生命周期、会话控制和低频通知的原生对象。 */
export interface Acquisition extends HybridObject<{ android: 'kotlin' }> {
  getSnapshot(): AcquisitionSnapshot
  openCamera(): Promise<AcquisitionCommandResult>
  startCapture(): Promise<AcquisitionCommandResult>
  stopCapture(): Promise<StopCaptureResult>
  closeCamera(): Promise<AcquisitionCommandResult>
  listArtifacts(): Promise<AcquisitionArtifact[]>
  addListener(listener: (snapshot: AcquisitionSnapshot) => void): number
  removeListener(listenerId: number): void
}
