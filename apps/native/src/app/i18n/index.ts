/** 提供离线翻译注册、公共参数操作与 locale 感知格式化。 */

import { count, createI18n, formatter, params } from '@nanostores/i18n'
import type { Components, ComponentsJSON, Messages, TranslationsJSON } from '@nanostores/i18n'

import { currentLocale } from './locale'
import type { AppLocale } from './resolveLocale'
import enUSTranslations from './locales/en-US.json'
import zhCNTranslations from './locales/zh-CN.json'

const translationCache: Record<AppLocale, Components> = {
  'zh-CN': zhCNTranslations,
  'en-US': enUSTranslations,
}
const i18n = createI18n(currentLocale, {
  baseLocale: 'zh-CN',
  cache: translationCache,
  get: async (locale, componentNames) => {
    const translations: ComponentsJSON = {}
    for (const componentName of componentNames) {
      const componentTranslations = translationCache[locale][componentName]
      if (componentTranslations == null) {
        throw new Error(`未注册 ${locale} 的本地化文案：${componentName}`)
      }
      translations[componentName] = componentTranslations as TranslationsJSON
    }
    return translations
  },
})

/** 注册功能对应的中文基准文案；其他语言从同命名空间 JSON 资源读取。 */
export function defineFeatureMessages<
  const ComponentName extends keyof typeof zhCNTranslations,
>(
  componentName: ComponentName,
): Messages<(typeof zhCNTranslations)[ComponentName]> {
  return i18n(componentName, zhCNTranslations[componentName])
}

/** 按当前 locale 格式化日期、数字和相对时间；单调时间不得传给 time。 */
export const format = formatter(currentLocale)

/** 支持带参数与数量规则的功能文案。 */
export { count, params }

/** 首发支持的界面语言。 */
export type { AppLocale }
