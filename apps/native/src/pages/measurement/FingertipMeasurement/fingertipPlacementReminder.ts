/** 仅在真实覆盖观测后安排一次放置指导，不参与覆盖门控或正式计时。 */

import type { FingertipSnapshot } from '@health-cv-app/acquisition'

/** 以原生轮次和阶段控制十五秒提醒，调用方负责页面与前台资格。 */
export function createFingertipPlacementReminder(onVisibilityChange: (visible: boolean) => void) {
  let captureId: string | null = null
  let shown = false
  let visible = false
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined

  /** 清除尚未显示的本轮提醒。 */
  function clearTimer() {
    clearTimeout(timer)
    timer = undefined
  }

  /** 只在可见性变化时通知页面，不消费逐帧覆盖值。 */
  function setVisible(next: boolean) {
    if (disposed || visible === next) return
    visible = next
    onVisibilityChange(next)
  }

  /** 重试、离页或后台时撤销旧轮计时与弹窗。 */
  function reset() {
    clearTimer()
    captureId = null
    shown = false
    setVisible(false)
  }

  return {
    /** 部分覆盖和开始准备不重置等待；首次进入真实观测才启动计时。 */
    update(snapshot: Pick<FingertipSnapshot, 'captureId' | 'phase'>) {
      if (disposed) return
      if (captureId !== snapshot.captureId) {
        reset()
        captureId = snapshot.captureId
      }
      if (snapshot.phase !== 'observing' && snapshot.phase !== 'starting') {
        clearTimer()
        shown = true
        setVisible(false)
        return
      }
      if (shown || timer != null || snapshot.phase !== 'observing') return
      const expectedId = captureId
      timer = setTimeout(() => {
        timer = undefined
        if (disposed || captureId !== expectedId) return
        shown = true
        setVisible(true)
      }, 15_000)
    },
    /** 确认只收起指导，同一轮不再重复弹出。 */
    dismiss() {
      clearTimer()
      shown = true
      setVisible(false)
    },
    reset,
    /** 卸载后不再接纳状态或发送可见性变化。 */
    dispose() {
      clearTimer()
      disposed = true
    },
  }
}
