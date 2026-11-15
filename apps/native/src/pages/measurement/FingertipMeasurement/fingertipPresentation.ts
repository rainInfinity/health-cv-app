/** 只映射真实原生阶段与覆盖，不读取动画终值或自建截止时钟。 */

import type { FingertipSnapshot } from '@health-cv-app/acquisition'

/** 沿用产品状态区域，补齐真实收尾与中断。 */
export type FingertipPresentation = 'ready' | 'partial' | 'covered' | 'running' | 'stopping' | 'completed' | 'interrupted' | 'failed'

/** 完整覆盖只提示保持稳定；正式检测和完成只认原生窗口及释放事实。 */
export function getFingertipPresentation(snapshot: FingertipSnapshot | null): FingertipPresentation {
  if (snapshot == null) return 'ready'
  if (snapshot.phase === 'capturing') return 'running'
  if (snapshot.phase === 'completed') return snapshot.resourcesReleased ? 'completed' : 'stopping'
  if (snapshot.phase === 'stopping' || snapshot.phase === 'failed' || snapshot.phase === 'interrupted') return snapshot.phase
  if (snapshot.phase === 'starting' || snapshot.coverageState === 'complete') return 'covered'
  return snapshot.coverageState === 'partial' ? 'partial' : 'ready'
}

/** 父页只消费阶段、整秒和稳定提示，不接收逐次覆盖快照。 */
export interface FingertipDisplayStatus {
  /** 当前指尖轮次标识，重测后更换。 */
  captureId: string
  /** 原生采集阶段，不由提示防抖推进。 */
  phase: FingertipSnapshot['phase']
  /** 原生剩余量向上取整的秒数。 */
  remainingSeconds: number
  /** 本轮相机及文件资源屏障是否完成。 */
  resourcesReleased: boolean
  /** 原生结构化错误码，无错误为空。 */
  errorCode: string | null
  /** 原生结束原因，尚未结束为空。 */
  endReason: string | null
  /** 关键阶段即时、普通覆盖提示稳定后的展示状态。 */
  presentation: FingertipPresentation
}

/** 覆盖和镜头内提示仅由局部预览订阅。 */
export interface FingertipDisplaySnapshot {
  /** 最新空间覆盖百分比，未知为空，不是等待进度。 */
  coveragePercent: number | null
  /** 原生稳定就绪事实，不代表已经正式开始。 */
  coverageReady: boolean
  /** 本轮资源已释放后冻结末值。 */
  resourcesReleased: boolean
  /** 镜头浮层使用的稳定提示状态。 */
  presentation: FingertipPresentation
}

/** 页面私有展示投影，不持有原生控制权。 */
export interface FingertipDisplay {
  /** 获取覆盖浮层的不可变快照。 */
  getSnapshot(): FingertipDisplaySnapshot
  /** 只订阅局部展示更新，不控制采集。 */
  subscribe(listener: () => void): () => void
  /** 接纳当前轮次的真实原生快照。 */
  update(snapshot: FingertipSnapshot): void
  /** 清空旧轮展示及全部未提交更新。 */
  reset(): void
  /** 取消离页或失效页面尚未提交的普通提示。 */
  cancelPendingHints(): void
  /** 释放订阅和定时任务，拒绝迟到输入。 */
  dispose(): void
}

