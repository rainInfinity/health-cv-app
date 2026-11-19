/** 注册指尖结果的同源离线样例文案，不新增产品语言能力。 */

import { defineFeatureMessages } from '@/app/i18n'

export const fingertipResultsMessages = defineFeatureMessages('fingertipResults')

/** 格式化固定报告视窗的本地化参数，不泄漏 i18n 注册实现类型。 */
interface ResultWaveRangeParameters {
  start: string
  end: string
}

const rangeNumber = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })

/** JSON 字符串类型不保留占位参数，显式声明此功能唯一的范围插值契约。 */
export function formatResultWaveRange(rangeMessage: unknown, startTimeMs: number): string {
  const range = rangeMessage as (values: ResultWaveRangeParameters) => string
  return range({ start: rangeNumber.format(startTimeMs / 1_000), end: rangeNumber.format((startTimeMs + 6_000) / 1_000) })
}
