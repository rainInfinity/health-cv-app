/** 定义采集控制、低频事实及指尖有界展示脉搏例外的 Nitro 契约。 */

import type { HybridObject } from 'react-native-nitro-modules'
import type { SensorArtifact } from './SensorCapture.nitro'

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
  /** 应用专属外部持久目录中的文件绝对路径。 */
  path: string
  /** 已关闭文件的字节数。 */
  sizeBytes: number
}

/** 正常停止后可查询的应用专属外部会话文件引用。 */
export interface AcquisitionArtifact {
  /** 唯一采集会话标识。 */
  sessionId: string
  /** 按 PPG、逐帧元数据顺序列出的完成文件引用。 */
  files: AcquisitionArtifactFile[]
  /** 完成本次会话时的请求、提交、协商原因与实际帧摘要；合成测试会话可为空。 */
  cameraConfigSummary: CameraConfigSummary | null
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
  /** 当前相机打开周期的请求、提交和实际帧摘要；未打开时为空。 */
  cameraConfig: CameraConfigSummary | null
  /** 当前周期 AE／AWB 自动算法锁定状态。 */
  cameraLockStatus: CameraLockStatus
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

/** 当前设备相机相对于设备机身的朝向。 */
export type CameraFacing = 'back' | 'front' | 'external' | 'unknown'

/** 查询到的能力状态；未知与明确不支持必须区分。 */
export type CameraCapabilityStatus = 'supported' | 'unsupported' | 'permission-required' | 'unknown'

/** 主动采集的曝光模式。 */
export type CameraExposureMode = 'auto' | 'manual'

/** 可请求的白平衡语义模式，不表示设备支持全部选项。 */
export type CameraWhiteBalanceMode =
  | 'auto'
  | 'off'
  | 'incandescent'
  | 'fluorescent'
  | 'warm-fluorescent'
  | 'daylight'
  | 'cloudy-daylight'
  | 'twilight'
  | 'shade'

/** 主动采集的对焦控制语义。 */
export type CameraFocusMode = 'auto' | 'off' | 'manual'

/** 表示一个不假设跨设备含义的逻辑相机。 */
export interface CameraDescriptor {
  /** 当前设备枚举得到的稳定相机标识。 */
  cameraId: string
  /** 相机相对于设备机身的朝向。 */
  facing: CameraFacing
  /** 传感器安装方向角度；设备未提供时为空。 */
  sensorOrientationDegrees: number | null
}

/** 表示一个有理数，常用于相机能力的步长。 */
export interface CameraRational {
  /** 分子。 */
  numerator: number
  /** 正分母。 */
  denominator: number
}

/** 表示参数的设备最小值、最大值及可选步长。 */
export interface CameraNumberRange {
  /** 设备报告的最小值。 */
  minimum: number
  /** 设备报告的最大值。 */
  maximum: number
  /** 设备报告的量化步长；无数据时为空。 */
  step: CameraRational | null
}

/** 表示一个可能受权限限制的数值能力。 */
export interface CameraNumericCapability {
  /** 支持状态；unknown 不可解释为 unsupported。 */
  status: CameraCapabilityStatus
  /** 已知范围；状态不是 supported 或范围缺失时为空。 */
  range: CameraNumberRange | null
  /** 查询受限或未知时的说明；没有说明时为空。 */
  reason: string | null
}

/** 表示设备实际提供的模式选项及其查询状态。 */
export interface CameraModeCapability {
  /** 支持状态。 */
  status: CameraCapabilityStatus
  /** 设备明确支持的语义模式；无法读取时为空。 */
  modes: string[] | null
  /** 能力已部分读取但该模式支持状态仍未知的语义名称。 */
  unknownModes: string[]
  /** 查询受限或未知时的说明；没有说明时为空。 */
  reason: string | null
}

/** 表示布尔型硬件或锁定能力。 */
export interface CameraBooleanCapability {
  /** 支持状态。 */
  status: CameraCapabilityStatus
  /** 已知能力值；不能查询时为空。 */
  value: boolean | null
  /** 查询受限或未知时的说明；没有说明时为空。 */
  reason: string | null
}

/** 汇总指定逻辑相机可查询的主动采集参数能力。 */
export interface CameraCapabilities {
  /** 能力所属的相机标识。 */
  cameraId: string
  /** 自动或手动曝光模式能力。 */
  exposureModes: CameraModeCapability
  /** 手动曝光时间范围，单位纳秒。 */
  exposureTimeNanos: CameraNumericCapability
  /** 手动感光度范围，单位 ISO。 */
  iso: CameraNumericCapability
  /** 自动曝光补偿索引范围及 EV 有理数步长。 */
  exposureCompensationIndex: CameraNumericCapability
  /** 白平衡模式能力。 */
  whiteBalanceModes: CameraModeCapability
  /** 对焦模式能力。 */
  focusModes: CameraModeCapability
  /** 手动对焦距离范围，单位屈光度；0 表示无穷远。 */
  focusDistanceDiopters: CameraNumericCapability
  /** 补光灯能力。 */
  torch: CameraBooleanCapability
  /** 自动曝光锁定能力。 */
  aeLock: CameraBooleanCapability
  /** 自动白平衡锁定能力。 */
  awbLock: CameraBooleanCapability
}

/** 表示像素尺寸；宽高均为正整数。 */
export interface CameraResolution {
  /** 水平像素数。 */
  width: number
  /** 垂直像素数。 */
  height: number
}

/** 表示设备报告的帧率范围，单位帧／秒。 */
export interface CameraFpsRange {
  /** 最小帧率。 */
  minimum: number
  /** 最大帧率。 */
  maximum: number
}

/** 表示一个按 Preview 与 YUV 分析组合查询的候选项。 */
export interface CameraCaptureOption {
  /** 候选分析尺寸。 */
  resolution: CameraResolution
  /** 设备报告的可选帧率范围；未知时为空。 */
  fpsRanges: CameraFpsRange[] | null
  /** Preview 与分析组合的兼容性状态。 */
  compatibility: CameraCapabilityStatus
  /** 不兼容或无法确认时的说明。 */
  reason: string | null
}

/** 查询组合尺寸与帧率选项时使用的偏好值。 */
export interface CameraCaptureOptionsRequest {
  /** 目标尺寸偏好；未指定时为空。 */
  targetResolution: CameraResolution | null
  /** 目标帧率偏好，单位帧／秒；未指定时为空。 */
  targetFps: number | null
}

/** 表示本地处理器允许的有限分块范围。 */
export interface CameraProcessingLimits {
  /** 单帧允许的最大块数。 */
  maxBlockCount: number
  /** 实际宽度约束下允许的最大列数。 */
  maxColumns: number
  /** 实际高度约束下允许的最大行数。 */
  maxRows: number
}

/** 返回所选相机当前可查询的组合选项与处理限制。 */
export interface CameraCaptureOptions {
  /** 选项所属的相机标识。 */
  cameraId: string
  /** Preview 与 YUV 分析组合的候选配置。 */
  options: CameraCaptureOption[]
  /** 本地分块限制，不代表相机硬件能力。 */
  processing: CameraProcessingLimits
}

/** 表示实际使用的二维网格，编号按行优先排列。 */
export interface CameraBlockLayout {
  /** 网格行数。 */
  rows: number
  /** 网格列数。 */
  columns: number
}

/** 完整的主动相机请求配置；运行周期内不可变。 */
export interface CameraConfig {
  /** 必须来自当前设备枚举的逻辑相机标识。 */
  cameraId: string
  /** 期望的分析尺寸；实际值可能经明确协商。 */
  targetResolution: CameraResolution
  /** 期望帧率，单位帧／秒；不是实际帧率保证。 */
  targetFps: number
  /** 是否明确请求开启补光灯。 */
  torchEnabled: boolean
  /** 曝光控制配置。 */
  exposure: CameraExposureConfig
  /** 白平衡控制配置。 */
  whiteBalance: CameraWhiteBalanceConfig
  /** 对焦控制配置。 */
  focus: CameraFocusConfig
  /** 图像处理配置。 */
  processing: CameraProcessingConfig
}

/** 自动或手动曝光参数；不适用字段必须为空。 */
export interface CameraExposureConfig {
  /** 曝光模式。 */
  mode: CameraExposureMode
  /** 自动曝光补偿索引；手动模式必须为空。 */
  compensationIndex: number | null
  /** 手动曝光时间，单位纳秒；自动模式必须为空。 */
  timeNanos: number | null
  /** 手动感光度 ISO；自动模式必须为空。 */
  iso: number | null
  /** 是否在每次正式采集开始前请求 AE 锁定。 */
  locked: boolean
}

/** 白平衡模式与自动算法锁定请求。 */
export interface CameraWhiteBalanceConfig {
  /** 白平衡模式。 */
  mode: CameraWhiteBalanceMode
  /** 仅自动白平衡允许请求锁定。 */
  locked: boolean
}

/** 对焦模式与手动距离请求。 */
export interface CameraFocusConfig {
  /** 对焦模式。 */
  mode: CameraFocusMode
  /** 手动对焦距离，单位屈光度；非手动模式必须为空。 */
  distanceDiopters: number | null
}

/** 图像处理设置；blocks 必须恰有两个正整数 [rows, columns]。 */
export interface CameraProcessingConfig {
  /** 分块网格，按 [行数, 列数] 解释。 */
  blocks: number[]
}

/** 记录尺寸／帧率协商时请求值与提交值的差异。 */
export interface CameraConfigAdjustment {
  /** 被调整的配置字段路径。 */
  field: string
  /** 原始请求值的可读表示。 */
  requestedValue: string
  /** 实际提交值的可读表示。 */
  submittedValue: string
  /** 设备或组合查询导致调整的原因。 */
  reason: string
}

/** 描述相机实际交付图像中的有效裁剪矩形。 */
export interface CameraFrameCrop {
  /** 有效区域左边界，坐标相对于完整帧。 */
  left: number
  /** 有效区域上边界，坐标相对于完整帧。 */
  top: number
  /** 有效区域宽度，单位像素。 */
  width: number
  /** 有效区域高度，单位像素。 */
  height: number
}

/** 描述相机实际有效区域及原生图像方向语义。 */
export interface CameraFrameGeometry {
  /** 实际交付帧宽度，单位像素。 */
  width: number
  /** 实际交付帧高度，单位像素。 */
  height: number
  /** 有效区域左上角及尺寸，坐标相对于交付帧。 */
  crop: CameraFrameCrop
  /** 传感器安装方向角度；不可用时为空。 */
  sensorOrientationDegrees: number | null
  /** 原生分析帧是否镜像。 */
  mirrored: boolean
}

/** 汇总请求配置、提交配置、协商原因与实际采集几何。 */
export interface CameraConfigSummary {
  /** 本周期绑定的相机标识。 */
  cameraId: string
  /** 调用方提交的原始配置。 */
  requestedConfig: CameraConfig
  /** 原生实际提交给相机用例的配置。 */
  submittedConfig: CameraConfig
  /** 尺寸或帧率的明确调整原因。 */
  adjustments: CameraConfigAdjustment[]
  /** 首帧到达后得到的真实帧几何；尚未到达时为空。 */
  actualFrame: CameraFrameGeometry | null
  /** 观测到的实际帧率；尚无测量窗口时为空。 */
  observedFps: number | null
  /** 实际处理分块布局。 */
  blockLayout: CameraBlockLayout
}

/** 自动算法锁定的低频阶段。 */
export type CameraLockPhase = 'not-requested' | 'applying' | 'locked' | 'released' | 'failed'

/** 表示当前相机周期内 AE／AWB 锁定确认状态。 */
export interface CameraLockStatus {
  /** 当前锁定阶段。 */
  phase: CameraLockPhase
  /** 最近拍摄结果确认的 AE 锁状态；未知时为空。 */
  aeLocked: boolean | null
  /** 最近拍摄结果确认的 AWB 锁状态；未知时为空。 */
  awbLocked: boolean | null
  /** 锁定失败时的稳定错误码。 */
  errorCode: string | null
  /** 锁定失败时的可读说明。 */
  errorMessage: string | null
}

/** 指尖轮次的原生阶段；正式窗口不含观测与准备。 */
export type FingertipPhase = 'observing' | 'starting' | 'capturing' | 'stopping' | 'completed' | 'interrupted' | 'failed'

/** 指尖有效取景区域的空间覆盖状态。 */
export type FingertipCoverageState = 'unknown' | 'uncovered' | 'partial' | 'complete'

/** 指尖正式窗口配置。 */
export interface FingertipCaptureConfig {
  /** 正式采集目标时长，单位毫秒。 */
  durationMillis: number
}

/** 一轮指尖采集的低频事实；绝对纳秒使用十进制字符串。 */
export interface FingertipSnapshot {
  /** 本轮唯一标识。 */
  captureId: string
  /** 正式 PPG 会话标识，观测期间为空。 */
  sessionId: string | null
  /** 当前原生阶段。 */
  phase: FingertipPhase
  /** ROI 空间覆盖估计；无有效输入时为空。 */
  coveragePercent: number | null
  /** 空间覆盖分类。 */
  coverageState: FingertipCoverageState
  /** 原生连续稳定且新鲜的就绪事实。 */
  coverageReady: boolean
  /** 正式目标时长，单位毫秒。 */
  targetDurationMillis: number
  /** 正式窗口已用时长，单位毫秒。 */
  elapsedMillis: number
  /** 正式窗口剩余时长，单位毫秒。 */
  remainingMillis: number
  /** 本轮真实结束原因。 */
  endReason: string | null
  /** 稳定错误码。 */
  errorCode: string | null
  /** 可展示的错误说明。 */
  errorMessage: string | null
  /** 本轮已定稿文件，与资源释放事实独立。 */
  artifact: AcquisitionArtifact | null
  /** 正式入口单调窗口下界，单位纳秒。 */
  windowStartElapsedNanos: string | null
  /** 正式入口单调窗口上界，单位纳秒。 */
  windowEndElapsedNanos: string | null
  /** 正式窗口接收的真实帧数。 */
  receivedFrameCount: number
  /** 首帧相机采样时间，单位纳秒。 */
  firstFrameTimestampNanos: string | null
  /** 末帧相机采样时间，单位纳秒。 */
  lastFrameTimestampNanos: string | null
  /** 本轮冻结配置及实际帧摘要。 */
  cameraConfigSummary: CameraConfigSummary | null
  /** 相机与补光资源是否已经释放。 */
  resourcesReleased: boolean
}

/** 指尖观测轮次建立结果，不等待正式窗口结束。 */
export interface FingertipStartResult extends AcquisitionCommandResult {
  /** 成功建立的轮次标识；失败时为空。 */
  captureId: string | null
}

/** 独立于文件保存的有界真实展示脉搏批次。 */
export interface FingertipPulseBatch {
  /** 本轮标识，用于拒绝迟到批次。 */
  captureId: string
  /** 来源正式 PPG 会话标识。 */
  sessionId: string
  /** 连续有效信号片段标识。 */
  segmentId: number
  /** 递增批次序号，缺号表示展示丢批。 */
  sequence: number
  /** 相对本轮正式首帧的真实毫秒时间，最多 64 点。 */
  timesMillis: number[]
  /** 与时间逐项对应的任意单位真实幅值。 */
  values: number[]
}

/** 血压双阶段观测与联合采集阶段。 */
export type BloodPressurePhase = 'observing_finger' | 'awaiting_chest' | 'starting' | 'capturing' | 'stopping' | 'completed' | 'interrupted' | 'failed'

/** 血压正式窗口配置；观测和准备不扣除此时长。 */
export interface BloodPressureCaptureConfig {
  /** 目标正式时长，单位毫秒。 */
  durationMillis: number
}

/** 血压同轮低频事实；绝对纳秒为十进制字符串，未知判定为空。 */
export interface BloodPressureSnapshot {
  /** 覆盖观测时建立的本轮标识。 */
  captureId: string
  /** 正式 PPG 会话，尚未开窗时为空。 */
  sessionId: string | null
  /** 本轮 ACC 会话身份。 */
  accSessionId: string | null
  /** 原生阶段，不由分页推进。 */
  phase: BloodPressurePhase
  /** 真实空间覆盖百分比，无有效输入时为空。 */
  coveragePercent: number | null
  /** 真实空间覆盖分类。 */
  coverageState: FingertipCoverageState
  /** 完整覆盖连续三秒且输入新鲜。 */
  coverageReady: boolean
  /** 屏幕相对水平面夹角，范围 0–90 度。 */
  tiltDegrees: number | null
  /** 当前持机稳定性，未评估或失鲜时为空。 */
  stable: boolean | null
  /** 持续观测的心震工程候选，未评估或带宽不足时为空。 */
  scgCandidate: boolean | null
  /** 正式目标时长，单位毫秒。 */
  targetDurationMillis: number
  /** 原生正式经过时长，单位毫秒。 */
  elapsedMillis: number
  /** 原生正式剩余时长，单位毫秒。 */
  remainingMillis: number
  /** 本轮真实结束原因。 */
  endReason: string | null
  /** 本轮技术或当前释放错误码。 */
  errorCode: string | null
  /** 本轮错误说明。 */
  errorMessage: string | null
  /** 本轮已定稿 PPG 双 CSV，与释放状态独立。 */
  artifact: AcquisitionArtifact | null
  /** 本轮已定稿原始 ACC 文件，不从历史列表补齐。 */
  accArtifact: SensorArtifact | null
  /** 共同接收窗口原生单调下界，单位纳秒。 */
  windowStartElapsedNanos: string | null
  /** 计划接收窗口上界，单位纳秒。 */
  windowEndElapsedNanos: string | null
  /** 实际封闭正式入口的时刻，单位纳秒。 */
  stoppedAtElapsedNanos: string | null
  /** 正式精确配对帧数。 */
  receivedFrameCount: number
  /** 正式 ACC 实际接收记录数。 */
  receivedAccCount: number
  /** 首帧原始相机采样时间，单位纳秒。 */
  firstFrameTimestampNanos: string | null
  /** 末帧原始相机采样时间，单位纳秒。 */
  lastFrameTimestampNanos: string | null
  /** 首条原始 ACC 事件时间，单位纳秒。 */
  firstAccTimestampNanos: string | null
  /** 末条原始 ACC 事件时间，单位纳秒。 */
  lastAccTimestampNanos: string | null
  /** 本轮冻结相机配置及实际几何。 */
  cameraConfigSummary: CameraConfigSummary | null
  /** 本轮相机、补光及两个 IMU 监听均已释放。 */
  resourcesReleased: boolean
}

/** 血压观测轮次建立结果，不等待采满。 */
export interface BloodPressureStartResult extends AcquisitionCommandResult {
  /** 成功轮次标识；失败时为空。 */
  captureId: string | null
}

/** 实现 Android 后摄生命周期、会话控制和低频通知的原生对象。 */
export interface Acquisition extends HybridObject<{ android: 'kotlin' }> {
  getSnapshot(): AcquisitionSnapshot

