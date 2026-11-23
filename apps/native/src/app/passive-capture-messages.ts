/** 注册产品和开发共用的被动采集知情说明及安全失败文案。 */

import { defineFeatureMessages } from '@/app/i18n'

/** 两个入口使用同一份真实服务交互资源。 */
export const passiveCaptureMessages = defineFeatureMessages('acquisition/passive')

/** 安全错误映射只接收用户可见的本地资源，不展示底层异常。 */
interface PassiveCaptureErrorMessages {
  errorPlatform: string
  errorPermission: string
  errorCameraBusy: string
  errorService: string
  errorConfiguration: string
  errorFile: string
  errorCamera: string
  errorGeneric: string
}

/** 按稳定错误码选择安全文案，不回显底层异常消息。 */
export function localizePassiveCaptureError(code: string, messages: PassiveCaptureErrorMessages): string {
  const normalizedCode = code.toUpperCase()
  if (normalizedCode === 'PLATFORM_UNSUPPORTED') return messages.errorPlatform
  if (normalizedCode.includes('PERMISSION') || normalizedCode.includes('NOTIFICATION')) return messages.errorPermission
  if (normalizedCode.includes('CAMERA_BUSY')) return messages.errorCameraBusy
  if (normalizedCode.includes('FOREGROUND_SERVICE') || normalizedCode.includes('SERVICE') || normalizedCode.includes('STOP')) return messages.errorService
  if (normalizedCode.includes('CONFIG') || normalizedCode.includes('INVALID') || normalizedCode.includes('INTERVAL') || normalizedCode.includes('DURATION')) return messages.errorConfiguration
  if (normalizedCode.includes('FILE') || normalizedCode.includes('VIDEO') || normalizedCode.includes('ARTIFACT') || normalizedCode.includes('ENCOD')) return messages.errorFile
  if (normalizedCode.includes('CAMERA')) return messages.errorCamera
  return messages.errorGeneric
}

/** 权限、通知或后台服务限制可以由用户进入应用设置处理。 */
export function canOpenPassiveCaptureSettings(code: string | null): boolean {
  if (code == null) return false
  const normalizedCode = code.toUpperCase()
  return normalizedCode.includes('PERMISSION') || normalizedCode.includes('NOTIFICATION')
    || normalizedCode.includes('SERVICE') || normalizedCode.includes('STOP')
}
