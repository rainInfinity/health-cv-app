/** 按会话和单调窗口时间累计唯一有效心率，保留最近及上次有效结果。 */

import type { RPPGHeartRateWindow, RPPGSnapshot } from '@health-cv-app/acquisition'

/** 保存当前会话最近窗口与唯一有效心率窗口的算术累计。 */
export interface RPPGHeartRateSummary {
  /** 当前结果所属会话；切换会话时所有累计值清零。 */
  sessionId: string | null
  /** 最近一次新到达的已评估窗口，有效与否均保留。 */
  latestWindow: RPPGHeartRateWindow | null
  /** 当前会话最近一个通过质量检查的窗口。 */
  lastValidWindow: RPPGHeartRateWindow | null
  /** 每个唯一有效窗口的 bpm 总和。 */
  validHeartRateSum: number
  /** 已累计且去重的有效窗口数。 */
  validWindowCount: number
}

/** 创建空摘要，避免复用可变状态对象。 */
export function createEmptyRPPGHeartRateSummary(sessionId: string | null = null): RPPGHeartRateSummary {
  return {
    sessionId,
    latestWindow: null,
    lastValidWindow: null,
    validHeartRateSum: 0,
    validWindowCount: 0,
  }
}

/** 接收快照中的新窗口；重复或过期窗口不会再次进入算术平均。 */
export function accumulateRPPGHeartRateSnapshot(
  previous: RPPGHeartRateSummary,
  snapshot: RPPGSnapshot,
): RPPGHeartRateSummary {
  if (snapshot.sessionId == null) {
    return snapshot.phase === 'closed' && previous.sessionId != null
      ? createEmptyRPPGHeartRateSummary()
      : previous
  }

  const current = previous.sessionId === snapshot.sessionId
    ? previous
    : createEmptyRPPGHeartRateSummary(snapshot.sessionId)
  const nextWindow = snapshot.latestHeartRate
  if (nextWindow == null || !isWindowAfter(current.latestWindow, nextWindow)) return current

  const validHeartRate = nextWindow.valid
    && nextWindow.heartRateBpm != null
    && Number.isFinite(nextWindow.heartRateBpm)
  return {
    sessionId: snapshot.sessionId,
    latestWindow: nextWindow,
    lastValidWindow: validHeartRate ? nextWindow : current.lastValidWindow,
    validHeartRateSum: current.validHeartRateSum
      + (validHeartRate ? nextWindow.heartRateBpm as number : 0),
    validWindowCount: current.validWindowCount + (validHeartRate ? 1 : 0),
  }
}

/** 以片段及十进制纳秒顺序拒绝重复或迟到的窗口。 */
function isWindowAfter(
  previous: RPPGHeartRateWindow | null,
  next: RPPGHeartRateWindow,
): boolean {
  if (previous == null) return true
  if (next.segmentIndex !== previous.segmentIndex) return next.segmentIndex > previous.segmentIndex

  const startOrder = compareUnsignedDecimal(next.windowStartNanos, previous.windowStartNanos)
  if (startOrder !== 0) return startOrder > 0
  return compareUnsignedDecimal(next.windowEndNanos, previous.windowEndNanos) > 0
}

/** 比较不转成浮点数的非负十进制纳秒字符串。 */
function compareUnsignedDecimal(left: string, right: string): number {
  const normalizedLeft = left.replace(/^0+(?=\d)/, '')
  const normalizedRight = right.replace(/^0+(?=\d)/, '')
  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length < normalizedRight.length ? -1 : 1
  }
  if (normalizedLeft === normalizedRight) return 0
  return normalizedLeft < normalizedRight ? -1 : 1
}