  listCameras(): Promise<CameraDescriptor[]>
  getCameraCapabilities(cameraId: string): Promise<CameraCapabilities>
  getSupportedCaptureOptions(
    cameraId: string,
    request: CameraCaptureOptionsRequest,
  ): Promise<CameraCaptureOptions>
  openCamera(config: CameraConfig): Promise<AcquisitionCommandResult>
  startCapture(): Promise<AcquisitionCommandResult>
  stopCapture(): Promise<StopCaptureResult>
  closeCamera(): Promise<AcquisitionCommandResult>
  startFingertipCapture(config: FingertipCaptureConfig): Promise<FingertipStartResult>
  getFingertipSnapshot(): FingertipSnapshot | null
  stopFingertipCapture(captureId: string): Promise<AcquisitionCommandResult>
  addFingertipListener(listener: (snapshot: FingertipSnapshot | null) => void): number
  removeFingertipListener(listenerId: number): void
  addFingertipPulseListener(listener: (batch: FingertipPulseBatch) => void): number
  removeFingertipPulseListener(listenerId: number): void
  startBloodPressureCapture(config: BloodPressureCaptureConfig): Promise<BloodPressureStartResult>
  getBloodPressureSnapshot(): BloodPressureSnapshot | null
  stopBloodPressureCapture(captureId: string): Promise<AcquisitionCommandResult>
  addBloodPressureListener(listener: (snapshot: BloodPressureSnapshot | null) => void): number
  removeBloodPressureListener(listenerId: number): void
  listArtifacts(): Promise<AcquisitionArtifact[]>
  addListener(listener: (snapshot: AcquisitionSnapshot) => void): number
  removeListener(listenerId: number): void
}
