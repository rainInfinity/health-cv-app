/** 将真实有限 RPPG 样本转换为 ECharts 坐标，保留采集时间与缺口。 */

import { useMemo } from 'react'
import type { RPPGWaveformSample } from '@/app/rppg/rppgWaveform'
import { buildRPPGWaveformPlot } from '@/app/rppg/rppgWaveform'
import { PulseWaveChart } from '@/shared/components/PulseWaveChart'

/** 描述只读有限波形画布及其可访问空态。 */
export interface RPPGWaveformProps {
  /** 最近窗口中的有限标量样本。 */
  samples: readonly RPPGWaveformSample[]
  /** 尚无可绘制批次时展示的说明。 */
  emptyMessage: string
  /** 辅助技术读取的曲线描述。 */
  accessibilityLabel: string
  /** 固定展示窗口，单位毫秒；未指定时按当前样本跨度展示。 */
  durationMillis?: number
  /** 画布高度，单位 dp；默认保留开发页高度。 */
  height?: number
  /** 产品布局使用白底、单基线和左端渐隐；开发页保留诊断网格。 */
  appearance?: 'diagnostic' | 'product'
}

/** 呈现不可变的真实样本，不改写幅值、不补造缺失信号。 */
export function RPPGWaveform({ samples, emptyMessage, accessibilityLabel, durationMillis, height = 176, appearance = 'diagnostic' }: RPPGWaveformProps) {
  const plot = useMemo(() => buildRPPGWaveformPlot(samples, durationMillis), [samples, durationMillis])
  return <PulseWaveChart {...plot} height={height} appearance={appearance} emptyMessage={emptyMessage} accessibilityLabel={accessibilityLabel} />
}
