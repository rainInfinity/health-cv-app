/** 权威健康区间的页面派生；不生成记录、不改写服务端原值。 */

import type { AuthState } from '@/app/auth/types'
import type { HealthMetric } from '@/app/navigation/types'
import type { Rsp } from '@health-cv-app/cloud-client'
import { beijingToday, parseSubmittedAt } from '../../shared/dateTime'
import { measurementReading } from '../home/healthPresentation'
import { formatHealthNumber, formatRiskLevel } from '../../shared/healthNumber'

export type HistoryMetric = Exclude<HealthMetric, 'faceHeartRate'>
export type HistoryPeriod = 1 | 7 | 30
/** 北京时间日历日期的闭区间，起止日期均包含在筛选内。 */
export interface HistoryRange {
  /** 起始日，格式为 YYYY-MM-DD。 */
  from: string
  /** 结束日，格式为 YYYY-MM-DD。 */
  to: string
}
/** 仅保留在当前页面内存中的已提交筛选。 */
export interface HistoryFilter extends HistoryRange {
  /** 稳定指标标识，不使用译文或数组下标作为协议。 */
  metric: HistoryMetric
  /** 固定周期天数；null 表示已确认的自定义日期区间。 */
  period: HistoryPeriod | null
  /** 周期结束基准日；切换周期时保持不变。 */
  anchor: string
}
/** 同日多条以 recordId 区分，保留 taskId、来源、质量及固定版本。 */
export interface HistoryRecord extends Rsp.Measurements.MeasurementRecord {
  readonly id: string
  readonly date: string
  /** 仅供现有绘图组件使用的明确时区时刻；submittedAt 保持原字符串。 */
  readonly measuredAt: string
  readonly values: readonly number[]
}

export interface HistoryInterval {
  readonly items: readonly Rsp.Measurements.MeasurementRecord[]
  readonly total: number
  readonly complete: boolean
  readonly error: unknown | null
}
/** 同一筛选区间内某一读数组件的统计，不受图例显隐影响。 */
export interface HistoryStatistic {
  /** 原始读数计算的均值，仅最终展示时截去小数。 */
  readonly average: number
  /** 区间内最低原始读数，缺失记录不作为零值。 */
  readonly minimum: number
  /** 区间内最高原始读数。 */
  readonly maximum: number
  /** 首次出现最低值的记录，供图中极值位置使用。 */
  readonly minimumRecord: HistoryRecord
  /** 首次出现最高值的记录；与最低相等时合并图中标注。 */
  readonly maximumRecord: HistoryRecord
}

export const HISTORY_METRICS: readonly HistoryMetric[] = ['bloodPressure', 'heartRate', 'respirationRate', 'oxygenSaturation', 'diabetesRisk']
export const HISTORY_PERIODS: readonly (HistoryPeriod | null)[] = [1, 7, 30, null]
export const CALENDAR_DAY_MS = 86_400_000


/** 仅以 UTC 计算日历日；真实测量时刻另以北京时间表示。 */
export function calendarTimestamp(date: string): number {
  return Date.parse(`${date}T00:00:00Z`)
}

/** 跨月跨年按完整日历日移动，不受设备时区和夏令时影响。 */
export function moveCalendarDate(date: string, days: number): string {
  return new Date(calendarTimestamp(date) + days * CALENDAR_DAY_MS).toISOString().slice(0, 10)
}

/** 判断日历输入是否完整、有效且起止有序。 */
export function isValidHistoryRange(range: HistoryRange): boolean {
  return [range.from, range.to].every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(calendarTimestamp(date))
    && new Date(calendarTimestamp(date)).toISOString().slice(0, 10) === date) && range.from <= range.to
}

/** 计算包含基准日的固定周期。 */
export function periodRange(period: HistoryPeriod, anchor: string): HistoryRange {
  return { from: moveCalendarDate(anchor, 1 - period), to: anchor }
}

/** 进程首次进入以北京时间今天为基准，不依赖设备时区。 */
export function initialHistoryFilter(nowMillis: number = Date.now()): HistoryFilter {
  const anchor = beijingToday(nowMillis)
  return { metric: 'bloodPressure', period: 7, anchor, ...periodRange(7, anchor) }
}

/** 切换周期保留基准日，自定义区间的结束日成为新的基准日。 */
export function selectHistoryPeriod(filter: HistoryFilter, period: HistoryPeriod): HistoryFilter {
  return { ...filter, period, ...periodRange(period, filter.anchor) }
}

