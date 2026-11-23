/** 保留原数据布局，首次显示主题骨架，刷新加载圈随内容实际尺寸变化。 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Animated, Easing, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { useTheme } from 'styled-components/native'
import { LoadingIndicator } from '@/shared/components/LoadingIndicator'
import { Cover, Slot } from './styles'

/** 只替换数据位置，不推动相邻单位和卡片。 */
export function HomeDataSlot({ mode, time = false, loadingScale = 1, children }: {
  /** 数据区域当前的加载或就绪状态。 */
  mode: 'loading' | 'refreshing' | 'ready'
  /** 时间区域使用较窄的首次加载骨架。 */
  time?: boolean
  /** 加载圈相对内容实测直径的比例，默认1；字号调整时可保留原圈径。 */
  loadingScale?: number
  /** 保留布局并用于测量的实际数据内容。 */
  children: ReactNode
}) {
  const theme = useTheme()
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const shimmer = useRef(new Animated.Value(-86)).current
  const [diameter, setDiameter] = useState(0)
  useEffect(() => {
    if (mode !== 'loading') return
    const animation = Animated.loop(Animated.timing(shimmer, { toValue: 86, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }))
    animation.start()
    return () => { animation.stop(); shimmer.setValue(-86) }
  }, [mode, shimmer])
  return <Slot accessibilityState={{ busy: mode !== 'ready' }}>
    {/* 测量节点不参与视图折叠，保持刷新前后的原生布局与重绘边界稳定。 */}
    <View collapsable={false} onLayout={({ nativeEvent: { layout } }) => setDiameter(Math.min(layout.width, layout.height))} style={{ opacity: mode === 'ready' ? 1 : 0 }}>{children}</View>
    {mode !== 'ready' && <Cover pointerEvents="none">
      {mode === 'refreshing' ? diameter > 0 && <LoadingIndicator size={diameter * loadingScale} /> : <View style={{ width: time ? 86 : 54, height: time ? 10 : 26, borderRadius: time ? 4 : 6, backgroundColor: theme.colors.border.default, overflow: 'hidden' }}>
        <Animated.View style={{ transform: [{ translateX: shimmer }] }}><Svg width={86} height={26}><Defs><LinearGradient id={id}><Stop stopColor={theme.colors.border.default} /><Stop offset="0.5" stopColor={theme.colors.brand.subtle} /><Stop offset="1" stopColor={theme.colors.border.default} /></LinearGradient></Defs><Rect width={86} height={26} fill={`url(#${id})`} /></Svg></Animated.View>
      </View>}
    </Cover>}
  </Slot>
}
