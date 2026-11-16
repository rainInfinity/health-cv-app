/** 定义共用主动与被动 RPPG 状态、产物和有界波形契约。 */

import type { HybridObject } from 'react-native-nitro-modules'

/** 主动会话的可观察阶段。 */
export type RPPGPhase =
  | 'closed'
  | 'opening'
  | 'preview'
  | 'observing'
  | 'measuring'
  | 'stopping'
  | 'completed'
  | 'failed'

/** 正常结束原因；技术失败另由错误字段表达。 */
export type RPPGTerminationReason =
  | 'target_duration'
  | 'user_stop'
  | 'page_left'
  | 'app_background'
  | 'observation_timeout'
  | 'interrupted'

/** 最终可解释的信号结论，不代表医学有效性。 */
export type RPPGSignalStatus = 'valid_heart_rate' | 'no_valid_heart_rate' | 'no_waveform'

/** 标记已发布 RPPG 结果的采集来源。 */
export type RPPGSource = 'active' | 'passive'

/** 三件套中的文件类型。 */
export type RPPGArtifactFileKind = 'session' | 'pulse' | 'heart-rate'

/** 引用已关闭并发布的会话文件。 */
export interface RPPGArtifactFile {
  /** 文件用途。 */
  kind: RPPGArtifactFileKind
  /** 新产物位于应用专属外部目录；已有内部产物保留原绝对路径。 */
  path: string
  /** 已发布文件大小，单位字节。 */
  sizeBytes: number
}
/** 保存已发布会话中实际写入的波形和心率窗口数量。 */
export interface RPPGSampleCounts {
  /** pulse.csv 中的样本行数。 */
  pulseSamples: number
  /** hr.csv 中的窗口行数。 */
  heartRateWindows: number
  /** 通过信号质量检查的心率窗口数。 */
  validHeartRateWindows: number
  /** 未通过信号质量检查的心率窗口数。 */
  rejectedHeartRateWindows: number
}

/** 保存可跨原生边界展示的稳定错误。 */
export interface RPPGFailure {
  /** 稳定错误码。 */
  code: string
  /** 可展示错误说明。 */
  message: string
}

/** 引用已原子发布的主动或被动会话及其可追溯质量结论。 */
export interface RPPGArtifact {
  /** 唯一会话标识。 */
  sessionId: string
  /** 结果来源；active 为主动测量，passive 为后台被动采集。 */
  source: RPPGSource
  /** 正常结束原因；技术失败不会发布为完成产物。 */
  termination: RPPGTerminationReason
  /** 最终信号质量结论，不代表医学有效性。 */
  signalStatus: RPPGSignalStatus
  /** 文件中实际写入的波形与心率窗口数量。 */
  sampleCounts: RPPGSampleCounts
  /** 按元信息、脉搏和心率顺序排列的文件。 */
  files: RPPGArtifactFile[]
}

/** 保存一个已评估心率窗口及其拒绝原因。 */
export interface RPPGHeartRateWindow {
  /** 连续信号片段序号。 */
  segmentIndex: number
  /** 首个样本的传感器绝对时间，十进制纳秒字符串。 */
  windowStartNanos: string
  /** 末个样本的传感器绝对时间，十进制纳秒字符串。 */
  windowEndNanos: string
  /** 有效心率，单位 bpm；无效窗口为空。 */
  heartRateBpm: number | null
  /** 是否通过质量检查。 */
  valid: boolean
  /** 稳定拒绝原因；有效窗口为空。 */
  reason: string | null
  /** 频谱信噪比，单位 dB；无法计算时为空。 */
  spectralSnrDb: number | null
}

/** 描述当前合格的逐搏初步心率；不替代频谱窗口或医学结果。 */
export interface RPPGInstantHeartRate {
  /** 连续信号片段序号。 */
  segmentIndex: number
  /** 前一个可信峰的传感器采集时间，十进制纳秒字符串。 */
  previousPeakTimestampNanos: string
  /** 当前可信峰的传感器采集时间，十进制纳秒字符串。 */
  peakTimestampNanos: string
  /** 两峰的采集时间间隔，十进制纳秒字符串。 */
  intervalNanos: string
  /** 最新合格搏间间隔对应的初步心率，单位 bpm，不是间隔平均值。 */
  heartRateBpm: number
}

