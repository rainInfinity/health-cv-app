/** 指尖波形的局部订阅边界；隐藏只停止绘图，不暂停本轮采样或丢弃回看状态。 */

import { memo, useEffect, useState } from 'react'

import { PulseWaveHistory } from '@/shared/components/PulseWaveHistory'

import type { FingertipDisplayController } from '../fingertipDisplay'

const AMPLITUDE_SPAN = 1.01 / (0.85 - 0.1)

/** 只消费页面私有控制器与展示参数，不持有采集或导航资源。 */
interface FingertipPulseWaveProps {
  /** 当前页面实例的本地展示控制器。 */
  controller: FingertipDisplayController
  /** 宿主前台且当前显示波形分页时才订阅绘图更新。 */
  visible: boolean
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
export const FingertipPulseWave = memo(function FingertipPulseWave({ controller, visible, reducedMotion, title, height, accessibilityLabel, onInteractionChange }: FingertipPulseWaveProps) {
  const [snapshot, setSnapshot] = useState(() => controller.getSnapshot())

  useEffect(() => {
    if (!visible) return
    setSnapshot(controller.getSnapshot())
    return controller.subscribeWave(setSnapshot)
  }, [controller, visible])

  return (
    <PulseWaveHistory
      points={snapshot.wave.points}
      latestTimeMs={snapshot.runningElapsedMs}
      minimum={-0.1 * AMPLITUDE_SPAN}
      maximum={0.9 * AMPLITUDE_SPAN}
      scrolling={snapshot.phase === 'running' && visible && !reducedMotion}
      title={title}
      height={height}
      accessibilityLabel={accessibilityLabel}
      onInteractionChange={onInteractionChange}
    />
  )
})
