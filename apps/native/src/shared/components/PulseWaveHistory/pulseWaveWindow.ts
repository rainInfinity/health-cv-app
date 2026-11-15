/** 从本轮完整历史选择固定六秒视窗，绘图只读取窗口附近的原始坐标。 */

/** 按本轮起点计时的毫秒坐标；null 表示真实缺口。 */
export type PulsePoint = [number, number | null]

export const PULSE_WINDOW_MS = 6_000

/** 将回看位置限制在已采样时间内，未满六秒时保持左侧空白。 */
export function clampPulseWindowStart(latestTimeMs: number, requestedStart: number | null): number {
  const latestStart = latestTimeMs - PULSE_WINDOW_MS
  return requestedStart === null || latestStart <= 0 ? latestStart : Math.max(0, Math.min(latestStart, requestedStart))
}

/** 二分定位左边界，避免每次刷新扫描整轮历史。 */
function lowerBound(points: readonly PulsePoint[], timeMs: number): number {
  let left = 0
  let right = points.length
  while (left < right) {
    const middle = (left + right) >>> 1
    if (points[middle][0] < timeMs) left = middle + 1
    else right = middle
  }
  return left
}

/** 保留视窗两侧预绘区及邻点，维持原生平移和空值断点，不复制整轮历史。 */
export function selectPulseWindow(points: readonly PulsePoint[], startTimeMs: number, paddingMs = 0): PulsePoint[] {
  const first = Math.max(0, lowerBound(points, startTimeMs - paddingMs) - 1)
  const end = Math.min(points.length, lowerBound(points, startTimeMs + PULSE_WINDOW_MS + paddingMs) + 1)
  return points.slice(first, end)
}

/** 纵轴按六秒窗口内取负后的展示值计算；不改写真实样点，预绘和外部邻点不参与。 */
export function getPulseWindowRange(points: readonly PulsePoint[], startTimeMs: number): { minimum: number; maximum: number } {
  let minimum = Infinity
  let maximum = -Infinity
  const endTimeMs = startTimeMs + PULSE_WINDOW_MS
  for (const [time, value] of points) {
    if (time < startTimeMs || time > endTimeMs || value == null || !Number.isFinite(value)) continue
    const displayValue = -value
    minimum = Math.min(minimum, displayValue)
    maximum = Math.max(maximum, displayValue)
  }
  if (minimum === Infinity) return { minimum: -0.5, maximum: 0.5 }
  if (maximum === minimum) return { minimum: minimum - 0.5, maximum: maximum + 0.5 }
  // 展示极值分别位于从底边起 10% 和 85%，不修改原始样本或绘图区高度。
  const span = (maximum - minimum) / 0.75
  return { minimum: minimum - span * 0.1, maximum: maximum + span * 0.15 }
}

/** 标题不暴露起始空白区的负时间，保留十分之一秒。 */
export function formatPulseWindow(startTimeMs: number): string {
  return `${(Math.max(0, startTimeMs) / 1_000).toFixed(1)}–${((startTimeMs + PULSE_WINDOW_MS) / 1_000).toFixed(1)} 秒`
}
