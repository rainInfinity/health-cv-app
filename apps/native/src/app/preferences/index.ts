/** 注册持久化引擎后创建唯一的语言选择 Store。 */

import { persistentAtom } from '@nanostores/persistent'

import { initializePersistentStorage } from '../storage/mmkv'
import { decodeLanguagePreference } from './types'
import type { LanguagePreference } from './types'

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

export type { LanguagePreference } from './types'
