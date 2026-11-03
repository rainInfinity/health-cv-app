/** 管理开屏单次等待、前后台暂停和首次引导完成结果。 */

/** 开屏结束后的唯一可选目标。 */
export type StartupDestination = 'passive-capture' | 'onboarding' | 'product'

/** 注入可控时钟与计时器，以确定性验证前后台切换。 */
export interface StartupTimerScheduler {
  /** 读取当前毫秒时间，供剩余时长计算。 */
  now(): number
  /** 安排一个延迟回调并返回可取消句柄。 */
  setTimeout(callback: () => void, delayMs: number): unknown
  /** 取消指定延迟回调。 */
  clearTimeout(handle: unknown): void
}

/** 描述普通应用启动所需的品牌页可见时间。 */
export const STARTUP_VISIBLE_DURATION_MS = 2000

/** 使用当前毫秒时间估算前台剩余时长，并由系统计时器调度回调。 */
const SYSTEM_SCHEDULER: StartupTimerScheduler = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/** 根据单次启动 URL 和本地设备标记选择开屏后目标。 */
export function resolveStartupDestination(
  initialUrl: string | null,
  onboardingCompleted: boolean,
): StartupDestination {
  if (initialUrl != null && /^healthcvapp:\/\/passive-capture(?:[/?#]|$)/i.test(initialUrl)) {
    return 'passive-capture'
  }
  return onboardingCompleted ? 'product' : 'onboarding'
}

/** 记录设备级引导完成标记，并如实返回存储是否成功。 */
export function recordOnboardingCompletion(writePreference: () => void): boolean {
  try {
    writePreference()
    return true
  } catch {
    return false
  }
}

/** 在前台累计指定时长后只完成一次，并支持后台暂停。 */
export class StartupDelay {
  private state: 'idle' | 'active' | 'background' | 'completed' | 'disposed' = 'idle'
  private remainingMs: number
  private deadline = 0
  private timer: unknown = null
  private generation = 0

  /** 创建具备注入计时器的单次开屏延迟。 */
  constructor(
    private readonly onComplete: () => void,
    private readonly durationMs = STARTUP_VISIBLE_DURATION_MS,
    private readonly scheduler: StartupTimerScheduler = SYSTEM_SCHEDULER,
  ) {
    this.remainingMs = Math.max(0, durationMs)
  }

  /** 从品牌页首次可见时开始；若已在后台则等待返回前台。 */
  start(isForeground = true): void {
    if (this.state !== 'idle') return
    this.state = isForeground ? 'active' : 'background'
    if (isForeground) this.schedule()
  }

  /** 后台暂停剩余时间，回到前台后续跑而不重置。 */
  setForeground(isForeground: boolean): void {
    if (this.state === 'active' && !isForeground) {
      this.remainingMs = Math.max(0, this.deadline - this.scheduler.now())
      this.invalidateTimer()
      this.state = 'background'
      return
    }
    if (this.state === 'background' && isForeground) {
      if (this.remainingMs === 0) {
        this.complete()
      } else {
        this.state = 'active'
        this.schedule()
      }
    }
  }

  /** 卸载启动页时释放计时器，阻止迟到回调导航。 */
  dispose(): void {
    if (this.state === 'completed' || this.state === 'disposed') return
    this.invalidateTimer()
    this.state = 'disposed'
  }

  /** 安排剩余可见时间，并仅接受当前计时代次的回调。 */
  private schedule(): void {
    if (this.remainingMs === 0) {
      this.complete()
      return
    }
    const generation = ++this.generation
    this.deadline = this.scheduler.now() + this.remainingMs
    this.timer = this.scheduler.setTimeout(() => {
      if (this.state !== 'active' || generation !== this.generation) return
      this.timer = null
      this.remainingMs = 0
      this.complete()
    }, this.remainingMs)
  }

  /** 只在当前进程内完成一次并使后续计时器回调失效。 */
  private complete(): void {
    if (this.state === 'completed' || this.state === 'disposed') return
    this.invalidateTimer()
    this.state = 'completed'
    this.onComplete()
  }

  /** 清理计时器并增加代次，忽略已经排队的旧回调。 */
  private invalidateTimer(): void {
    this.generation += 1
    if (this.timer == null) return
    this.scheduler.clearTimeout(this.timer)
    this.timer = null
  }
}