/** 固定周期整体平移；自定义范围没有周期箭头。 */
export function moveHistoryPeriod(filter: HistoryFilter, direction: -1 | 1): HistoryFilter {
  if (filter.period === null) return filter
  const anchor = moveCalendarDate(filter.anchor, filter.period * direction)
  return { ...filter, anchor, ...periodRange(filter.period, anchor) }
}

/** 有效日期确认才提交；错误或取消不改动当前筛选。 */
export function commitHistoryRange(filter: HistoryFilter, range: HistoryRange): HistoryFilter {
  return isValidHistoryRange(range) ? { ...filter, ...range, period: null, anchor: range.to } : filter
}

/** 顺序稳定且首尾不循环。 */
export function adjacentHistoryMetric(metric: HistoryMetric, direction: -1 | 1): HistoryMetric | null {
  return HISTORY_METRICS[HISTORY_METRICS.indexOf(metric) + direction] ?? null
}

const READING_CODES: Record<HistoryMetric, readonly string[]> = {
  bloodPressure: ['sbp', 'dbp'], heartRate: ['hr'], respirationRate: ['br'],
  oxygenSaturation: ['spo2'], diabetesRisk: ['diabetes_probability'],
}

/** 风险只映射后端档位，其他读数截去小数；原始记录与统计输入保持不变。 */
export function formatHistoryValue(record: HistoryRecord, value: number): string {
  return record.metric === 'diabetesRisk' ? formatRiskLevel(record.riskLevel) : formatHistoryNumber(value)
}

/** 当前指标及日期内的全部记录同源派生；完整区间才提供最终趋势及统计。 */
export function selectHistoryView(
  auth: AuthState,
  filter: HistoryFilter,
  interval?: HistoryInterval,
  selectedId: string | null = null,
) {
  const selected: HistoryRecord[] = []
  if (auth.status === 'authenticated' && interval?.complete && interval.error == null && isValidHistoryRange(filter)) {
    for (const record of interval.items) {
      if (record.metric !== filter.metric) continue
      const timestamp = parseSubmittedAt(record.submittedAt)
      if (!Number.isFinite(timestamp)) continue
      const measuredAt = new Date(timestamp).toISOString()
      const date = new Date(timestamp + 8 * 3_600_000).toISOString().slice(0, 10)
      if (date < filter.from || date > filter.to) continue
      const values = READING_CODES[filter.metric].map((code) => measurementReading(record, code))
      if (values.some((value) => value === null)) continue
      selected.push({ ...record, id: record.recordId, date, measuredAt, values: values as number[] })
    }
  }
  // 同秒记录保留接口的权威倒序；秒级展示时间无法恢复服务端内部更高精度。
  selected.sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt))
  const all = selected
  const complete = auth.status === 'authenticated' && interval?.complete === true && interval.error == null
  const records = complete && filter.metric !== 'diabetesRisk' ? all.slice().reverse() : []
  const statistics: HistoryStatistic[] = records.length === 0 ? [] : records[0].values.map((_, component) => {
    let total = 0
    let minimumRecord = records[0]
    let maximumRecord = records[0]
    for (const record of records) {
      const value = record.values[component]
      total += value
      if (value < minimumRecord.values[component]) minimumRecord = record
      if (value > maximumRecord.values[component]) maximumRecord = record
    }
    return { average: total / records.length, minimum: minimumRecord.values[component], maximum: maximumRecord.values[component], minimumRecord, maximumRecord }
  })
  return { records, statistics, all, recent: all.slice(0, 10), detail: selected.find((record) => record.id === selectedId) ?? null, complete, total: auth.status === 'authenticated' ? interval?.total ?? 0 : 0 }
}


/** 最后展示时直接舍弃小数，统计计算保留原始精度。 */
export function formatHistoryNumber(value: number): string {
  return formatHealthNumber(value)
}

/** 固定输出六行日历；空格只占位，避免切月时弹窗高度跳变。 */
export function calendarMonthCells(month: string): readonly (string | null)[] {
  const first = `${month}-01`
  const date = new Date(calendarTimestamp(first))
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
  const length = (next.getTime() - date.getTime()) / CALENDAR_DAY_MS
  const cells: (string | null)[] = Array(date.getUTCDay()).fill(null)
  for (let day = 0; day < length; day += 1) cells.push(moveCalendarDate(first, day))
  while (cells.length < 42) cells.push(null)
  return cells
}

/** 月浏览保持日历日期语义，不经过设备本地时区。 */
export function moveCalendarMonth(month: string, direction: -1 | 1): string {
  const date = new Date(calendarTimestamp(`${month}-01`))
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + direction, 1)).toISOString().slice(0, 7)
}
