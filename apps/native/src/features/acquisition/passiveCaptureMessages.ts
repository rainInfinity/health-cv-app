/** 管理被动录像页面的本地化文案、状态原因和安全错误映射。 */

import type { PassiveCaptureState } from '@health-cv-app/acquisition'
import type zhCNTranslations from '@/app/i18n/locales/zh-CN.json'
import { defineFeatureMessages } from '@/app/i18n'

type PassiveCaptureMessageValues = typeof zhCNTranslations['acquisition/passive']

/** 被动录像原生状态对应的本地化文案键。 */
const stateMessageKeys: Record<PassiveCaptureState, keyof PassiveCaptureMessageValues> = {
  disabled: 'stateDisabled',
  starting: 'stateStarting',
  waiting: 'stateWaiting',
  recording: 'stateRecording',
  stopping: 'stateStopping',
  failed: 'stateFailed',
}

/** 已知原生事件原因对应的本地化文案键。 */
const reasonMessageKeys: Record<string, keyof PassiveCaptureMessageValues> = {
  WAITING_FOR_UNLOCK: 'reasonWaitingForUnlock',
  CONFIGURATION_SAVED: 'reasonConfigurationSaved',
  SERVICE_START_REQUESTED: 'reasonServiceStartRequested',
  UNLOCK_TRIGGERED: 'reasonUnlockTriggered',
  VIDEO_STARTED: 'reasonVideoStarted',
  CYCLE_NOT_ELAPSED: 'reasonCycleNotElapsed',
  CAPTURE_BUSY: 'reasonCaptureBusy',
  CAMERA_BUSY: 'reasonCameraBusy',
  VIDEO_COMPLETED: 'reasonVideoCompleted',
  SCREEN_LOCKED: 'reasonScreenLocked',
  USER_DISABLED: 'reasonUserDisabled',
}

/** 被动录像验证页面的功能文案。 */
export const passiveCaptureMessages = defineFeatureMessages('acquisition/passive')

/** 将原生运行阶段映射为当前语言的状态文案。 */
export function localizePassiveCaptureState(
  state: PassiveCaptureState,
  messages: PassiveCaptureMessageValues,
): string {
  return messages[stateMessageKeys[state]]
}

/** 将已知原因码映射为当前语言文案；未知代码不直接展示。 */
export function localizePassiveCaptureReason(
  reason: string,
  messages: PassiveCaptureMessageValues,
): string {
  return messages[reasonMessageKeys[reason] ?? 'reasonUnknown']
}

/** 按稳定错误码选择安全文案，不回显底层异常消息。 */
export function localizePassiveCaptureError(
  code: string,
  messages: PassiveCaptureMessageValues,
): string {
  const normalizedCode = code.toUpperCase()
  if (normalizedCode === 'PLATFORM_UNSUPPORTED') return messages.errorPlatform
  if (normalizedCode.includes('PERMISSION') || normalizedCode.includes('NOTIFICATION')) return messages.errorPermission
  if (normalizedCode.includes('CAMERA_BUSY')) return messages.errorCameraBusy
  if (normalizedCode.includes('FOREGROUND_SERVICE') || normalizedCode.includes('SERVICE') || normalizedCode.includes('STOP')) {
    return messages.errorService
  }
  if (normalizedCode.includes('CONFIG') || normalizedCode.includes('INVALID') || normalizedCode.includes('INTERVAL') || normalizedCode.includes('DURATION')) {
    return messages.errorConfiguration
  }
  if (normalizedCode.includes('FILE') || normalizedCode.includes('VIDEO') || normalizedCode.includes('ARTIFACT') || normalizedCode.includes('ENCOD')) {
    return messages.errorFile
  }
  if (normalizedCode.includes('CAMERA')) return messages.errorCamera
  return messages.errorGeneric
}
