/** 按用户选择和设备首选顺序解析受支持的界面语言。 */

import type { Locale as DeviceLocale } from 'expo-localization'

import type { LanguagePreference } from '../preferences/types'

/** 当前随应用打包提供的文案语言。 */
export type AppLocale = 'zh-CN' | 'en-US'

/** Expo 语言对象中用于匹配支持语言的字段。 */
export type DeviceLanguage = Pick<DeviceLocale, 'languageCode' | 'languageTag'>

/** 显式选择优先；跟随系统时按首选顺序匹配中文或英语语言族。 */
export function resolveLocale(
  preference: LanguagePreference,
  locales: readonly DeviceLanguage[],
): AppLocale {
  if (preference !== 'system') return preference

  for (const locale of locales) {
    const languageTag = locale.languageCode ?? locale.languageTag
    const language = languageTag.split('-')[0].toLowerCase()
    if (language === 'zh') return 'zh-CN'
    if (language === 'en') return 'en-US'
  }

  return 'zh-CN'
}
