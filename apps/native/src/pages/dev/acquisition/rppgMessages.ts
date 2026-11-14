/** 管理主动 RPPG 页面本地化文案和稳定错误码映射。 */

import type zhCNTranslations from '@/app/i18n/locales/zh-CN.json'
import { defineFeatureMessages } from '@/app/i18n'

/** 主动 RPPG 页面使用的本地化文案形状。 */
export type RPPGMessageValues = typeof zhCNTranslations['acquisition/rppg']

/** 主动 RPPG 验证页面的功能文案。 */
export const rppgMessages = defineFeatureMessages('acquisition/rppg')

/** 按稳定错误码返回安全文案，不把原生错误消息直接显示给用户。 */
export function localizeRPPGError(
  code: string | null | undefined,
  messages: RPPGMessageValues,
): string {
  const normalizedCode = code?.toUpperCase()
  if (normalizedCode == null || normalizedCode === 'UNKNOWN') return messages.errorUnknown
  if (normalizedCode.includes('PLATFORM_UNSUPPORTED')) return messages.errorPlatform
  if (normalizedCode.includes('PERMISSION')) return messages.errorPermission
  if (normalizedCode.includes('CAMERA_BUSY')) return messages.errorCameraBusy
  if (normalizedCode.includes('PREVIEW_UNAVAILABLE') || normalizedCode.includes('ACTIVITY_UNAVAILABLE')) {
    return messages.errorPreview
  }
  if (normalizedCode.includes('INVALID_STATE') || normalizedCode.includes('RUNTIME_CLOSED')) {
    return messages.errorState
  }
  if (normalizedCode.includes('FILE') || normalizedCode.includes('ARTIFACT') || normalizedCode.includes('DATAHUB')) {
    return messages.errorFile
  }
  if (normalizedCode.includes('MODEL') || normalizedCode.includes('FACE') || normalizedCode.includes('RPPG')) {
    return messages.errorProcessing
  }
  if (normalizedCode.includes('CAMERA')) return messages.errorCamera
  return messages.errorGeneric
}