/** 描述一份同片段、可检测漏批的有界实时脉搏批次。 */
export interface RPPGRealtimeBatch {
  /** 所属会话。 */
  sessionId: string
  /** 连续信号片段序号。 */
  segmentIndex: number
  /** 会话内递增批次序号；缺号表示订阅队列丢批。 */
  sequence: number
  /** 首个样本相对传感器原点的采集时间，单位毫秒。 */
  startTimeMs: number
  /** 批内样本间隔，单位毫秒。 */
  sampleIntervalMs: number
  /** 脉搏幅值，任意单位；与定稿文件同源。 */
  values: number[]
}

/** 原生会话的低频状态快照。 */
export interface RPPGSnapshot {
  /** 当前主动会话阶段。 */
  phase: RPPGPhase
  /** 正式会话标识；预览阶段为空。 */
  sessionId: string | null
  /** 最近一帧是否满足连续就绪条件。 */
  faceReady: boolean
  /** 最近一次低频报告的人脸就绪原因。 */
  readinessReason: string | null
  /** 最近报告的连续就绪时长，单位纳秒字符串。 */
  readinessContinuousNanos: string
  /** 测量单调时钟原点，单位纳秒字符串；未开始时为空。 */
  measurementStartedAtElapsedNanos: string | null
  /** 目标测量时长，单位纳秒字符串。 */
  targetMeasurementDurationNanos: string
  /** 最近一次心率窗口；没有评估结果时为空。 */
  latestHeartRate: RPPGHeartRateWindow | null
  /** 当前合格逐搏初步值；尚未确认、失效或会话停止时为空。 */
  latestInstantHeartRate: RPPGInstantHeartRate | null
  /** 结束时的信号结论；未完成或技术失败时为空。 */
  signalStatus: RPPGSignalStatus | null
  /** 正常结束原因；技术失败时为空。 */
  termination: RPPGTerminationReason | null
  /** 成功原子发布的三件套；未发布时为空。 */
  artifact: RPPGArtifact | null
  /** 最近一次会话级技术错误；正常状态为空。 */
  error: RPPGFailure | null
}

/** 原生会话命令的结构化结果。 */
export interface RPPGCommandResult {
  /** 命令是否接受并完成。 */
  accepted: boolean
  /** 命令返回时的权威状态快照。 */
  snapshot: RPPGSnapshot
  /** 成功结束后返回的产物；尚无正式首帧或失败时为空。 */
  artifact: RPPGArtifact | null
  /** 稳定错误码；成功时为空。 */
  errorCode: string | null
  /** 可展示错误说明；成功时为空。 */
  errorMessage: string | null
}

/** 控制主动前摄会话、订阅有界实时脉搏并查询完整本地产物。 */
export interface RPPG extends HybridObject<{ android: 'kotlin' }> {
  /** 读取原生状态，不打开相机或创建会话。 */
  getSnapshot(): RPPGSnapshot
  /** 显式取得相机并打开仅用于预览的原生帧代次。 */
  openPreview(): Promise<RPPGCommandResult>
  /** 显式开始新正式观察代次；预览帧不会进入算法或产物。 */
  start(): Promise<RPPGCommandResult>
  /** 用户停止并等待相机、算法和完整文件队列收尾。 */
  stop(): Promise<RPPGCommandResult>
  /** 页面离开时收尾并关闭本 runtime。 */
  close(): Promise<RPPGCommandResult>
  /** 查询外部及已有内部目录中已发布的主动 RPPG 三件套。 */
  listArtifacts(): Promise<RPPGArtifact[]>
  /** 订阅低频状态快照并返回独立监听标识。 */
  addListener(listener: (snapshot: RPPGSnapshot) => void): number
  /** 解除指定状态订阅。 */
  removeListener(listenerId: number): void
  /** 订阅有界、与完整脉搏文件同源的实时批次。 */
  addRealtimeListener(listener: (batch: RPPGRealtimeBatch) => void): number
  /** 解除指定实时批次订阅。 */
  removeRealtimeListener(listenerId: number): void
}
