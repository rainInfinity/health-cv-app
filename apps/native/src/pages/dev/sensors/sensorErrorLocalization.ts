/** 将传感器稳定错误码映射为安全的当前语言提示。 */

/** 传感器错误提示所需的本地化文案键。 */
export type SensorErrorMessageKey =
  | 'errorGeneric'
  | 'errorInvalidConfig'
  | 'errorUnavailable'
  | 'errorBusy'
  | 'errorRegistration'
  | 'errorBackground'
  | 'errorRuntime'
  | 'errorNotCapturing'
  | 'errorNoSamples'
  | 'errorData'
  | 'errorCapacity'
  | 'errorFile'
  | 'errorMissingArtifact'

/** 当前语言中错误映射所需的安全提示。 */
export type SensorErrorMessages = Record<SensorErrorMessageKey, string>

/** 稳定传感器错误码到安全文案键的映射。 */
const sensorErrorKeys: Record<string, SensorErrorMessageKey> = {
  INVALID_SENSOR_CONFIG: 'errorInvalidConfig',
  SENSOR_UNAVAILABLE: 'errorUnavailable',
  SENSOR_BUSY: 'errorBusy',
  SENSOR_REGISTRATION_FAILED: 'errorRegistration',
  APP_NOT_FOREGROUND: 'errorBackground',
  RUNTIME_DESTROYED: 'errorRuntime',
  SENSOR_NOT_CAPTURING: 'errorNotCapturing',
  SENSOR_NO_SAMPLES: 'errorNoSamples',
  SENSOR_DATA_INVALID: 'errorData',
  DATAHUB_CAPACITY_EXCEEDED: 'errorCapacity',
  DATAHUB_CLOSED: 'errorRuntime',
  DATAHUB_UNAVAILABLE: 'errorRuntime',
  FILE_OPEN_FAILED: 'errorFile',
  FILE_WRITE_FAILED: 'errorFile',
  FILE_FINALIZATION_FAILED: 'errorFile',
  MISSING_ARTIFACT: 'errorMissingArtifact',
}

/** 按稳定错误码返回安全提示；未知代码绝不作为消息内容回显。 */
export function localizeSensorCaptureError(code: string, messages: SensorErrorMessages): string {
  const normalizedCode = code.trim().toUpperCase()
  const messageKey = Object.prototype.hasOwnProperty.call(sensorErrorKeys, normalizedCode)
    ? sensorErrorKeys[normalizedCode]
    : 'errorGeneric'
  return messages[messageKey]
}
