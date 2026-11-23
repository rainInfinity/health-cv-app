/** 按真实文件时间格式化报告视窗范围与总时长。 */

/** 报告范围文案的秒数参数。 */
interface ResultWaveRangeParameters {
  /** 当前窗口起止秒数，保留一位小数。 */
  start: string
  end: string
}

const rangeNumber = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })

/** JSON 字符串类型不保留占位参数，显式声明范围插值契约。 */
export function formatResultWaveRange(rangeMessage: unknown, startTimeMs: number, endTimeMs: number): string {
  const range = rangeMessage as (values: ResultWaveRangeParameters) => string
  return range({ start: rangeNumber.format(startTimeMs / 1_000), end: rangeNumber.format(endTimeMs / 1_000) })
}

/** 时长取文件首尾真实跨度，不沿用固定三十秒文案。 */
export function formatResultWaveDuration(durationMs: number): string {
  return `共 ${rangeNumber.format(durationMs / 1_000)} 秒`
}
