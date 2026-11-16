/** 双图共享单一原生离散时序，静态矢量不做形状插值。 */
import { memo, useEffect, useRef } from 'react'
import { Animated } from 'react-native'
import { AppText } from '@/shared/components/AppText'
import { Instructions, Step, localStyles } from '../../ContactMeasurement/styles'
import { ChestReferenceFrame } from './ChestReferenceFrame'
import { Artwork, Frame } from './styles'

/** 当前分页、前台状态及实际原生画布尺寸。 */
interface Props {
  /** 仅前台可见的第二页播放，切离立即停止。 */
  active: boolean
  /** 沿用系统减少动态效果设置。 */
  reducedMotion: boolean
  /** 单幅等比画布高度，单位 dp。 */
  height: number
  /** 指引整页宽度，单位 dp。 */
  width: number
  /** 分页内容可用高度，单位 dp。 */
  pageHeight: number
  /** 侧面及正面动作标题。 */
  titles: readonly [string, string]
  /** 两幅图对应的放置说明。 */
  hints: readonly [string, string]
  /** 非当前页从无障碍树隐藏，不改变业务状态。 */
  visible: boolean
}

/** 两幅图共用同一个原生六帧时钟，不以高亮推进准入。 */
export const ChestInstructionArtwork = memo(function ChestInstructionArtwork({ active, reducedMotion, height, width, pageHeight, titles, hints, visible }: Props) {
  const progress = useRef(new Animated.Value(0)).current
  useEffect(() => {
    progress.setValue(reducedMotion ? 5 : 0)
    if (!active || reducedMotion) return
    const animation = Animated.loop(Animated.timing(progress, {
      toValue: 6, duration: 1_920,
      // 时序在启动时采样为原生关键帧，运行中不回调 JS 或更新 React。
      easing: (value) => Math.min(5, Math.floor(value * 6)) / 6,
      useNativeDriver: true, isInteraction: false,
    }))
    animation.start()
    return () => { animation.stop(); progress.stopAnimation() }
  }, [active, reducedMotion, progress])
  return <Instructions style={{ width, height: pageHeight }} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}>
    {(['side', 'front'] as const).map((side, index) => <Step key={side}>
      <Artwork style={{ height }} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[0, 1, 2, 3, 4, 5].map((frame) => <Frame key={frame} style={{ opacity: progress.interpolate({ inputRange: [frame - 1, frame, frame + 1], outputRange: [0, 1, 0], extrapolate: 'clamp' }) }}>
          <ChestReferenceFrame side={side} frame={frame} height={height} />
        </Frame>)}
      </Artwork>
      <AppText variant="label" style={localStyles.centered}>{titles[index]}</AppText>
      <AppText variant="caption" tone="secondary" style={localStyles.stepHint}>{hints[index]}</AppText>
    </Step>)}
  </Instructions>
})
