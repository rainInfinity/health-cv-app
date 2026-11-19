/** 保存设备级引导和声音提醒跳过标记，不代表相机授权或真实采集已开始。 */

import { persistentAtom } from '@nanostores/persistent'
import type { MeasurementMethod } from '@/app/navigation/types'

/** 固定方式独立存储，所有指尖指标共用同一个键。 */
const GUIDE_PREFERENCE_KEYS = {
  face: 'app.measurement-guide.face.skipped',
  fingertip: 'app.measurement-guide.fingertip.skipped',
  chest: 'app.measurement-guide.chest.skipped',
} as const satisfies Record<MeasurementMethod, string>

/** 只接受明确的 true，损坏内容不跳过准备。 */
export function decodeGuideSkipped(value: string): boolean {
  return value === 'true'
}

/** 在已注册的设备存储上创建三方式偏好；认证退出不持有这些 Store。 */
export function createMeasurementGuidePreferences() {
  const createPreference = (method: MeasurementMethod) => persistentAtom<boolean>(
    GUIDE_PREFERENCE_KEYS[method],
    false,
    { listen: false, decode: decodeGuideSkipped, encode: (value: boolean) => String(value) },
  )
  return {
    face: createPreference('face'),
    fingertip: createPreference('fingertip'),
    chest: createPreference('chest'),
  }
}

/** 贴胸动作指导独立于检测准备页，确认后保存，重启与退出账号均保留。 */
export function createChestPlacementGuidePreference() {
  return persistentAtom<boolean>(
    'app.measurement-guide.chest-placement.skipped',
    false,
    { listen: false, decode: decodeGuideSkipped, encode: (value: boolean) => String(value) },
  )
}
