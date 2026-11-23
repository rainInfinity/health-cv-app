/** 只映射当前会话的权威健康记录，不产生评估或本地采集读数。 */

import type { Rsp } from '@health-cv-app/cloud-client'
import type { AuthState } from '@/app/auth/types'

/** 各指标保留自己的记录与提交时间；没有记录时保持 null。 */
export interface HealthPresentation {
  systolic: number | null
  diastolic: number | null
  heartRate: number | null
  respirationRate: number | null
  oxygenSaturation: number | null
  /** 后端原始风险档位；概率仍保留在 records，不用它推算档位。 */
  diabetesRisk: Rsp.Measurements.MeasurementRecord['riskLevel']
  records: Rsp.Measurements.LatestMeasurements
}

const EMPTY_RECORDS: Rsp.Measurements.LatestMeasurements = {
  bloodPressure: null, heartRate: null, respirationRate: null, oxygenSaturation: null, diabetesRisk: null,
}

/** 通过合同代码而非数组位置读取原值，缺失不能补零。 */
export function measurementReading(record: Rsp.Measurements.MeasurementRecord | null, code: string): number | null {
  const value = record?.readings.find((reading) => reading.code === code)?.value
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** 认证尚未确认时即使调用方仍持有旧响应，也不暴露健康内容。 */
export function selectHealthPresentation(authState: AuthState, latest?: Rsp.Measurements.LatestMeasurements): HealthPresentation {
  const records = authState.status === 'authenticated' && latest ? latest : EMPTY_RECORDS
  return {
    records,
    systolic: measurementReading(records.bloodPressure, 'sbp'),
    diastolic: measurementReading(records.bloodPressure, 'dbp'),
    heartRate: measurementReading(records.heartRate, 'hr'),
    respirationRate: measurementReading(records.respirationRate, 'br'),
    oxygenSaturation: measurementReading(records.oxygenSaturation, 'spo2'),
    diabetesRisk: records.diabetesRisk?.riskLevel ?? null,
  }
}

