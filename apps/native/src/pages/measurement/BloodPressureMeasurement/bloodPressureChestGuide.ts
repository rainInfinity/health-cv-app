/** 仅按本轮真实贴胸准备阶段展示一次指导，不参与联合准入或检测计时。 */
import type { BloodPressureSnapshot } from '@health-cv-app/acquisition'

/** 每轮首次等待贴胸才读取设备偏好；取消后旧轮快照不能重新打开指导。 */
export function createBloodPressureChestGuide(onVisibilityChange: (visible: boolean) => void, isSkipped: () => boolean) {
  let captureId: string | null = null
  let shown = false
  let visible = false
  let cancelled = false

  /** 仅在可见性改变时通知页面，不消费覆盖数值。 */
  function setVisible(next: boolean) {
    if (visible === next) return
    visible = next
    onVisibilityChange(next)
  }

  return {
    /** 重复准备快照和同轮覆盖失效后重新贴胸都不重复提示。 */
    update(snapshot: Pick<BloodPressureSnapshot, 'captureId' | 'phase'>) {
      if (cancelled) return
      if (captureId == null) captureId = snapshot.captureId
      if (captureId !== snapshot.captureId) return
      if (snapshot.phase !== 'awaiting_chest' && snapshot.phase !== 'starting') {
        setVisible(false)
        return
      }
      if (shown) return
      shown = true
      if (!isSkipped()) setVisible(true)
    },
    /** 确认只收起指导，不改变原生阶段或下次提示偏好。 */
    dismiss() { setVisible(false) },
    /** 后台、离页或失败同步撤销旧轮提示资格。 */
    cancel() { cancelled = true; setVisible(false) },
    /** 仅在建立新的明确检测入口时重置。 */
    reset() { captureId = null; shown = false; cancelled = false; setVisible(false) },
  }
}
