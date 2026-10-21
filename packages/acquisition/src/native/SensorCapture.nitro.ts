/** 定义仅向 JavaScript 暴露低频传感器控制、状态和完成文件引用的 Nitro 协议。 */

import type { HybridObject } from 'react-native-nitro-modules'

/** 首批支持的 Android 默认运动传感器类型。 */
export type SensorKind = 'accelerometer' | 'gyroscope' | 'magnetometer' | 'gravity'

/** 单个传感器控制器的低频运行阶段。 */
export type SensorCapturePhase = 'idle' | 'starting' | 'capturing' | 'stopping' | 'failed'

/** 请求单一传感器采集时使用的显式微秒参数。 */
export interface SensorCaptureConfig {
  /** 请求采样间隔，整数微秒，范围为 5,000–1,000,000。 */
  samplingPeriodMicros: number
}

/** 描述一种默认设备传感器的实际可用能力。 */
export interface SensorCapabilities {
  /** 查询对应的传感器类型。 */
  kind: SensorKind
  /** 当前设备是否提供该类型的默认传感器。 */
  available: boolean
  /** 可用时的 Android 设备名称；不可用时为空。 */
  deviceName: string | null
  /** 可用时设备报告的最小采样间隔，单位微秒；不可用时为空。 */
  minSamplingPeriodMicros: number | null
}

/** 引用一份已关闭并提升为完成路径的传感器 CSV。 */
export interface SensorArtifact {
  /** 该文件所属的传感器类型。 */
  kind: SensorKind
  /** 唯一采集会话标识。 */
  sessionId: string
  /** 应用私有持久目录中的已完成 CSV 路径。 */
  path: string
  /** 已关闭文件的字节数。 */
  sizeBytes: number
  /** 实际成功写入的样本行数，不按请求频率推算。 */
  sampleCount: number
  /** 本会话开始时的单调时间，单位毫秒。 */
  startedAtMillis: number
  /** 本会话完成时的单调时间，单位毫秒。 */
  finishedAtMillis: number
  /** 调用方请求的采样间隔，单位微秒。 */
  requestedSamplingPeriodMicros: number
  /** 实际传给 Android 注册接口的间隔，单位微秒。 */
  registeredSamplingPeriodMicros: number
  /** 三轴样本的物理单位标识。 */
  unit: string
  /** 三轴值采用的坐标系标识。 */
  coordinateSystem: string
}

/** 描述一个传感器控制器的低频状态快照。 */
export interface SensorSnapshot {
  /** 当前状态所对应的传感器类型。 */
  kind: SensorKind
  /** 原生控制器当前阶段。 */
  phase: SensorCapturePhase
  /** 活动或最近一次会话标识；尚未创建时为空。 */
  sessionId: string | null
  /** 最近一次请求间隔，单位微秒；无会话时为空。 */
  requestedSamplingPeriodMicros: number | null
  /** 最近一次实际注册间隔，单位微秒；无会话时为空。 */
  registeredSamplingPeriodMicros: number | null
  /** 最近一次操作的稳定错误码；无错误时为空。 */
  errorCode: string | null
  /** 最近一次操作的可读错误说明；无错误时为空。 */
  errorMessage: string | null
  /** 最近一次正常完成的本类型文件引用；无产物时为空。 */
  lastArtifact: SensorArtifact | null
}

/** 原生传感器命令的结构化结果；成功时错误字段均为空。 */
export interface SensorCaptureCommandResult {
  /** 失败时提供稳定错误码；成功时为空。 */
  errorCode: string | null
  /** 失败时提供可读说明；成功时为空。 */
  errorMessage: string | null
}

/** 停止命令返回的结构化结果及已完成产物。 */
export interface SensorStopCaptureResult extends SensorCaptureCommandResult {
  /** 正常停止后已关闭的产物；失败时为空。 */
  artifact: SensorArtifact | null
}

/** 实现 Android 传感器能力查询、逐类型控制和低频状态通知的原生对象。 */
export interface SensorCapture extends HybridObject<{ android: 'kotlin' }> {
  getCapabilities(kind: string): Promise<SensorCapabilities>
  getSnapshot(kind: string): SensorSnapshot
  startCapture(kind: string, samplingPeriodMicros: number): Promise<SensorCaptureCommandResult>
  stopCapture(kind: string): Promise<SensorStopCaptureResult>
  listArtifacts(kind: string): Promise<SensorArtifact[]>
  addListener(kind: string, listener: (snapshot: SensorSnapshot) => void): number
  removeListener(kind: string, listenerId: number): void
}