/** 仅投影展示事实；所有开窗、结束和资源命令仍由原采集控制器执行。 */
export function createFingertipDisplay(onStatus: (status: FingertipDisplayStatus | null) => void): FingertipDisplay {
  const initial = (): FingertipDisplaySnapshot => ({ coveragePercent: null, coverageReady: false, resourcesReleased: false, presentation: 'ready' })
  let display = initial()
  let status: FingertipDisplayStatus | null = null
  let latest: FingertipSnapshot | null = null
  let hintTimer: ReturnType<typeof setTimeout> | undefined
  let coverageTimer: ReturnType<typeof setTimeout> | undefined
  let candidate: FingertipPresentation | null = null
  let lastCoverageAt = -Infinity
  let hintsEnabled = true
  let disposed = false
  const listeners = new Set<() => void>()

  function publishStatus() {
    if (latest == null) return
    const next: FingertipDisplayStatus = {
      captureId: latest.captureId, phase: latest.phase,
      remainingSeconds: Math.max(0, Math.ceil(latest.remainingMillis / 1_000)),
      resourcesReleased: latest.resourcesReleased, errorCode: latest.errorCode, endReason: latest.endReason,
      presentation: display.presentation,
    }
    if (status != null && status.captureId === next.captureId && status.phase === next.phase
      && status.remainingSeconds === next.remainingSeconds && status.resourcesReleased === next.resourcesReleased
      && status.errorCode === next.errorCode && status.endReason === next.endReason && status.presentation === next.presentation) return
    status = next
    onStatus(next)
  }

  function publish(next: FingertipDisplaySnapshot) {
    if (next.coveragePercent !== display.coveragePercent || next.coverageReady !== display.coverageReady
      || next.resourcesReleased !== display.resourcesReleased || next.presentation !== display.presentation) {
      display = next
      for (const listener of listeners) listener()
    }
    publishStatus()
  }

  function cancelHints() {
    clearTimeout(hintTimer)
    hintTimer = undefined
    candidate = null
  }

  function flushCoverage() {
    coverageTimer = undefined
    if (latest == null || disposed) return
    lastCoverageAt = Date.now()
    const percent = latest.coveragePercent
    // 未知不变成 0；未完整覆盖不因异常输入或取整显示 100%。
    const coveragePercent = latest.coverageState === 'unknown' || percent == null || !Number.isFinite(percent)
      ? null : Math.max(0, Math.min(100, latest.coverageState !== 'complete' && percent >= 100 ? 99 : percent))
    publish({ ...display, coveragePercent, coverageReady: latest.coverageReady, resourcesReleased: latest.resourcesReleased })
  }

  function reset() {
    cancelHints()
    clearTimeout(coverageTimer)
    coverageTimer = undefined
    latest = null
    status = null
    lastCoverageAt = -Infinity
    hintsEnabled = true
    display = initial()
    onStatus(null)
    for (const listener of listeners) listener()
  }

  return {
    getSnapshot: () => display,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    update(snapshot: FingertipSnapshot) {
      if (disposed) return
      latest = snapshot
      const phaseChanged = status?.phase !== snapshot.phase || status?.resourcesReleased !== snapshot.resourcesReleased
      const next = getFingertipPresentation(snapshot)
      const critical = snapshot.phase !== 'observing'
      if (critical) {
        cancelHints()
        publish({ ...display, presentation: next })
      } else if (next === display.presentation || !hintsEnabled) {
        cancelHints()
      } else if (candidate !== next) {
        cancelHints()
        candidate = next
        hintTimer = setTimeout(() => {
          hintTimer = undefined
          candidate = null
          if (!disposed && hintsEnabled && latest?.phase === 'observing') publish({ ...display, presentation: next })
        }, 300)
      }
      // 固定最迟 250ms 提交最新覆盖，持续输入不会推迟尾沿；终态立即冻结真实末值。
      if (phaseChanged || Date.now() - lastCoverageAt >= 250) {
        clearTimeout(coverageTimer)
        flushCoverage()
      } else if (coverageTimer == null) {
        coverageTimer = setTimeout(flushCoverage, Math.max(0, 250 - (Date.now() - lastCoverageAt)))
      }
      publishStatus()
    },
    reset,
    cancelPendingHints() {
      hintsEnabled = false
      cancelHints()
    },
    dispose() {
      disposed = true
      cancelHints()
      clearTimeout(coverageTimer)
      coverageTimer = undefined
      listeners.clear()
    },
  }
}

