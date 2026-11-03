/** 根据已确认的认证事实选择健康页面展示，不读取或写入服务端缓存。 */

import type { AuthState } from '@/app/auth/types'

/** 用同一数据结构表达已登录展示值或认证未完成的空态。 */
export interface HealthPresentation {
  /** 最近一次血压收缩压，空态为 null，单位 mmHg。 */
  systolic: number | null
  /** 最近一次血压舒张压，空态为 null，单位 mmHg。 */
  diastolic: number | null
  /** 最近一次指尖心率，空态为 null，单位 次/分。 */
  heartRate: number | null
  /** 最近一次呼吸率，空态为 null，单位 次/分。 */
  respirationRate: number | null
  /** 最近一次血氧饱和度，空态为 null，单位百分比。 */
  oxygenSaturation: number | null
  /** 固定展示记录时间；空态为 null，ISO 8601 带 +08:00 时区。 */
  measuredAt: string | null
}

/** 未确认登录时使用的共享空展示对象。 */
const EMPTY_PRESENTATION: HealthPresentation = {
  systolic: null,
  diastolic: null,
  heartRate: null,
  respirationRate: null,
  oxygenSaturation: null,
  measuredAt: null,
}

/** 仅在认证已确认后供页面展示的固定内容；不作为真实测量记录。 */
const AUTHENTICATED_PRESENTATION: HealthPresentation = {
  systolic: 118,
  diastolic: 76,
  heartRate: 72,
  respirationRate: 16,
  oxygenSaturation: 98,
  measuredAt: '2026-10-31T08:30:00+08:00',
}

/** 将四态认证映射为唯一健康展示策略。 */
export function selectHealthPresentation(authState: AuthState): HealthPresentation {
  return authState.status === 'authenticated'
    ? AUTHENTICATED_PRESENTATION
    : EMPTY_PRESENTATION
}

/** 格式化本地固定记录与当前时间的真实间隔分类。 */
export function getMeasurementRecency(
  measuredAt: string | null,
  nowMillis: number,
): MeasurementRecency {
  if (measuredAt == null) return { kind: 'none' }

  const measuredAtMillis = Date.parse(measuredAt)
  if (!Number.isFinite(measuredAtMillis)) return { kind: 'unknown' }

  const elapsedMillis = nowMillis - measuredAtMillis
  if (elapsedMillis < 0) return { kind: 'future' }
  if (elapsedMillis < 60_000) return { kind: 'recent' }
  if (elapsedMillis < 3_600_000) {
    return { kind: 'elapsed', value: Math.floor(elapsedMillis / 60_000), unit: 'minute' }
  }
  if (elapsedMillis < 86_400_000) {
    return { kind: 'elapsed', value: Math.floor(elapsedMillis / 3_600_000), unit: 'hour' }
  }
  return { kind: 'elapsed', value: Math.floor(elapsedMillis / 86_400_000), unit: 'day' }
}

/** 描述测量间隔的可本地化语义，不包含任何固定语言文案。 */
export type MeasurementRecency =
  | { kind: 'none' }
  | { kind: 'unknown' }
  | { kind: 'future' }
  | { kind: 'recent' }
  | { kind: 'elapsed'; value: number; unit: 'minute' | 'hour' | 'day' }
