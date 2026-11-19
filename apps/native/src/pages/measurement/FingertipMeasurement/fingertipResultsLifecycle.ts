/** 结果等待只消费正常收尾事实，不参与原生计时、语音或健康结果计算。 */
import type { FingertipSnapshot } from '@health-cv-app/acquisition'

/** 页面消费的独立结果展示状态，不替代原生采集阶段。 */
export interface FingertipResultState {
  /** 未取得资格、等待展示和结果可用三个阶段。 */
  phase: 'idle' | 'waiting' | 'available'
  /** 已进入结果等待的真实轮次；未取得资格时为空。 */
  captureId: string | null
  /** 简要结果是否展开，与结果可用资格分别管理。 */
  expanded: boolean
}

/** 可控单调时钟仅累计结果展示的前台可见时间。 */
export interface FingertipResultScheduler {
  /** 返回单调递增的毫秒时间，用于计算已累计的可见时长。 */
  now(): number
  /** 安排剩余展示等待，返回可取消的计时句柄。 */
  setTimeout(callback: () => void, delayMillis: number): unknown
  /** 取消尚未交付的回调；已排队回调仍由代次校验拦截。 */
  clearTimeout(handle: unknown): void
}

/** 正式运行使用宿主单调时钟和计时器，不读取原生检测倒计时。 */
const systemScheduler: FingertipResultScheduler = {
  /** 读取当前宿主单调毫秒时间。 */
  now: () => performance.now(),
  /** 使用宿主计时器安排一次展示回调。 */
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  /** 释放宿主计时句柄，避免不可见页面继续等待。 */
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/** 结果资格所需的最小原生事实，不接收采样或文件内容。 */
type ResultSnapshot = Pick<FingertipSnapshot, 'captureId' | 'phase' | 'resourcesReleased' | 'endReason' | 'errorCode'>

/**
 * 创建页面私有结果生命周期；新轮、退出和卸载都会撤销旧资格。
 * @param onChange 仅在展示状态变化且实例未释放时通知页面。
 * @param scheduler 累计可见展示时间的单调时钟与可取消计时器。
 */
export function createFingertipResultsLifecycle(
  onChange: (state: FingertipResultState) => void,
  scheduler: FingertipResultScheduler = systemScheduler,
) {
  let state: FingertipResultState = { phase: 'idle', captureId: null, expanded: false }
  let captureId: string | null = null
  let eligible = false
  let visible = false
  let disposed = false
  let detailRequested = false
  let remaining = 3000
  let startedAt: number | null = null
  let timer: unknown = null
  let timerGeneration = 0

  /** 合并相同展示状态，释放后仍清理内部快照但不再通知页面。 */
  function publish(next: FingertipResultState) {
    if (state.phase === next.phase && state.captureId === next.captureId && state.expanded === next.expanded) return
    state = next
    if (!disposed) onChange(state)
  }

  /** 累计本段实际可见时长，并使旧计时回调代次立即失效。 */
  function pause() {
    timerGeneration += 1
    if (timer != null) scheduler.clearTimeout(timer)
    timer = null
    if (startedAt != null) remaining = Math.max(0, remaining - Math.max(0, scheduler.now() - startedAt))
    startedAt = null
  }

  /** 仅为有效且可见的等待阶段安排剩余时间，到期自动展开一次。 */
  function schedule() {
    if (disposed || !eligible || !visible || state.phase !== 'waiting' || timer != null) return
    startedAt = scheduler.now()
    const expectedGeneration = ++timerGeneration
    timer = scheduler.setTimeout(() => {
      if (disposed || expectedGeneration !== timerGeneration || !visible || !eligible || state.phase !== 'waiting') return
      pause()
      if (remaining > 0) { schedule(); return }
      publish({ phase: 'available', captureId, expanded: true })
    }, remaining)
  }

  /** 同步撤销当前轮次、详情交接和等待计时，使迟到通知无法恢复。 */
  function cancel() {
    pause()
    eligible = false
    captureId = null
    detailRequested = false
    remaining = 3000
    publish({ phase: 'idle', captureId: null, expanded: false })
  }

  return {
    /** 读取当前只读消费快照，不触发展示或原生操作。 */
    getSnapshot: () => state,
    /** 轮次来自真实启动确认，迟到的其他 captureId 不得自行创建资格。 */
    begin(id: string) {
      if (disposed) return
      cancel()
      captureId = id
      eligible = true
    },
    /** 消费同轮正常目标完成及资源屏障；失败立即撤销结果资格。 */
    update(snapshot: ResultSnapshot) {
      if (disposed || !eligible || snapshot.captureId !== captureId) return
      if (snapshot.errorCode != null || snapshot.phase === 'failed' || snapshot.phase === 'interrupted') { cancel(); return }
      if (snapshot.phase !== 'completed' || !snapshot.resourcesReleased || snapshot.endReason !== 'duration_reached') return
      if (state.phase !== 'idle') return
      publish({ phase: 'waiting', captureId, expanded: false })
      schedule()
    },
    /** 后台及详情不可见时暂停，不撤销已正常结束轮次。 */
    setVisible(next: boolean) {
      if (disposed || visible === next) return
      visible = next
      if (visible) schedule()
      else pause()
    },
    /** 用户主动展开当前已可用结果，不重新等待或创建新轮。 */
    openResults() {
      if (eligible && state.phase === 'available') publish({ ...state, expanded: true })
    },
    /** 仅收起面板并保留同轮可用资格，重复完成通知不会自动重开。 */
    closeResults() {
      if (eligible && state.phase === 'available') publish({ ...state, expanded: false })
    },
    /** 先登记一次明确详情交接，导航参数仅携带当前轮次身份。 */
    enterDetails(): string | null {
      if (disposed || !visible || !eligible || state.phase !== 'available' || captureId == null) return null
      detailRequested = true
      return captureId
    },
    /** 只有明确同轮详情目标才能绕过普通失焦的展示清理。 */
    retainOnBlur(route: { name: string; params?: unknown } | undefined): boolean {
      const params = route?.params
      const matched = detailRequested && eligible && state.phase === 'available' && route?.name === 'FingertipResults'
        && params != null && typeof params === 'object' && 'captureId' in params && params.captureId === captureId
      detailRequested = false
      return matched
    },
    /** 从本轮详情返回时重新展开可用结果，不重新采集或累计等待。 */
    resume() {
      detailRequested = false
      if (eligible && state.phase === 'available') publish({ ...state, expanded: true })
    },
    cancel,
    /** 卸载时永久停用实例，清理资格且不向已卸载页面发送状态。 */
    dispose() {
      disposed = true
      cancel()
    },
  }
}
