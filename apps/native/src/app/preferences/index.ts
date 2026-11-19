/** 注册设备存储后创建唯一的语言、引导与提示偏好 Store。 */

import { persistentAtom } from '@nanostores/persistent'

import { initializePersistentStorage } from '../storage/mmkv'
import { decodeLanguagePreference } from './types'
import type { LanguagePreference } from './types'
import { createChestPlacementGuidePreference, createMeasurementGuidePreferences } from './measurementGuide'

initializePersistentStorage()

/** 持久保留的语言选择；无记录或内容无效时默认简体中文。 */
export const languagePreference = persistentAtom<LanguagePreference>(
  'app.language-preference',
  'zh-CN',
  {
    listen: false,
    decode: decodeLanguagePreference,
    encode: (value: LanguagePreference) => value,
  },
)
/** 设备级引导完成标记；退出账号不清除该偏好。 */
export const onboardingCompleted = persistentAtom<boolean>(
  'app.onboarding-completed',
  false,
  {
    listen: false,
    decode: (value: string) => value === 'true',
    encode: (value: boolean) => String(value),
  },
)

/** 三种检测方式的准备跳过偏好；不随账号退出清除。 */
export const measurementGuideSkipped = createMeasurementGuidePreferences()

/** 血压贴胸动作指导的独立跳过偏好，不影响检测准备或账号状态。 */
export const chestPlacementGuideSkipped = createChestPlacementGuidePreference()

export type { LanguagePreference } from './types'
