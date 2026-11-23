/** 定义 Android 被动 RPPG 服务、真实状态及历史视频查询契约。 */

import type { HybridObject } from 'react-native-nitro-modules'
import type { RPPGArtifact, RPPGInstantHeartRate } from './RPPG.nitro'

/** 被动采集服务的真实运行阶段。 */
export type PassiveCaptureState =
  | 'disabled'
  | 'starting'
  | 'waiting'
  | 'observing'
  | 'measuring'
  | 'stopping'
  | 'failed'

/** 描述解锁机会的最短间隔和单次正式测量时长。 */
export interface PassiveCaptureConfig {
  /** 两次相机实际交付首帧之间的最短间隔，单位秒，必须为有限正数。 */
  intervalSeconds: number
  /** 人脸就绪后正式测量时长，单位秒，必须为有限正数。 */
  measurementDurationSeconds: number
}

/** 引用升级前已完成且可读取的私有视频文件。 */
export interface PassiveVideoArtifact {
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

/** 被动服务状态、测量配置和最近一次低频采集原因。 */
export interface PassiveCaptureSnapshot {
  /** 原生服务当前阶段，不由保存的启用偏好推断。 */
  state: PassiveCaptureState
  /** 最近一次成功保存且可查询的配置。 */
  config: PassiveCaptureConfig
  /** 当前算法能形成首个频谱完整窗口所需的正式测量时长，单位秒。 */
  minimumHeartRateMeasurementSeconds: number
  /** 当前被动 RPPG 会话标识；没有会话时为空。 */
  sessionId: string | null
  /** 当前合格逐搏初步值；尚未确认、失效或会话停止时为空。 */
  latestInstantHeartRate: RPPGInstantHeartRate | null
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

/** 控制独立被动服务并查询 RPPG 结果及历史视频。 */
export interface PassiveCapture extends HybridObject<{ android: 'kotlin' }> {
  /** 查询被动服务的真实状态，不根据保存配置推断运行中。 */
  getSnapshot(): PassiveCaptureSnapshot
  /** 查询系统通知开关与既有渠道，不创建渠道或启动服务。 */
  getNotificationSettings(): PassiveCaptureNotificationSettings
  setConfig(config: PassiveCaptureConfig): Promise<PassiveCaptureCommandResult>
  enable(): Promise<PassiveCaptureCommandResult>
  disable(): Promise<PassiveCaptureCommandResult>
  /** 查询已发布的被动 RPPG 结果（v1 三件套或 v2 四件套）。 */
  listArtifacts(): Promise<RPPGArtifact[]>
  /** 查询升级前的历史视频及其真实媒体元数据。 */
  listVideoArtifacts(): Promise<PassiveVideoArtifact[]>
  addListener(listener: (snapshot: PassiveCaptureSnapshot) => void): number
  removeListener(listenerId: number): void
}
