/** 只管理指尖本地展示的单调时钟与整轮模拟曲线，不接触任何设备或健康记录。 */

export type FingertipDisplayPhase = 'ready' | 'covering' | 'running' | 'completed'

/** 覆盖阶段只细分视觉提示，不增加采集或展示流程阶段。 */
export type FingertipPresentation = 'ready' | 'partial' | 'covered' | 'running' | 'completed'

/** 根据实际绘制进度选择提示，未满环时不能提前宣布覆盖完成。 */
export function getFingertipPresentation(phase: FingertipDisplayPhase, coverage: number): FingertipPresentation {
  if (phase !== 'covering') return phase
  return coverage >= 100 ? 'covered' : coverage >= 1 ? 'partial' : 'ready'
}

const COVERING_MS = 2_400
const COVER_CONFIRM_MS = 400
const RUNNING_MS = 30_000
const SAMPLE_RATE = 30
const REFRESH_MS = 50
const REDUCED_REFRESH_MS = 200

/** 本轮正式展示的完整模拟历史，按固定 30Hz 追加，不改写已有点。 */
export interface FingertipWave {
  /** 采样坐标：相对正式展示起点的毫秒数与任意单位模拟幅值。 */
  readonly points: readonly [number, number | null][]
  /** 曲线内容代次，页面仅更新快照，不复制完整历史。 */
  readonly revision: number
}

/** 百分比仅为演示进度，曲线不代表人体测量结果。 */
export interface FingertipDisplaySnapshot {
  /** 等待、模拟覆盖、独立倒计时或完成阶段。 */
  readonly phase: FingertipDisplayPhase
  /** 模拟覆盖百分比，范围 0–100，不是真实覆盖面积。 */
  readonly coverage: number
  /** 正式展示剩余毫秒数，不包含覆盖阶段。 */
  readonly remainingMs: number
  /** 正式展示已过毫秒数，不包含后台停留。 */
  readonly runningElapsedMs: number
  /** 本实例整轮三十秒内的模拟曲线。 */
  readonly wave: FingertipWave
}

/** 注入单调时钟与调度，便于直接验证真实阶段、暂停和销毁行为。 */
export interface FingertipDisplayOptions {
  /** 单调时钟，单位毫秒，不接受墙钟日期。 */
  now: () => number
  /** 延后执行单次回调，延迟单位毫秒。 */
  schedule: (callback: () => void, delayMs: number) => unknown
  /** 取消前一调度句柄。 */
  cancel: (handle: unknown) => void
  /** 可见状态变化时通知页面。 */
  onChange: (snapshot: FingertipDisplaySnapshot) => void
  /** 首次进入正式展示时切换至波形页。 */
  onRunning: () => void
  /** 初始是否可见；隐藏时不推进。 */
  active?: boolean
  /** 是否降低曲线刷新频率；不改变采样时刻和历史。 */
  reducedMotion?: boolean
}

/** 本页私有展示控制协议，不包含设备或存储操作。 */
export interface FingertipDisplayController {
  /** 读取当前阶段及本轮模拟历史，不推进时钟。 */
  getSnapshot: () => FingertipDisplaySnapshot
  /** 订阅同一批展示快照；取消订阅不影响采样或其他消费者。 */
  subscribeWave: (listener: (snapshot: FingertipDisplaySnapshot) => void) => () => void
  /** 仅首次实际布局完成后启动覆盖演示。 */
  layoutReady: () => void
  /** 暂停或恢复本地可见时间，不影响任何采集源。 */
  setActive: (active: boolean) => void
  /** 切换动态效果，不改变检测截止或完成后的曲线。 */
  setReducedMotion: (enabled: boolean) => void
  /** 销毁本实例并使所有迟到回调失效。 */
  dispose: () => void
}

/** 与 Demo 相同的模拟 PPG 轮廓，只用于本地绘图。 */
function pulseAt(seconds: number): number {
  const phase = ((seconds * 1.2) % 1 + 1) % 1
  return Math.exp(-(((phase - 0.24) / 0.105) ** 2))
    + 0.3 * Math.exp(-(((phase - 0.52) / 0.13) ** 2))
}

