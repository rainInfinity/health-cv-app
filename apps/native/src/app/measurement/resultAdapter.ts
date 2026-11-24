/** 将已支持的任务权威结果映射为报告，不从采集完成或未知载荷推断读数。 */
import type { Rsp } from '@health-cv-app/cloud-client'
import { formatBeijingDateTime, parseSubmittedAt } from '../../shared/dateTime'

export type ReportMemberKey = 'hr' | 'br' | 'spo2' | 'diabetes' | 'bp'
export type ReportMetricKey = 'heartRate' | 'respirationRate' | 'oxygenSaturation' | 'diabetesRisk' | 'bloodPressure'
export interface ReportQuality { score: number; threshold: number }
export interface ReportReading { code: string; value: number; unit: string }
export interface ReportMetric {
  status: 'succeeded' | 'failed' | 'unavailable'
  /** 公开质量拒绝与其他未生成结果分开，不由分数推断。 */
  failureReason: 'quality' | 'generation' | null
  readings: readonly ReportReading[]
  quality: ReportQuality | null
  riskLevel: number | null
  message: string
}
export interface ReportMember {
  status: 'succeeded' | 'failed' | 'unavailable'
  algorithmKey: string
  message: string
  quality: ReportQuality | null
}
export interface MeasurementReport {
  taskId: number
  taskStatus: string
  outcome: 'ALL_SUCCEEDED' | 'PARTIALLY_SUCCEEDED' | 'ALL_FAILED' | null
  state: 'complete' | 'partial' | 'all_failed' | 'task_failed' | 'pending' | 'unavailable'
  hasValidMembers: boolean
  summary: string
  submittedAt: string | null
  measurementTime: string
  members: Partial<Record<ReportMemberKey, ReportMember>>
  metrics: Record<ReportMetricKey, ReportMetric>
}

const algorithms: Record<ReportMemberKey, string> = {
  hr: 'ppg.active.offline.hr.v1',
  br: 'ppg.active.offline.br.v1',
  spo2: 'ppg.active.offline.spo2.v1',
  diabetes: 'ppg.active.offline.diabetes.v1',
  bp: 'ppg_acc.active.offline.bp.v1',
}
const models: Record<string, readonly ReportMemberKey[]> = {
  'ppg.active.offline.all': ['hr', 'br', 'spo2', 'diabetes'],
  'ppg_acc.active.offline.all': ['bp'],
  'ppg.active.offline.hr': ['hr'],
  'ppg.active.offline.br': ['br'],
  'ppg.active.offline.spo2': ['spo2'],
  'ppg.active.offline.diabetes': ['diabetes'],
  'ppg_acc.active.offline.bp': ['bp'],
}
const memberMetrics: Record<ReportMemberKey, readonly ReportMetricKey[]> = {
  hr: ['heartRate'], br: ['respirationRate'], spo2: ['oxygenSaturation'], diabetes: ['diabetesRisk'], bp: ['bloodPressure'],
}

