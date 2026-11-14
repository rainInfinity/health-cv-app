/** 提供面部产品页文案及稳定错误码的安全中文说明。 */

import { defineFeatureMessages } from '@/app/i18n'
import type zhCNTranslations from '@/app/i18n/locales/zh-CN.json'

/** 面部产品页的本地化资源。 */
export const faceMeasurementMessages = defineFeatureMessages('pages/face-measurement')

/** 面部产品页可显示的文案形状。 */
export type FaceMeasurementMessages = typeof zhCNTranslations['pages/face-measurement']

/** 不向用户透出原生异常内容，保留可执行的恢复提示。 */
export function localizeFaceMeasurementError(code: string, messages: FaceMeasurementMessages): string {
  const normalized = code.toUpperCase()
  if (normalized.includes('PERMISSION')) return messages.errorPermission
  if (normalized.includes('BUSY')) return messages.errorBusy
  if (normalized.includes('PREVIEW') || normalized.includes('ACTIVITY')) return messages.errorPreview
  if (normalized.includes('PLATFORM')) return messages.errorPlatform
  if (normalized.includes('FILE') || normalized.includes('ARTIFACT') || normalized.includes('DATAHUB')) return messages.errorFile
  if (normalized.includes('MODEL')) return messages.errorModel
  if (normalized.includes('CAMERA')) return messages.errorCamera
  return messages.errorGeneric
}
