/** 有限读取任务处理后 CSV，保留真实毫秒时间轴和原始信号幅值。 */

import type { CloudClient, Rsp } from '@health-cv-app/cloud-client'
import type { AuthSessionManager } from '../auth/session'
import { getWaveDisplayRange } from '../../shared/components/PulseWaveChart/pulseWaveDisplay'

export const REPORT_WAVE_MAX_BYTES = 5 * 1024 * 1024
export const REPORT_WAVE_MAX_ROWS = 20_000
export const REPORT_WAVE_WINDOW_MS = 6_000

/** 报告PPG沿用后端已处理的方向；SCG保留处理后Z方向，前端均不取负。 */
export type ReportWaveKind = 'ppg' | 'scg'

/** 仅由已支持算法及顶层输出声明得到的文件合同。 */
export interface ReportWaveSource {
  /** 下载路径使用逻辑名，而非不透明引用。 */
  logicalName: string
  /** 算法约定的原始毫秒列。 */
  timestampColumn: 'timestamp' | 'timestampFrame'
  /** 本文件的信号方向。 */
  kind: ReportWaveKind
}

/** 页面局部保存的完整有界报告，不进入查询缓存。 */
export interface ReportWaveData {
  /** 首个文件时间点归零后的真实毫秒及原始幅值。 */
  samples: [number, number][]
  /** 首尾真实时间跨度，不强制三十秒。 */
  durationMs: number
  /** 全文件真实显示幅值的有限纵轴，包含既有上下留白。 */
  minimum: number
  maximum: number
}

/** 可公开展示的读取错误类别，不包含 CSV、路径或内部异常。 */
export class ReportWaveformError extends Error {
  /** 仅表示当前波形的失败，不代表任务或读数失败。 */
  readonly code: 'unavailable' | 'too-large' | 'too-many-rows' | 'invalid-csv' | 'session-changed' | 'cancelled'

  /** 创建不携带健康样本的安全错误。 */
  constructor(code: ReportWaveformError['code']) {
    super(code)
    this.name = 'ReportWaveformError'
    this.code = code
  }
}

/** 将未知结果限制为普通 JSON 对象。 */
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

/** 显式识别两个场景和四种独立历史任务，绝不借用其他成员输出。 */
export function selectReportWaveSource(task: Rsp.Tasks.TaskDetail, kind: ReportWaveKind): ReportWaveSource | null {
  if (task.status !== 'SUCCEEDED' || task.isExample) return null
  const result = record(task.result)
  if (!result) return null
  let logicalName: string
  let timestampColumn: ReportWaveSource['timestampColumn'] = 'timestamp'
  switch (task.modelCode) {
    case 'ppg.active.offline.all':
    case 'ppg_acc.active.offline.all': {
      const bp = task.modelCode === 'ppg_acc.active.offline.all'
      if (!bp && kind !== 'ppg') return null
      if (result.outcome !== 'ALL_SUCCEEDED' && result.outcome !== 'PARTIALLY_SUCCEEDED') return null
      if (bp && result.outcome !== 'ALL_SUCCEEDED') return null
      const member = record(record(result.results)?.[bp ? 'bp' : 'hr_br'])
      if (member?.status !== 'SUCCEEDED' || member.algorithmKey !== (bp ? 'ppg_acc.active.offline.bp.v1' : 'ppg.active.offline.hr_br.v1') || !record(member.result)) return null
      logicalName = bp ? `bp_processed_${kind}` : 'hr_br_processed_ppg'
      break
    }
    case 'ppg.active.offline.hr_br':
      if (kind !== 'ppg') return null
      logicalName = 'processed_ppg'
      break
    case 'ppg.active.offline.spo2':
    case 'ppg.active.offline.diabetes':
      if (kind !== 'ppg') return null
      logicalName = 'processed_ppg'
      timestampColumn = 'timestampFrame'
      break
    case 'ppg_acc.active.offline.bp':
      logicalName = `processed_${kind}`
      break
    default:
      return null
  }
  const outputs = record(result.output_files)
  if (!outputs || !Object.hasOwn(outputs, logicalName) || typeof outputs[logicalName] !== 'string' || outputs[logicalName] === '') return null
  return { logicalName, timestampColumn, kind }
}

/** 无需 TextEncoder，按 UTF-8 字节而非 JS 字符数落实文件上限。 */
function assertTextSize(text: string): void {
  let bytes = 0
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length && text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4
      index += 1
    } else bytes += 3
    if (bytes > REPORT_WAVE_MAX_BYTES) throw new ReportWaveformError('too-large')
  }
}

/** 解析数值 CSV 单行，接受标准引号及转义，拒绝破损或多行字段。 */
function csvRow(line: string): string[] {
  const cells: string[] = []
  let start = 0
  while (start <= line.length) {
    if (line[start] !== '"') {
      const comma = line.indexOf(',', start)
      const end = comma < 0 ? line.length : comma
      const value = line.slice(start, end)
      if (value.includes('"')) throw new ReportWaveformError('invalid-csv')
      cells.push(value.trim())
      if (comma < 0) break
      start = comma + 1
      continue
    }
    let value = ''
    let position = start + 1
    let closed = false
    for (; position < line.length; position += 1) {
      if (line[position] !== '"') value += line[position]
      else if (line[position + 1] === '"') { value += '"'; position += 1 }
      else { position += 1; closed = true; break }
    }
    if (!closed || (position < line.length && line[position] !== ',')) throw new ReportWaveformError('invalid-csv')
    cells.push(value.trim())
    if (position === line.length) break
    start = position + 1
  }
  return cells
}

