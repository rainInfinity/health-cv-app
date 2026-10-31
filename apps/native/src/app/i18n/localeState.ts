/** 组合持久语言选择和系统语言源，提供可刷新的派生 locale。 */

import { atom, computed } from 'nanostores'
import type { ReadableAtom } from 'nanostores'

import type { LanguagePreference } from '../preferences/types'
import { resolveLocale } from './resolveLocale'
import type { AppLocale, DeviceLanguage } from './resolveLocale'

/** 包含最终界面语言和刷新系统来源操作的只读状态。 */
export interface LocaleState {
  /** 由持久选择与系统语言列表派生的当前 locale。 */
  currentLocale: ReadableAtom<AppLocale>
  /** 重读系统首选语言列表，不写入持久选择。 */
  refreshSystemLocales(): void
}

/** 从选择 Store 和系统读取函数创建唯一派生 locale 状态。 */
export function createLocaleState(
  preference: ReadableAtom<LanguagePreference>,
  readDeviceLocales: () => readonly DeviceLanguage[],
): LocaleState {
  const deviceLocales = atom<readonly DeviceLanguage[]>(readDeviceLocales())
  const currentLocale = computed(
    [preference, deviceLocales],
    (selected, locales): AppLocale => resolveLocale(selected, locales),
  )

  return {
    currentLocale,
    refreshSystemLocales() {
      deviceLocales.set(readDeviceLocales())
    },
  }
}
