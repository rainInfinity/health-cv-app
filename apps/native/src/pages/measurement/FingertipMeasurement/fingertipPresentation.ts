/** 只映射真实原生阶段与覆盖，不读取动画终值或自建截止时钟。 */

import type { FingertipSnapshot } from '@health-cv-app/acquisition'
import { createContactDisplay } from '../ContactMeasurement/contactPresentation'
import type { ContactDisplay, ContactDisplaySnapshot, ContactDisplayStatus } from '../ContactMeasurement/contactPresentation'

/** 沿用产品状态区域，补齐真实收尾与中断。 */
export type FingertipPresentation = 'ready' | 'partial' | 'covered' | 'running' | 'stopping' | 'completed' | 'interrupted' | 'failed'

/** 完整覆盖只提示保持稳定；正式检测和完成只认原生窗口及释放事实。 */
export function getFingertipPresentation(snapshot: Pick<FingertipSnapshot, 'phase' | 'coverageState' | 'resourcesReleased'> | null): FingertipPresentation {
  if (snapshot == null) return 'ready'
  if (snapshot.phase === 'capturing') return 'running'
  if (snapshot.phase === 'completed') return snapshot.resourcesReleased ? 'completed' : 'stopping'
  if (snapshot.phase === 'stopping' || snapshot.phase === 'failed' || snapshot.phase === 'interrupted') return snapshot.phase
  if (snapshot.phase === 'starting' || snapshot.coverageState === 'complete') return 'covered'
  return snapshot.coverageState === 'partial' ? 'partial' : 'ready'
}


export type FingertipDisplayStatus = ContactDisplayStatus<FingertipSnapshot['phase']>
export type FingertipDisplaySnapshot = ContactDisplaySnapshot
export type FingertipDisplay = ContactDisplay<FingertipSnapshot['phase']>

/** 指尖保留自己的阶段映射，不掺入血压准入。 */
export function createFingertipDisplay(onStatus: (status: FingertipDisplayStatus | null) => void): FingertipDisplay {
  const display = createContactDisplay<FingertipSnapshot['phase']>(onStatus, getFingertipPresentation, 'observing')
  let lastObservation: Parameters<FingertipDisplay['update']>[0] | null = null
  return {
    ...display,
    /** 收尾后原生不再评估覆盖，保留同轮最后真实值，不将释放后的未知覆盖当成新观测。 */
    update(snapshot) {
      if (lastObservation?.captureId !== snapshot.captureId) lastObservation = null
      const ending = snapshot.phase === 'stopping' || snapshot.phase === 'completed'
      if (!ending || snapshot.coverageState !== 'unknown') lastObservation = snapshot
      display.update(ending && snapshot.coverageState === 'unknown' && lastObservation != null
        ? { ...snapshot, coveragePercent: lastObservation.coveragePercent, coverageState: lastObservation.coverageState, coverageReady: lastObservation.coverageReady }
        : snapshot)
    },
    /** 明确新轮不继承旧轮覆盖。 */
    reset() { lastObservation = null; display.reset() },
    /** 释放展示订阅和本轮末值。 */
    dispose() { lastObservation = null; display.dispose() },
  }
}