/** 页面每次挂载创建独立实例；销毁后所有迟到回调均失效。 */
export function createFingertipDisplay(options: FingertipDisplayOptions): FingertipDisplayController {
  const points: [number, number | null][] = []
  const waveListeners = new Set<(snapshot: FingertipDisplaySnapshot) => void>()
  let phase: FingertipDisplayPhase = 'ready'
  let active = options.active ?? true
  let reducedMotion = options.reducedMotion ?? false
  let disposed = false
  let laidOut = false
  let clock = options.now()
  let elapsed = 0
  let runningStart = 0
  let runningElapsedMs = 0
  let coverage = 0
  let revision = 0
  let lastSample = -1
  let timer: unknown
  let scheduled = false
  let timerGeneration = 0

  function snapshot(): FingertipDisplaySnapshot {
    return {
      phase,
      coverage,
      remainingMs: RUNNING_MS - runningElapsedMs,
      runningElapsedMs,
      wave: { points, revision },
    }
  }

  /** 页面摘要与波形消费者共用同一快照，不为订阅者复制完整历史。 */
  function publish() {
    const next = snapshot()
    options.onChange(next)
    waveListeners.forEach((listener) => listener(next))
  }

  function clearTimer() {
    timerGeneration += 1
    if (scheduled) options.cancel(timer)
    scheduled = false
  }

  function drawWave() {
    const target = Math.floor(runningElapsedMs * SAMPLE_RATE / 1_000)
    if (target <= lastSample) return
    // 采样只取决于本轮前台时间；迟到回调也要补齐全部稳定采样点。
    for (let sample = lastSample + 1; sample <= target; sample += 1) {
      const seconds = sample / SAMPLE_RATE
      points.push([sample * 1_000 / SAMPLE_RATE, pulseAt(seconds)])
    }
    lastSample = target
    revision += 1
  }

  function advance() {
    const nextClock = Math.max(clock, options.now())
    if (active && laidOut && phase !== 'completed') elapsed += nextClock - clock
    clock = nextClock
    if (!laidOut || !active) return
    if (phase === 'covering') {
      coverage = Math.min(100, Math.floor(elapsed / COVERING_MS * 100))
      if (elapsed >= COVERING_MS + COVER_CONFIRM_MS) {
        phase = 'running'
        runningStart = elapsed
        options.onRunning()
      }
    }
    if (phase === 'running') {
      runningElapsedMs = Math.min(RUNNING_MS, elapsed - runningStart)
      drawWave()
      if (runningElapsedMs >= RUNNING_MS) phase = 'completed'
    }
  }

  function queue() {
    if (disposed || !active || !laidOut || phase === 'completed' || scheduled) return
    scheduled = true
    const refreshMs = reducedMotion && phase === 'running' ? REDUCED_REFRESH_MS : REFRESH_MS
    const delayMs = phase === 'running' ? Math.min(refreshMs, RUNNING_MS - runningElapsedMs) : refreshMs
    const generation = timerGeneration
    timer = options.schedule(() => {
      if (disposed || !active || generation !== timerGeneration) return
      scheduled = false
      advance()
      publish()
      queue()
    }, delayMs)
  }

  return {
    getSnapshot: snapshot,
    /** 新消费者主动读取当前快照，后续发布不改变原有页面通知契约。 */
    subscribeWave(listener) {
      if (!disposed) waveListeners.add(listener)
      return () => { waveListeners.delete(listener) }
    },
    /** 完成实际布局后才推进，初始渲染始终为准备态、零覆盖及空曲线。 */
    layoutReady() {
      if (disposed || laidOut) return
      laidOut = true
      clock = options.now()
      phase = 'covering'
      publish()
      queue()
    },
    /** 后台与页面失焦只暂停本实例，不触碰其他采集源。 */
    setActive(next: boolean) {
      if (disposed || active === next) return
      advance()
      active = next
      clock = Math.max(clock, options.now())
      clearTimer()
      publish()
      queue()
    },
    /** 仅调整刷新频率，保留此前全部样本及同一倒计时时钟。 */
    setReducedMotion(next: boolean) {
      if (disposed || phase === 'completed' || reducedMotion === next) return
      advance()
      reducedMotion = next
      clearTimer()
      publish()
      queue()
    },
    dispose() {
      if (disposed) return
      disposed = true
      clearTimer()
      waveListeners.clear()
    },
  }
}
