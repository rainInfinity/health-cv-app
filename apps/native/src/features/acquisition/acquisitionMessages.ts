/** 管理主动相机验证页面的本地化文案与安全错误映射。 */

import type zhCNTranslations from '@/app/i18n/locales/zh-CN.json'
import { defineFeatureMessages } from '@/app/i18n'

/** 主动采集界面当前使用的 JSON 文案形状。 */
export type AcquisitionMessageValues = typeof zhCNTranslations['acquisition/active']

/** 主动相机验证页面的功能文案。 */
export const acquisitionMessages = defineFeatureMessages('acquisition/active')

/** 按稳定错误码返回本地安全文案，不展示原生错误消息或堆栈。 */
export function localizeAcquisitionError(
  code: string | null | undefined,
  messages: AcquisitionMessageValues,
): string {
  const normalizedCode = code?.toUpperCase()
  if (normalizedCode == null || normalizedCode === 'UNKNOWN') return messages.errorUnknown
  if (normalizedCode.includes('PLATFORM_UNSUPPORTED')) return messages.errorPlatform
  if (normalizedCode.includes('PERMISSION')) return messages.errorPermission
  if (normalizedCode.includes('CAMERA_BUSY')) return messages.errorCameraBusy
  if (normalizedCode.includes('CAPABILITY')) return messages.errorCapability
  if (normalizedCode.includes('CAMERA_SELECTION')) return messages.errorCapability
  if (normalizedCode.includes('CONFIGURATION') || normalizedCode.includes('INVALID_CAMERA_CONFIG') || normalizedCode.includes('CAMERA_PARAMETER_UNSUPPORTED')) {
    return messages.errorConfiguration
  }
  if (normalizedCode.startsWith('FILE_') || normalizedCode.includes('ARTIFACT')) return messages.errorFile
  if (normalizedCode.includes('CAMERA') || normalizedCode.includes('TORCH')) return messages.errorCamera
  if (normalizedCode.includes('PPG') || normalizedCode.includes('PIXEL') || normalizedCode.includes('DATAHUB') || normalizedCode.includes('FRAME_METADATA')) {
    return messages.errorCapture
  }
  return messages.errorGeneric
}
