/** 统一信号显示方向及真实幅值纵轴，不改写采集、算法或页面历史中的原始值。 */

/** 绘图前 PPG 只取负一次，SCG 保留原始 Z 方向；真实时间、零值和缺口不变。 */
export function buildPulseDisplayPoints(points: readonly [number, number | null][], signal: 'ppg' | 'scg' = 'ppg'): [number, number | null][] {
  return points.map(([time, value]): [number, number | null] => [time, value === null ? null : signal === 'ppg' ? -value : value])
}

/** 按实际显示方向建立全文件纵轴并保留10%–85%留白；处理后报告关闭PPG取负。 */
export function getWaveDisplayRange(points: readonly [number, number | null][], signal: 'ppg' | 'scg', invertPpg = true): { minimum: number; maximum: number } {
  let minimum = Infinity
  let maximum = -Infinity
  const invert = signal === 'ppg' && invertPpg
  for (const [, value] of points) {
    if (value === null || !Number.isFinite(value)) continue
    const displayValue = invert ? -value : value
    minimum = Math.min(minimum, displayValue)
    maximum = Math.max(maximum, displayValue)
  }
  if (minimum === Infinity) return { minimum: -0.5, maximum: 0.5 }
  const scale = Math.max(Math.abs(minimum), Math.abs(maximum), 1)
  const low = minimum / scale
  const high = maximum / scale
  const span = maximum === minimum ? Math.max(1 / scale, Math.abs(low) * 0.02) : (high - low) / 0.75
  // 先归一化再留白，避免合法有限极值相减或外扩时溢出。
  return {
    minimum: Math.max(-Number.MAX_VALUE, (low - span * (maximum === minimum ? 0.5 : 0.1)) * scale),
    maximum: Math.min(Number.MAX_VALUE, (high + span * (maximum === minimum ? 0.5 : 0.15)) * scale),
  }
}
