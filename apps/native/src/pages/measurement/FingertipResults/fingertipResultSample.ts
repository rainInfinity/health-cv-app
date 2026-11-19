/** 指尖结果专用固定样例；不读取采集、查询、账号或健康记录。 */

/** 数值与各自算法质量独立保存；参考区间与评估原文只由同源文案资源提供，不参与分级。 */
export const fingertipResultSample = Object.freeze({
  /** 固定时间与完整解读在 fingertipResults 文案中维护，两处结果共用，不伪装为采集时间。 */
  vitals: Object.freeze([
    Object.freeze({ kind: 'heartRate' as const, value: 72, qualityScore: 92 }),
    Object.freeze({ kind: 'respirationRate' as const, value: 16, qualityScore: 86 }),
    Object.freeze({ kind: 'oxygenSaturation' as const, value: 98, qualityScore: 96 }),
  ] as const),
  /** 风险算法质量不表示风险分数、血糖值、患病概率或诊断。 */
  riskQualityScore: 76,
  durationMs: 30_000,
})

/** 三十秒处理后样例使用负向原始幅值，交给统一绘图底座取负后呈现与 Demo 相同的正向脉搏。 */
export const processedPulseSample: readonly [number, number][] = Object.freeze(Array.from({ length: 901 }, (_, index): [number, number] => {
  const seconds = index / 30
  const phase = (seconds * 1.2) % 1
  const pulse = Math.exp(-(((phase - 0.22) / 0.09) ** 2)) + 0.28 * Math.exp(-(((phase - 0.5) / 0.12) ** 2))
  return [seconds * 1_000, -pulse * (0.94 + 0.05 * Math.sin(seconds * 0.8))]
}))
