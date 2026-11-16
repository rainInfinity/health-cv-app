/** 血压放置指导仅适用于第一阶段；贴胸准备立刻撤销旧定时器。 */
import type { BloodPressureSnapshot } from '@health-cv-app/acquisition'

export function createBloodPressurePlacementReminder(onVisibilityChange: (visible: boolean) => void) {
  let captureId: string | null = null
  let shown = false
  let visible = false
  let disposed = false
  let phase: BloodPressureSnapshot['phase'] | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const clearTimer = () => { clearTimeout(timer); timer = undefined }
  const setVisible = (next: boolean) => {
    if (disposed || visible === next) return
    visible = next
    onVisibilityChange(next)
  }
  const reset = () => {
    clearTimer()
    captureId = null
    phase = null
    shown = false
    setVisible(false)
  }
  return {
    update(snapshot: Pick<BloodPressureSnapshot, 'captureId' | 'phase'>) {
      if (disposed) return
      if (captureId !== snapshot.captureId) { reset(); captureId = snapshot.captureId }
      phase = snapshot.phase
      if (phase !== 'observing_finger') { clearTimer(); setVisible(false); return }
      if (shown || timer != null) return
      const expected = captureId
      timer = setTimeout(() => {
        timer = undefined
        if (disposed || captureId !== expected || phase !== 'observing_finger') return
        shown = true
        setVisible(true)
      }, 15_000)
    },
    dismiss() { clearTimer(); shown = true; setVisible(false) },
    reset,
    dispose() { clearTimer(); disposed = true },
  }
}
