/** 将面部会话的原生截止结论与页面经过时间映射为计时文案。 */

import type { RPPGSnapshot } from '@health-cv-app/acquisition'

/** 到点结束以原生目标时长为准，提前结束保留经过时间，不参与采集截止。 */
export function formatFaceMeasurementElapsed(
  snapshot: Pick<RPPGSnapshot, 'targetMeasurementDurationNanos' | 'termination'>,
  elapsedMillis: number,
): string {
  const targetMillis = Number(snapshot.targetMeasurementDurationNanos) / 1_000_000
  // measuring 通知到达 JS 有延迟，本地计时不足整秒不能抹去原生已到点的事实。
  const milliseconds = snapshot.termination === 'target_duration'
    ? targetMillis
    : Math.min(elapsedMillis, targetMillis)
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
