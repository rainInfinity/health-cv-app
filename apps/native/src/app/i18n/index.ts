/** 提供离线翻译注册、公共参数操作与 locale 感知格式化。 */

import { count, createI18n, formatter, params } from '@nanostores/i18n'
import type { Components, ComponentsJSON, ExtractTemplateParams, Messages, TranslationFunction, Translations, TranslationsJSON } from '@nanostores/i18n'

import { currentLocale } from './locale'
import type { AppLocale } from './resolveLocale'
import enUSTranslations from './locales/en-US.json'
import zhCNTranslations from './locales/zh-CN.json'

const translationCache: Record<AppLocale, Components> = {
  'zh-CN': zhCNTranslations,
  'en-US': enUSTranslations,
}

/** JSON 资源值会扩宽为 string；显式保留界面实际使用的插值参数契约。 */
type FeatureMessageParameters = {
  'pages/features': {
    minutesUnmeasured: { value: number }
    hoursUnmeasured: { value: number }
    daysUnmeasured: { value: number }
  },
  'pages/metric-detail': {
    minutesAgo: { value: number }
    hoursAgo: { value: number }
    daysAgo: { value: number }
  }
  'pages/auth': {
    showPassword: { field: string }
    hidePassword: { field: string }
  }
  'pages/permissions': {
    androidApi: { value: number }
  }
}

type MessageParametersFor<ComponentName extends string> =
  ComponentName extends keyof FeatureMessageParameters
    ? FeatureMessageParameters[ComponentName]
    : Record<never, never>

/** 将资源形状映射为运行时插值函数类型。 */
type ParameterizedMessages<
  Body extends TranslationsJSON,
  Parameters extends Record<string, Record<string, number | string>> = Record<never, never>,
> = {
  [Key in keyof Body]: Key extends keyof Parameters
    ? TranslationFunction<[Parameters[Key]], string>
    : Body[Key] extends string
      ? Body[Key] extends `${string}{${string}}${string}`
        ? TranslationFunction<[ExtractTemplateParams<Body[Key]>], string>
        : Body[Key]
      : Body[Key] extends TranslationsJSON
        ? ParameterizedMessages<Body[Key]>
        : never
} & Translations
/** 递归包装 JSON 中的参数文案，使不同语言复用相同的插值规则。 */
function parameterizeMessages<
  Body extends TranslationsJSON,
  Parameters extends Record<string, Record<string, number | string>> = Record<never, never>,
>(
  messages: Body,
): ParameterizedMessages<Body, Parameters> {
  return Object.fromEntries(
    Object.entries(messages).map(([key, value]) => [
      key,
      typeof value === 'string'
        ? /\{[A-Za-z][A-Za-z0-9]*\}/.test(value)
          ? params(value)
          : value
        : parameterizeMessages(value),
    ]),
  ) as ParameterizedMessages<Body, Parameters>
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
): Messages<
  ParameterizedMessages<
    (typeof zhCNTranslations)[ComponentName],
    MessageParametersFor<ComponentName>
  >
> {
  return i18n(
    componentName,
    parameterizeMessages<
      (typeof zhCNTranslations)[ComponentName],
      MessageParametersFor<ComponentName>
    >(zhCNTranslations[componentName]),
  )
}

/** 按当前 locale 格式化日期、数字和相对时间；单调时间不得传给 time。 */
export const format = formatter(currentLocale)

/** 支持带参数与数量规则的功能文案。 */
export { count, params }

/** 首发支持的界面语言。 */
export type { AppLocale }
