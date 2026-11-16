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
  return createContactDisplay(onStatus, getFingertipPresentation, 'observing')
}

