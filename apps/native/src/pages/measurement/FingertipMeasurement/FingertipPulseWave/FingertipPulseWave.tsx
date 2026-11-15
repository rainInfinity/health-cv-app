/** 指尖波形的局部订阅边界；隐藏只停止绘图，不暂停本轮采样或丢弃回看状态。 */

import { memo, useEffect, useState } from 'react'

import { PulseWaveHistory } from '@/shared/components/PulseWaveHistory'

import type { FingertipWaveform } from '../fingertipWaveform'

/** 只消费页面私有控制器与展示参数，不持有采集或导航资源。 */
interface FingertipPulseWaveProps {
  /** 页面本轮真实历史，隐藏绘图时仍继续接收。 */
  controller: FingertipWaveform
  /** 宿主前台且当前显示波形分页时才订阅绘图更新。 */
  visible: boolean
  /** 原生正式采集阶段，不由绘图推进。 */
  capturing: boolean
  /** 减少动态效果时禁用原生平移，不改变历史样本。 */
  reducedMotion: boolean
  /** 沿用页面的波形标题。 */
  title: string
  /** 实际绘图区高度，单位 dp，不包含标题。 */
  height: number
  /** 沿用页面的绘图区辅助技术说明。 */
  accessibilityLabel: string
  /** 波形触摸期间隔离外层分页。 */
  onInteractionChange: (active: boolean) => void
}

/** 批次只重绘波形；恢复可见时先读取末快照，保留同一个历史回看实例。 */
export const FingertipPulseWave = memo(function FingertipPulseWave({ controller, visible, capturing, reducedMotion, title, height, accessibilityLabel, onInteractionChange }: FingertipPulseWaveProps) {
  const [snapshot, setSnapshot] = useState(() => controller.getSnapshot())

  useEffect(() => {
    if (!visible) return
    setSnapshot(controller.getSnapshot())
    return controller.subscribe(setSnapshot)
  }, [controller, visible])

  return (
    <PulseWaveHistory
      points={snapshot.points}
      latestTimeMs={snapshot.latestTimeMs}
      scrolling={capturing && visible && !reducedMotion}
      title={title}
      height={height}
      accessibilityLabel={accessibilityLabel}
      onInteractionChange={onInteractionChange}
    />
  )
})
