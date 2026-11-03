/** 管理传感器页面的本地化文案、状态和安全错误映射。 */

import type { SensorKind, SensorSnapshot } from '@health-cv-app/acquisition'
import type zhCNTranslations from '@/app/i18n/locales/zh-CN.json'
import { defineFeatureMessages } from '@/app/i18n'

type SensorCaptureMessageValues = typeof zhCNTranslations['sensors/capture']

/** 传感器类型到本地化名称文案的映射。 */
const sensorNameKeys: Record<SensorKind, keyof SensorCaptureMessageValues> = {
  accelerometer: 'accelerometer',
  gyroscope: 'gyroscope',
  magnetometer: 'magnetometer',
  gravity: 'gravity',
}

/** 传感器类型到物理单位文案的映射。 */
const sensorUnitKeys: Record<SensorKind, keyof SensorCaptureMessageValues> = {
  accelerometer: 'accelerometerUnit',
  gyroscope: 'gyroscopeUnit',
  magnetometer: 'magnetometerUnit',
  gravity: 'gravityUnit',
}

/** 原生低频采集阶段到本地化状态文案的映射。 */
const sensorPhaseKeys: Record<SensorSnapshot['phase'], keyof SensorCaptureMessageValues> = {
  idle: 'phaseIdle',
  starting: 'phaseStarting',
  capturing: 'phaseCapturing',
  stopping: 'phaseStopping',
  failed: 'phaseFailed',
}

/** 传感器页面的功能文案。 */
export const sensorCaptureMessages = defineFeatureMessages('sensors/capture')

/** 返回当前语言的传感器名称。 */
export function localizeSensorName(kind: SensorKind, messages: SensorCaptureMessageValues): string {
  return messages[sensorNameKeys[kind]]
}

/** 返回当前语言中该传感器对应的物理单位。 */
export function localizeSensorUnit(kind: SensorKind, messages: SensorCaptureMessageValues): string {
  return messages[sensorUnitKeys[kind]]
}

/** 返回当前语言的低频运行阶段说明。 */
export function localizeSensorPhase(phase: SensorSnapshot['phase'], messages: SensorCaptureMessageValues): string {
  return messages[sensorPhaseKeys[phase]]
}

/** 只将已知的 Android 设备坐标系映射为当前语言文案。 */
export function localizeSensorCoordinateSystem(
  coordinateSystem: string,
  messages: SensorCaptureMessageValues,
): string {
  return coordinateSystem === 'android-device' ? messages.coordinateSystem : messages.unknown
}
