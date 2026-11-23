/** 管理被动 RPPG 开发页的阶段、结果质量和事件文案映射。 */

import type {
  PassiveCaptureState,
  RPPGSignalStatus,
  RPPGTerminationReason,
} from '@health-cv-app/acquisition'
import type zhCNTranslations from '@/app/i18n/locales/zh-CN.json'

type PassiveCaptureMessageValues = Omit<
  typeof zhCNTranslations['acquisition/passive'],
  'durationBelowMinimum'
> & {
  durationBelowMinimum: (parameters: { seconds: string }) => string
}
type PassiveCaptureStringMessageKey = Exclude<keyof PassiveCaptureMessageValues, 'durationBelowMinimum'>

/** 被动 RPPG 原生状态对应的本地化文案键。 */
const stateMessageKeys: Record<PassiveCaptureState, PassiveCaptureStringMessageKey> = {
  disabled: 'stateDisabled',
  starting: 'stateStarting',
  waiting: 'stateWaiting',
  observing: 'stateObserving',
  measuring: 'stateMeasuring',
  stopping: 'stateStopping',
  failed: 'stateFailed',
}

/** 已知原生事件原因对应的本地化文案键。 */
const reasonMessageKeys: Record<string, PassiveCaptureStringMessageKey> = {
  WAITING_FOR_UNLOCK: 'reasonWaitingForUnlock',
  CONFIGURATION_SAVED: 'reasonConfigurationSaved',
  SERVICE_START_REQUESTED: 'reasonServiceStartRequested',
  UNLOCK_TRIGGERED: 'reasonUnlockTriggered',
  SESSION_OPENING: 'reasonSessionOpening',
  FACE_OBSERVATION: 'reasonFaceObservation',
  MEASUREMENT_STARTED: 'reasonMeasurementStarted',
  MEASUREMENT_STOPPING: 'reasonMeasurementStopping',
  CYCLE_NOT_ELAPSED: 'reasonCycleNotElapsed',
  CAPTURE_BUSY: 'reasonCaptureBusy',
  DEVICE_STILL_LOCKED: 'reasonDeviceStillLocked',
  SCREEN_LOCKED: 'reasonScreenLocked',
  USER_DISABLED: 'reasonUserDisabled',
  target_duration: 'terminationTargetDuration',
  user_stop: 'terminationUserStop',
  page_left: 'terminationPageLeft',
  app_background: 'terminationAppBackground',
  observation_timeout: 'terminationObservationTimeout',
  interrupted: 'terminationInterrupted',
}

const terminationMessageKeys: Record<RPPGTerminationReason, PassiveCaptureStringMessageKey> = {
  target_duration: 'terminationTargetDuration',
  user_stop: 'terminationUserStop',
  page_left: 'terminationPageLeft',
  app_background: 'terminationAppBackground',
  observation_timeout: 'terminationObservationTimeout',
  interrupted: 'terminationInterrupted',
}

const signalStatusMessageKeys: Record<RPPGSignalStatus, PassiveCaptureStringMessageKey> = {
  valid_heart_rate: 'signalValidHeartRate',
  no_valid_heart_rate: 'signalNoValidHeartRate',
  no_waveform: 'signalNoWaveform',
}

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
/** 将共用 RPPG 结束原因映射为当前语言文案。 */
export function localizeRppgTermination(
  termination: RPPGTerminationReason,
  messages: PassiveCaptureMessageValues,
): string {
  return messages[terminationMessageKeys[termination]]
}

/** 将共用 RPPG 信号质量结论映射为当前语言文案。 */
export function localizeRppgSignalStatus(
  signalStatus: RPPGSignalStatus,
  messages: PassiveCaptureMessageValues,
): string {
  return messages[signalStatusMessageKeys[signalStatus]]
}

