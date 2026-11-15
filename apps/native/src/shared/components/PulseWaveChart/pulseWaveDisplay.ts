/** 统一原生脉搏波的显示极性，不改写采集、算法或页面历史中的原始幅值。 */

/** 绘图前只取负一次，保留真实时间、零值和缺口；调用方仍保存原始点。 */
export function buildPulseDisplayPoints(points: readonly [number, number | null][]): [number, number | null][] {
  return points.map(([time, value]): [number, number | null] => [time, value === null ? null : -value])
}