/** 只接受有限十进制数值，不将空格、空单元格或十六进制当作零。 */
function csvNumber(value: string): number {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) throw new ReportWaveformError('invalid-csv')
  const number = Number(value)
  if (!Number.isFinite(number)) throw new ReportWaveformError('invalid-csv')
  return number
}

/** 完整解析一个有界文件；超限直接失败，不截断、不排序、不补点。 */
export function parseReportWaveCsv(text: string, source: ReportWaveSource): ReportWaveData {
  assertTextSize(text)
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)
  if (lines.at(-1) === '') lines.pop()
  if (lines.length - 1 > REPORT_WAVE_MAX_ROWS) throw new ReportWaveformError('too-many-rows')
  const headers = csvRow(lines[0] ?? '')
  const required = source.kind === 'scg' ? [source.timestampColumn, 'scgX', 'scgY', 'scgZ'] : [source.timestampColumn, 'ppg']
  if (headers.length !== required.length || new Set(headers).size !== headers.length || !required.every((name) => headers.includes(name))) throw new ReportWaveformError('invalid-csv')
  const timestampIndex = headers.indexOf(source.timestampColumn)
  const valueIndex = headers.indexOf(source.kind === 'scg' ? 'scgZ' : 'ppg')
  const samples: [number, number][] = []
  let firstTime = 0
  let previousTime = -Infinity
  for (let index = 1; index < lines.length; index += 1) {
    const cells = csvRow(lines[index])
    if (cells.length !== headers.length) throw new ReportWaveformError('invalid-csv')
    const numbers = cells.map(csvNumber)
    const timestamp = numbers[timestampIndex]
    if (timestamp <= previousTime) throw new ReportWaveformError('invalid-csv')
    if (samples.length === 0) firstTime = timestamp
    const relativeTime = timestamp - firstTime
    if (!Number.isFinite(relativeTime)) throw new ReportWaveformError('invalid-csv')
    samples.push([relativeTime, numbers[valueIndex]])
    previousTime = timestamp
  }
  if (samples.length < 2) throw new ReportWaveformError('invalid-csv')
  return { samples, durationMs: samples[samples.length - 1][0], ...getWaveDisplayRange(samples, source.kind, false) }
}

/** 短文件使用真实跨度，长文件维持至多六秒的独立横向视窗。 */
export function getReportWaveWindow(durationMs: number, requestedStartMs = 0): { startTimeMs: number; endTimeMs: number } {
  const width = Math.min(REPORT_WAVE_WINDOW_MS, durationMs)
  const startTimeMs = Math.max(0, Math.min(durationMs - width, requestedStartMs))
  return { startTimeMs, endTimeMs: startTimeMs + width }
}

/** 浏览器及 Node 可直接读取 Blob，原生使用 FileReader，取消时释放读取工作。 */
async function readBlobText(body: Blob, signal: AbortSignal): Promise<string> {
  if (typeof body.text === 'function') return body.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    const cancel = () => { reader.abort(); reject(new ReportWaveformError('cancelled')) }
    const cleanup = () => signal.removeEventListener('abort', cancel)
    reader.onload = () => { cleanup(); resolve(String(reader.result)) }
    reader.onerror = () => { cleanup(); reject(new ReportWaveformError('invalid-csv')) }
    reader.onabort = () => { cleanup(); reject(new ReportWaveformError('cancelled')) }
    signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted) cancel()
    else reader.readAsText(body, 'UTF-8')
  })
}

/** 下载前后及文本读取后校验同一认证代次，结果只交还当前报告组件。 */
export async function downloadReportWaveform(
  services: { client: Pick<CloudClient, 'tasks'>; auth: Pick<AuthSessionManager, 'isAuthenticatedAt' | 'runProtected'> },
  task: Rsp.Tasks.TaskDetail,
  kind: ReportWaveKind,
  generation: number,
  signal: AbortSignal,
): Promise<ReportWaveData> {
  const source = selectReportWaveSource(task, kind)
  if (!source) throw new ReportWaveformError('unavailable')
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal.addEventListener('abort', cancel, { once: true })
  let oversized = false
  /** 撤销身份或取消后，任何迟到文本和解析结果均不可交给页面。 */
  function assertCurrent() {
    if (!services.auth.isAuthenticatedAt(generation)) throw new ReportWaveformError('session-changed')
    if (controller.signal.aborted || signal.aborted) throw new ReportWaveformError(oversized ? 'too-large' : 'cancelled')
  }
  try {
    assertCurrent()
    const file = await services.auth.runProtected(
      (options) => {
        assertCurrent()
        return services.client.tasks.downloadOutput(task.taskId, source.logicalName, options)
      },
      { signal: controller.signal, onProgress: ({ loadedBytes, totalBytes }) => {
        if (loadedBytes > REPORT_WAVE_MAX_BYTES || (totalBytes !== undefined && totalBytes > REPORT_WAVE_MAX_BYTES)) {
          oversized = true
          controller.abort()
        }
      } },
      generation,
    )
    assertCurrent()
    if (file.body.size > REPORT_WAVE_MAX_BYTES) throw new ReportWaveformError('too-large')
    const text = await readBlobText(file.body, controller.signal)
    assertCurrent()
    const data = parseReportWaveCsv(text, source)
    assertCurrent()
    return data
  } catch (error) {
    if (oversized) throw new ReportWaveformError('too-large')
    throw error
  } finally {
    signal.removeEventListener('abort', cancel)
  }
}
