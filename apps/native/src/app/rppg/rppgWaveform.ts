/** 保存真实定稿波形，分别提供开发有界窗口与产品本轮历史，并统一断线规则。 */

import type { RPPGRealtimeBatch } from '@health-cv-app/acquisition'

/** 最近波形展示的单个标量样本及其原生批次身份。 */
export interface RPPGWaveformSample {
  /** 原生会话标识。 */
  sessionId: string
  /** 连续信号片段序号。 */
  segmentIndex: number
  /** 会话内递增批次序号。 */
  sequence: number
  /** 批次内位置。 */
  valueIndex: number
  /** 相对采集原点的时间，单位毫秒。 */
  timeMs: number
  /** 规则采样间隔，单位毫秒。 */
  sampleIntervalMs: number
  /** 不经过展示缩放的原始脉搏幅值。 */
  value: number
}

/** 同时约束缓存时间跨度与点数，避免持有全量信号。 */
export interface RPPGWaveformLimit {
  /** 最近展示时段，单位毫秒。 */
  durationMillis: number
  /** 最多保留的样本数量。 */
  maxPoints: number
}

/** 追加新批次；重复、迟到批次不覆盖当前窗口，新会话立即替换旧数据。 */
export function appendRPPGRealtimeBatch(
  previous: RPPGWaveformSample[],
  batch: RPPGRealtimeBatch,
  limit: RPPGWaveformLimit,
): RPPGWaveformSample[] {
  if (batch.values.length === 0) return previous
  const last = previous[previous.length - 1]
  if (last?.sessionId === batch.sessionId && batch.sequence <= last.sequence) return previous

  const newestTimeMs = batch.startTimeMs + (batch.values.length - 1) * batch.sampleIntervalMs
  const cutoffTimeMs = newestTimeMs - limit.durationMillis
  const samples: RPPGWaveformSample[] = []
  if (last?.sessionId === batch.sessionId) {
    for (const sample of previous) {
      if (sample.timeMs >= cutoffTimeMs) samples.push(sample)
    }
  }
  // 大批次只复制可见尾段，缓存上限不依赖原生每批长度。
  const firstBatchIndex = Math.max(
    0,
    batch.values.length - limit.maxPoints,
    Math.ceil((cutoffTimeMs - batch.startTimeMs) / batch.sampleIntervalMs),
  )
  for (let valueIndex = firstBatchIndex; valueIndex < batch.values.length; valueIndex += 1) {
    samples.push({
      sessionId: batch.sessionId,
      segmentIndex: batch.segmentIndex,
      sequence: batch.sequence,
      valueIndex,
      timeMs: batch.startTimeMs + valueIndex * batch.sampleIntervalMs,
      sampleIntervalMs: batch.sampleIntervalMs,
      value: batch.values[valueIndex],
    })
  }
  return samples.length > limit.maxPoints ? samples.slice(-limit.maxPoints) : samples
}

/** 只连接同会话、同片段、相邻批次且采集时间连续的点，不补造缺失数据。 */
export function areRPPGSamplesContinuous(previous: RPPGWaveformSample, next: RPPGWaveformSample): boolean {
  if (previous.sessionId !== next.sessionId || previous.segmentIndex !== next.segmentIndex) return false
  const sequenceGap = next.sequence - previous.sequence
  const adjacent = sequenceGap === 0
    ? next.valueIndex === previous.valueIndex + 1
    : sequenceGap === 1 && next.valueIndex === 0
  if (!adjacent) return false
  const actualInterval = next.timeMs - previous.timeMs
  return Math.abs(actualInterval - next.sampleIntervalMs) <= Math.max(1, next.sampleIntervalMs * 0.02)
}

/** 有界波形的图表坐标和显示范围，不改变原始样本。 */
export interface RPPGWaveformPlot {
  /** 相对采集时间（毫秒）与原始幅值；空值只用于断线。 */
  points: [number, number | null][]
  /** 可见窗口左端，单位毫秒。 */
  startTimeMs: number
  /** 可见窗口右端，单位毫秒。 */
  endTimeMs: number
  /** 按取负后的展示幅值计算的纵轴下界。 */
  minimum: number
  /** 按取负后的展示幅值计算的上界；恒定信号使用居中的对称范围。 */
  maximum: number
}

