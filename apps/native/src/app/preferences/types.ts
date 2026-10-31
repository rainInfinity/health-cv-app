/** 描述设备保存的语言选择及其持久化解码规则。 */

/** 语言设置选择；`system` 保留跟随系统的语义。 */
export type LanguagePreference = 'zh-CN' | 'en-US' | 'system'

/** 将持久化内容限制为支持的选择，未知值回退为简体中文。 */
export function decodeLanguagePreference(value: string): LanguagePreference {
  if (value === 'zh-CN' || value === 'en-US' || value === 'system') return value
  return 'zh-CN'
}