function object(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
function quality(value: unknown): ReportQuality | null {
  const source = object(value)
  return source && finite(source.score) && finite(source.threshold) && source.score >= 0 && source.score <= 100 && source.threshold >= 0 && source.threshold <= 100
    ? { score: source.score, threshold: source.threshold } : null
}
function failure(source: Record<string, unknown>): { message: string; quality: ReportQuality | null; failureReason: 'quality' | 'generation' } {
  const detail = object(source.qualityFailure)
  if (source.failureCode === 'INFERENCE.QUALITY_REJECTED') {
    const score = detail?.reason === 'LOW_SCORE' ? quality(detail.details) : null
    return { message: '信号质量过低', quality: score, failureReason: 'quality' }
  }
  return { message: typeof source.failureMessage === 'string' && source.failureMessage.trim() ? source.failureMessage : '未能生成结果', quality: null, failureReason: 'generation' }
}
function unavailable(message = '本任务未提供此项结果'): ReportMetric {
  return { status: 'unavailable', failureReason: null, readings: [], quality: null, riskLevel: null, message }
}
function validReadings(key: ReportMemberKey, result: Record<string, unknown>): ReportReading[][] | null {
  switch (key) {
    case 'hr': return finite(result.hr)
      ? [[{ code: 'hr', value: result.hr, unit: '次/分' }]] : null
    case 'br': return finite(result.br) && result.br >= 8 && result.br <= 20
      ? [[{ code: 'br', value: result.br, unit: '次/分' }]] : null
    case 'spo2': return finite(result.spo2) && result.spo2 >= 90 && result.spo2 <= 100
      ? [[{ code: 'spo2', value: result.spo2, unit: '%' }]] : null
    case 'diabetes': return finite(result.prob) && result.prob >= 0 && result.prob <= 1 && (result.risk_level === 0 || result.risk_level === 1 || result.risk_level === 2)
      ? [[{ code: 'diabetes_probability', value: result.prob, unit: '原始概率' }]] : null
    case 'bp': return finite(result.sbp) && finite(result.dbp)
      ? [[{ code: 'sbp', value: result.sbp, unit: 'mmHg' }, { code: 'dbp', value: result.dbp, unit: 'mmHg' }]] : null
  }
}

/** 完整成员汇总与独立历史保持各自路径；任何任务级失败都不保留中间读数。 */
export function adaptMeasurementResult(task: Rsp.Tasks.TaskDetail): MeasurementReport {
  const submittedMillis = task.submittedAt == null ? NaN : parseSubmittedAt(task.submittedAt)
  const report: MeasurementReport = {
    taskId: task.taskId, taskStatus: task.status, outcome: null, state: 'unavailable', hasValidMembers: false,
    summary: '结果格式暂不支持或不可用', submittedAt: task.submittedAt,
    measurementTime: Number.isFinite(submittedMillis) ? formatBeijingDateTime(submittedMillis, 'fullDateTime') : '检测时间未知',
    members: {}, metrics: { heartRate: unavailable(), respirationRate: unavailable(), oxygenSaturation: unavailable(), diabetesRisk: unavailable(), bloodPressure: unavailable() },
  }
  const keys = Object.hasOwn(models, task.modelCode) ? models[task.modelCode] : undefined
  if (task.status === 'FAILED') {
    const detail = failure(task as unknown as Record<string, unknown>)
    report.state = 'task_failed'
    report.summary = `任务处理失败：${detail.message}`
    for (const key of keys ?? []) {
      report.members[key] = { status: 'failed', algorithmKey: algorithms[key], ...detail }
      for (const metric of memberMetrics[key]) report.metrics[metric] = { ...unavailable(detail.message), status: 'failed', failureReason: detail.failureReason, quality: detail.quality }
    }
    return report
  }
  if (task.status === 'DRAFT' || task.status === 'SUBMITTED' || task.status === 'RUNNING') {
    report.state = 'pending'
    report.summary = task.status === 'DRAFT' ? '任务尚未提交' : task.status === 'SUBMITTED' ? '任务已提交，等待处理' : '正在处理检测结果'
    return report
  }
  if (task.status !== 'SUCCEEDED' || task.isExample !== false || !keys) return report
  const result = object(task.result)
  if (!result) return report
  const scenario = task.modelCode === 'ppg.active.offline.all' || task.modelCode === 'ppg_acc.active.offline.all'
  let sources: Record<string, unknown> = {}
  if (scenario) {
    const members = object(result.results)
    if (!members || Object.keys(members).length !== keys.length) return report
    let succeeded = 0
    for (const key of keys) {
      const member = object(members[key])
      if (!member || member.algorithmKey !== algorithms[key] || (member.status !== 'SUCCEEDED' && member.status !== 'FAILED')) return report
      if (member.status === 'SUCCEEDED') {
        if (!object(member.result)) return report
        succeeded += 1
      } else if (member.result !== null) return report
    }
    const expected = succeeded === keys.length ? 'ALL_SUCCEEDED' : succeeded === 0 ? 'ALL_FAILED' : 'PARTIALLY_SUCCEEDED'
    if (result.outcome !== expected) return report
    report.outcome = expected
    sources = members
  } else {
    sources[keys[0]!] = { status: 'SUCCEEDED', result }
  }
  let valid = 0
  let invalidPayload = false
  for (const key of keys) {
    const source = object(sources[key])!
    if (source.status === 'FAILED') {
      const detail = failure(source)
      report.members[key] = { status: 'failed', algorithmKey: algorithms[key], ...detail }
      for (const metric of memberMetrics[key]) report.metrics[metric] = { ...unavailable(detail.message), status: 'failed', failureReason: detail.failureReason, quality: detail.quality }
      continue
    }
    const payload = object(source.result)!
    const readings = validReadings(key, payload)
    if (!readings) {
      invalidPayload = true
      const message = '该成员结果格式无效，无法展示读数'
      report.members[key] = { status: 'unavailable', algorithmKey: algorithms[key], message, quality: null }
      for (const metric of memberMetrics[key]) report.metrics[metric] = unavailable(message)
      continue
    }
    const score = quality(payload.quality)
    report.members[key] = { status: 'succeeded', algorithmKey: algorithms[key], message: '', quality: score }
    memberMetrics[key].forEach((metric, index) => {
      report.metrics[metric] = { status: 'succeeded', failureReason: null, readings: readings[index]!, quality: score, riskLevel: key === 'diabetes' ? payload.risk_level as number : null, message: '' }
    })
    valid += 1
  }
  report.hasValidMembers = !invalidPayload && valid > 0
  report.state = invalidPayload ? 'unavailable' : valid === keys.length ? 'complete' : valid > 0 ? 'partial' : report.outcome === 'ALL_FAILED' ? 'all_failed' : 'unavailable'
  report.summary = report.state === 'complete' ? '检测结果已生成' : report.state === 'partial' ? '部分指标可用，请查看未成功项目的原因' : report.state === 'all_failed' ? '本次所有指标均未成功，请查看原因后重新检测' : '没有可展示的有效结果'
  return report
}