/** 保留原始坐标与缺口，纵轴按取负后的展示值计算；幅值翻转只在统一绘图层执行。 */
export function buildRPPGWaveformPlot(samples: readonly RPPGWaveformSample[], durationMillis?: number): RPPGWaveformPlot {
  const first = samples[0]
  const last = samples[samples.length - 1]
  const endTimeMs = last?.timeMs ?? 0
  const span = Math.max(durationMillis ?? endTimeMs - (first?.timeMs ?? 0), last?.sampleIntervalMs ?? 1)
  const points: [number, number | null][] = []
  let minimum = Number.POSITIVE_INFINITY
  let maximum = Number.NEGATIVE_INFINITY
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]
    const previous = samples[index - 1]
    if (previous && !areRPPGSamplesContinuous(previous, sample)) {
      points.push([(previous.timeMs + sample.timeMs) / 2, null])
    }
    points.push([sample.timeMs, sample.value])
    const displayValue = -sample.value
    minimum = Math.min(minimum, displayValue)
    maximum = Math.max(maximum, displayValue)
  }
  if (!first) {
    minimum = -0.5
    maximum = 0.5
  } else if (maximum - minimum <= 1e-12) {
    const center = (minimum + maximum) / 2
    minimum = center - 0.5
    maximum = center + 0.5
  }
  return { points, startTimeMs: endTimeMs - span, endTimeMs, minimum, maximum }
}

/** 产品本轮只追加的展示历史；仅末样本保留批次身份用于连续性判断。 */
export interface RPPGWaveformHistory {
  /** 首个真实样本的原生采集时间，单位毫秒；未收到样本时为空。 */
  originTimeMs: number | null
  /** 末个真实样本，保留原始时间与幅值，不随回看窗口变化。 */
  lastSample: RPPGWaveformSample | null
  /** 相对本轮首样本的毫秒坐标与原始幅值；空值只标记真实缺口。 */
  points: [number, number | null][]
  /** 最新真实样本相对本轮原点的时间，单位毫秒。 */
  latestTimeMs: number
}

/** 创建独立的一轮历史，不预填任何模拟样本。 */
export function createRPPGWaveformHistory(): RPPGWaveformHistory {
  return {
    originTimeMs: null,
    lastSample: null,
    points: [],
    latestTimeMs: 0,
  }
}

/** 原位追加新批次，避免反复复制整轮历史；返回是否接受了新数据。 */
export function appendRPPGWaveformHistory(history: RPPGWaveformHistory, batch: RPPGRealtimeBatch): boolean {
  if (batch.values.length === 0) return false
  if (history.lastSample?.sessionId === batch.sessionId && batch.sequence <= history.lastSample.sequence) return false
  if (history.lastSample != null && history.lastSample.sessionId !== batch.sessionId) {
    Object.assign(history, createRPPGWaveformHistory())
  }
  if (history.originTimeMs == null) history.originTimeMs = batch.startTimeMs
  const originTimeMs = history.originTimeMs
  const firstSample: RPPGWaveformSample = {
    sessionId: batch.sessionId,
    segmentIndex: batch.segmentIndex,
    sequence: batch.sequence,
    valueIndex: 0,
    timeMs: batch.startTimeMs,
    sampleIntervalMs: batch.sampleIntervalMs,
    value: batch.values[0],
  }
  const previous = history.lastSample
  if (previous && !areRPPGSamplesContinuous(previous, firstSample)) {
    history.points.push([(previous.timeMs + firstSample.timeMs) / 2 - originTimeMs, null])
  }
  for (let valueIndex = 0; valueIndex < batch.values.length; valueIndex += 1) {
    const value = batch.values[valueIndex]
    history.points.push([batch.startTimeMs + valueIndex * batch.sampleIntervalMs - originTimeMs, value])
  }
  const lastIndex = batch.values.length - 1
  history.lastSample = lastIndex === 0 ? firstSample : {
    ...firstSample,
    valueIndex: lastIndex,
    timeMs: batch.startTimeMs + lastIndex * batch.sampleIntervalMs,
    value: batch.values[lastIndex],
  }
  history.latestTimeMs = history.lastSample.timeMs - originTimeMs
  return true
}
