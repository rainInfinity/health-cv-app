/** 集中维护部位、指标与准备流程的有限映射，不启动任何采集。 */

import type { MeasurementMethod, MeasurementRouteParams, MeasurementTarget } from '@/app/navigation/types'

/** 功能页保留的五项指标卡片。 */
export type MeasurementFeature = 'fingertip' | 'face' | 'pressure' | 'oxygen' | 'risk'

/** 部位入口只为必要的部位绑定目标，指尖保持未选指标。 */
export const METHOD_ENTRIES = {
  face: { method: 'face', target: 'faceHeartRate' },
  fingertip: { method: 'fingertip' },
  chest: { method: 'chest', target: 'bloodPressure' },
} as const satisfies Record<MeasurementMethod, MeasurementRouteParams>

/** 指标入口与部位入口共用同一准备流程。 */
export const FEATURE_ENTRIES = {
  fingertip: { method: 'fingertip', target: 'fingertipVitals' },
  face: { method: 'face', target: 'faceHeartRate' },
  pressure: { method: 'chest', target: 'bloodPressure' },
  oxygen: { method: 'fingertip', target: 'oxygenSaturation' },
  risk: { method: 'fingertip', target: 'diabetesRisk' },
} as const satisfies Record<MeasurementFeature, MeasurementRouteParams>

/** 所有可用目标都有固定的本地化键，不将任意文案用作控制字段。 */
export const TARGET_MESSAGE_KEYS = {
  bloodPressure: 'targetPressure',
  heartRate: 'targetHeartRate',
  respirationRate: 'targetRespiration',
  oxygenSaturation: 'targetOxygen',
  faceHeartRate: 'targetFace',
  diabetesRisk: 'targetRisk',
  fingertipVitals: 'targetFingertip',
} as const satisfies Record<MeasurementTarget, string>

/** 功能入口按方式与设备偏好到达唯一产品检测页面。 */
type MeasurementEntryRoute =
  | [name: 'MeasurementGuide', params: MeasurementRouteParams]
  | [name: 'FaceMeasurement', params: { target?: MeasurementTarget }]
  | [name: 'FingertipMeasurement', params: { target?: MeasurementTarget }]
  | [name: 'BloodPressureMeasurement', params: { target?: MeasurementTarget }]

/** 跳过偏好同时跳过引导和声音提醒，不借用隐藏的引导页承接导航。 */
export function resolveMeasurementEntry(entry: MeasurementRouteParams, skipped: boolean): MeasurementEntryRoute {
  if (!skipped) return ['MeasurementGuide', entry]
  if (entry.method === 'face') return ['FaceMeasurement', { target: entry.target }]
  if (entry.method === 'fingertip') return ['FingertipMeasurement', { target: entry.target }]
  return ['BloodPressureMeasurement', { target: entry.target }]
}
