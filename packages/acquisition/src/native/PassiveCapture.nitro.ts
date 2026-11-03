/** 定义 Android 被动录像的独立控制、低频状态与持久产物契约。 */

import type { HybridObject } from 'react-native-nitro-modules'

/** 被动采集服务的真实运行阶段。 */
export type PassiveCaptureState =
  | 'disabled'
  | 'starting'
  | 'waiting'
  | 'recording'
  | 'stopping'
  | 'failed'

/** 描述解锁机会采集的周期和单次目标时长。 */
export interface PassiveCaptureConfig {
  /** 两次实际录像开始之间的最短间隔，单位秒，必须为有限正数。 */
  intervalSeconds: number
  /** 单次目标录像时长，单位秒，必须为有限正数。 */
  durationSeconds: number
}

/** 引用一段正常完成且可读取的私有视频文件。 */
export interface PassiveCaptureArtifact {
  /** 唯一录像会话标识。 */
  sessionId: string
  /** 应用私有持久目录中的视频绝对路径。 */
  path: string
  /** 最终视频文件字节数。 */
  sizeBytes: number
  /** 媒体实际时长，单位毫秒。 */
  durationMillis: number
  /** 媒体实际宽度，单位像素。 */
  width: number
  /** 媒体实际高度，单位像素。 */
  height: number
}

/** 原生服务状态、当前配置和最近一次低频采集原因。 */
export interface PassiveCaptureSnapshot {
  /** 原生服务当前阶段，不由保存的启用偏好推断。 */
  state: PassiveCaptureState
  /** 最近一次成功保存且可查询的配置。 */
  config: PassiveCaptureConfig
  /** 当前录像会话标识；未录像时为空。 */
  sessionId: string | null
  /** 最近一次触发、跳过、完成或失败的稳定原因代码。 */
  lastReason: string | null
  /** 最近一次命令或设备失败的稳定错误码。 */
  errorCode: string | null
  /** 可直接展示的最近失败说明。 */
  errorMessage: string | null
}

/** 被动采集原生命令的结构化结果。 */
export interface PassiveCaptureCommandResult {
  /** 失败时的稳定错误码，成功时为空。 */
  errorCode: string | null
  /** 失败时的可展示说明，成功时为空。 */
  errorMessage: string | null
}

/** 通知渠道查询值；missing 表示用户尚未启用相关服务而渠道未创建。 */
export type PassiveCaptureNotificationChannelState = 'enabled' | 'disabled' | 'missing'

/** Android 被动通知设置的只读系统快照，不会创建渠道或启用服务。 */
export interface PassiveCaptureNotificationSettings {
  /** 应用级通知总开关是否允许通知。 */
  appNotificationsEnabled: boolean
  /** 既有被动通知渠道是否创建及启用。 */
  channelState: PassiveCaptureNotificationChannelState
}

/** 控制独立被动服务并查询完成视频的 Android 原生对象。 */
export interface PassiveCapture extends HybridObject<{ android: 'kotlin' }> {
  /** 查询被动服务的真实状态，不根据保存配置推断运行中。 */
  getSnapshot(): PassiveCaptureSnapshot
  /** 查询系统通知开关与既有渠道，不创建渠道或启动服务。 */
  getNotificationSettings(): PassiveCaptureNotificationSettings
  setConfig(config: PassiveCaptureConfig): Promise<PassiveCaptureCommandResult>
  enable(): Promise<PassiveCaptureCommandResult>
  disable(): Promise<PassiveCaptureCommandResult>
  listArtifacts(): Promise<PassiveCaptureArtifact[]>
  addListener(listener: (snapshot: PassiveCaptureSnapshot) => void): number
  removeListener(listenerId: number): void
}
