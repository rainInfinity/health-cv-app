/** 有限读取已发布的 RPPG 会话，分开汇总频谱均值与逐搏历史。 */
import type { RPPGArtifact } from '@health-cv-app/acquisition'

/** 开发页单轮历史的读取上限；超限失败，不截断成完整结果。 */
const MAX_HISTORY_ROWS = 4_096

/** 一次可信搏动对应的原始读数，不把缺失区间补成连续序列。 */
export interface RPPGHistoryBeat {
  /** 连续信号片段编号。 */
  segmentIndex: number
  /** 当前峰相对会话首帧的毫秒时间。 */
  timeMs: number
  /** 相邻可信峰间隔，单位毫秒。 */
  intervalMs: number
  /** 最新 RR 对应的初步心率，单位 bpm。 */
  heartRateBpm: number
}

/** 已完成会话的可追溯摘要；旧会话没有逐搏文件时 beats 为 null。 */
export interface RPPGHistory {
  /** UTC 会话开始时间，包含打开和观察，不等于正式测量起点。 */
  startedAt: string
  /** 本轮冻结的配置版本。 */
  configVersion: string
  /** 正式测量目标，单位秒。 */
  targetSeconds: number
  /** 频谱窗口长度，单位秒。 */
  windowSeconds: number
  /** 仅由全部有效频谱窗口计算的算术均值；无有效窗口时为空。 */
  averageHeartRateBpm: number | null
  /** 参与均值的有效窗口数量。 */
  validWindowCount: number
  /** 按采集顺序排列的逐搏初步值；空数组表示本轮未形成合格逐搏。 */
  beats: RPPGHistoryBeat[] | null
}

/** 拒绝空值及非有限数字，避免缺失读数被 Number 转成零。 */
function finiteNumber(value: string): number {
  if (value.trim() === '') throw new Error('RPPG_HISTORY_INVALID_NUMBER')
  const number = Number(value)
  if (!Number.isFinite(number)) throw new Error('RPPG_HISTORY_INVALID_NUMBER')
  return number
}

/** 保留绝对纳秒整数精度，只在完成原点相减后换算展示时间。 */
function nanoseconds(value: string): bigint {
  if (!/^\d+$/.test(value)) throw new Error('RPPG_HISTORY_INVALID_TIME')
  return BigInt(value)
}

/** 读取原生固定 CSV 合同；拒绝不完整表头、空行及超限记录。 */
function rows(text: string, header: string): string[][] {
  const lines = text.trimEnd().split(/\r?\n/)
  if (lines.shift() !== header || lines.length > MAX_HISTORY_ROWS) throw new Error('RPPG_HISTORY_INVALID_CSV')
  const columns = header.split(',').length
  return lines.map((line) => {
    const values = line.split(',')
    if (values.length !== columns) throw new Error('RPPG_HISTORY_INVALID_CSV')
    return values
  })
}

/** 从完整落盘窗口求均值，逐搏值不进入频谱统计；旧历史不补造逐搏序列。 */
export function parseRPPGHistory(
  artifact: RPPGArtifact,
  sessionText: string,
  heartRateText: string,
  beatText: string | null,
): RPPGHistory {
  const session = JSON.parse(sessionText)
  if (session.complete !== true || session.sessionId !== artifact.sessionId || session.source !== artifact.source) {
    throw new Error('RPPG_HISTORY_INVALID_SESSION')
  }
  const startedAt = session.startedAt
  const config = session.config
  if (typeof startedAt !== 'string' || !Number.isFinite(Date.parse(startedAt))
    || typeof config?.configVersion !== 'string') throw new Error('RPPG_HISTORY_INVALID_SESSION')
  const origin = nanoseconds(session.sensorTimeOriginNs)
  const windows = rows(heartRateText, 'segmentIndex,windowStartNs,windowEndNs,heartRateBpm,valid,reason,spectralSnrDb')
  if (windows.length !== artifact.sampleCounts.heartRateWindows) throw new Error('RPPG_HISTORY_INCOMPLETE_WINDOWS')
  const seen = new Set<string>()
  let sum = 0
  let count = 0
  for (const [segment, start, end, bpm, valid] of windows) {
    const identity = `${segment}:${start}:${end}`
    if (seen.has(identity) || nanoseconds(end) < nanoseconds(start)) throw new Error('RPPG_HISTORY_INVALID_WINDOW')
    seen.add(identity)
    if (valid === 'true') {
      const value = finiteNumber(bpm)
      if (value <= 0) throw new Error('RPPG_HISTORY_INVALID_NUMBER')
      sum += value
      count++
    } else if (valid !== 'false' || bpm !== '') {
      throw new Error('RPPG_HISTORY_INVALID_WINDOW')
    }
  }
  if (count !== artifact.sampleCounts.validHeartRateWindows) throw new Error('RPPG_HISTORY_INCOMPLETE_WINDOWS')
  let previousPeak: bigint | null = null
  const beats = beatText == null ? null : rows(beatText, 'segmentIndex,previousPeakTimestampNs,peakTimestampNs,intervalNs,heartRateBpm').map(
    ([segment, previous, peak, interval, bpm]) => {
      const timestamp = nanoseconds(peak)
      const intervalNs = nanoseconds(interval)
      const segmentIndex = finiteNumber(segment)
      const heartRateBpm = finiteNumber(bpm)
      if (!Number.isSafeInteger(segmentIndex) || segmentIndex < 0 || timestamp < origin || intervalNs <= 0n
        || timestamp - nanoseconds(previous) !== intervalNs || heartRateBpm <= 0
        || (previousPeak != null && timestamp <= previousPeak)) throw new Error('RPPG_HISTORY_INVALID_BEAT')
      previousPeak = timestamp
      return { segmentIndex, timeMs: Number(timestamp - origin) / 1_000_000, intervalMs: Number(intervalNs) / 1_000_000, heartRateBpm }
    },
  )
  return {
    startedAt,
    configVersion: config.configVersion,
    targetSeconds: finiteNumber(String(config.targetMeasurementDurationNanos)) / 1_000_000_000,
    windowSeconds: finiteNumber(String(config.heartRateWindowNanos)) / 1_000_000_000,
    averageHeartRateBpm: count > 0 ? sum / count : null,
    validWindowCount: count,
    beats,
  }
}

