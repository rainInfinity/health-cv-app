/** 管理单一 Toast 计时器及替换期间的过期回调隔离。 */

/** Toast 可以表达的非健康评估操作状态。 */
export type FeedbackTone = 'success' | 'error' | 'loading' | 'information'

/** 描述用于确定性验证的最小计时器接口。 */
export interface ToastTimerScheduler {
  /** 安排一次延迟回调并返回可取消句柄。 */
  setTimeout: typeof setTimeout
  /** 取消尚未执行的延迟回调。 */
  clearTimeout: typeof clearTimeout
}

/** 描述单条 Toast 的计时行为输入。 */
export interface ToastTimerRequest {
  /** 每次展示唯一递增的提示序号。 */
  id: number
  /** 加载状态保持，其他状态按时自动关闭。 */
  tone: FeedbackTone
  /** 自动关闭时长；成功默认1500毫秒，错误和信息默认3500毫秒。 */
  durationMs?: number
}

/** 以序号屏蔽已被替换的提示回调，并保持最多一个计时器。 */
export class SingleToastLifecycle {
  private timer: ReturnType<typeof setTimeout> | null = null
  private activeId: number | null = null

  /** 允许注入确定性计时器，其余运行时使用标准全局计时器。 */
  constructor(private readonly scheduler: ToastTimerScheduler = { setTimeout, clearTimeout }) {}

  /** 展示一条 Toast 并取消上一条普通状态的计时。 */
  replace(request: ToastTimerRequest, onExpire: (id: number) => void): void {
    this.clearTimer()
    this.activeId = request.id
    if (request.tone === 'loading') return

    this.timer = this.scheduler.setTimeout(() => {
      if (this.activeId !== request.id) return
      this.timer = null
      this.activeId = null
      onExpire(request.id)
    }, request.durationMs ?? (request.tone === 'success' ? 1500 : 3500))
  }

  /** 显式结束当前提示并使已排队的旧回调失效。 */
  dismiss(): void {
    this.clearTimer()
    this.activeId = null
  }

  /** 卸载主机时释放当前计时器。 */
  dispose(): void {
    this.dismiss()
  }

  /** 取消唯一计时器。 */
  private clearTimer(): void {
    if (this.timer == null) return
    this.scheduler.clearTimeout(this.timer)
    this.timer = null
  }
}
