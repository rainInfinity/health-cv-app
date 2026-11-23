/** 统一北京时间中文日期与24小时制显示，不依赖设备语言或 Intl 的地区数据。 */

/** 页面正文、记录日期及紧凑趋势轴的显示形式。 */
type DateTimeFormat = 'dateTime' | 'fullDateTime' | 'date' | 'axisDate' | 'time'

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

/** 严格读取服务端无后缀的北京时间，不借用设备默认时区；非法日期返回 NaN。 */
export function parseSubmittedAt(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value)
  if (!match || match[0] !== value) return Number.NaN
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(hour, minute, second, 0)
  // Date 会归一化越界的日期与时分秒，必须逐项回查，不能把坏日期归到另一天。
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day || date.getUTCHours() !== hour ||
      date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second) return Number.NaN
  return date.getTime() - BEIJING_OFFSET_MS
}

/** 按北京时间的日界取得今天，供历史闭区间筛选使用。 */
export function beijingToday(nowMillis = Date.now()): string {
  const date = new Date(nowMillis + BEIJING_OFFSET_MS)
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

/** 格式化含时区的 ISO 时间或 Unix 毫秒；调用方保证输入为有效时刻。 */
export function formatBeijingDateTime(value: string | number, format: DateTimeFormat = 'dateTime'): string {
  // 产品展示使用固定 UTC+8；UTC 取值避免设备时区、夏令时与地区回退改变格式。
  const date = new Date((typeof value === 'number' ? value : Date.parse(value)) + BEIJING_OFFSET_MS)
  const month = date.getUTCMonth() + 1
  const day = date.getUTCDate()
  if (format === 'axisDate') return `${month}/${day}`
  const calendarDate = `${month}月${day}日`
  if (format === 'date') return calendarDate
  const time = `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
  if (format === 'time') return time
  return format === 'fullDateTime' ? `${date.getUTCFullYear()}年${calendarDate} ${time}` : `${calendarDate} ${time}`
}
