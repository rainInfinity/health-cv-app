/** 统一健康数值格式与模型风险档位文案，不改写原始读数或编码。 */

/** 仅在展示边界舍弃小数部分，不四舍五入。 */
export function formatHealthNumber(value: number): string {
  return String(Math.trunc(value))
}

/** 将服务端档位映射为风险文案；默认分两行，指标解读使用单行，不按概率重算。 */
export function formatRiskLevel(level: number | null | undefined, stacked = true): string {
  switch (level) {
    case 0: return stacked ? '较低\n风险' : '较低风险'
    case 1: return stacked ? '中\n风险' : '中风险'
    case 2: return stacked ? '较高\n风险' : '较高风险'
    default: return '--'
  }
}
