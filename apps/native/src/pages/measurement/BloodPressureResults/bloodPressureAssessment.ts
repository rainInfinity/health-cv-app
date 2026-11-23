/** 指尖与胸口血压结果共用的三级展示判断，不改变云端原始读数。 */

/** 偏低、正常和偏高三个展示区间。 */
export type BloodPressureLevel = 'low' | 'normal' | 'high'

/** 输入为同一成功成员的原始 mmHg 双读数；两项跨低高区间时偏高优先。 */
export function classifyBloodPressure(systolic: number, diastolic: number): BloodPressureLevel {
  if (systolic >= 140 || diastolic >= 90) return 'high'
  if (systolic < 90 || diastolic < 60) return 'low'
  return 'normal'
}
