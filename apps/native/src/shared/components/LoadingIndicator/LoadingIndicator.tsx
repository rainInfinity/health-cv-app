/** 提供主题渐变、浅色底轨及原生驱动旋转的共享加载图标。 */

import { useEffect, useId, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg'
import { useTheme } from 'styled-components/native'

/** 描述共享加载图标的视觉参数。 */
interface LoadingIndicatorProps {
  /** 图标边长，单位 dp。 */
  size: number
  /** 渐变底按钮可指定纯色前景；其余场景默认使用主题渐变。 */
  color?: string
}

/** 按主题周期旋转加载图标，并在减少动态效果时保持静止。 */
export function LoadingIndicator({ size, color }: LoadingIndicatorProps) {
  const theme = useTheme()
  const gradientId = `loading-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(true)
  const rotation = useRef(new Animated.Value(0)).current

  useEffect(() => {
    let mounted = true
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      if (mounted) setReduceMotionEnabled(enabled)
    })
    void AccessibilityInfo.isReduceMotionEnabled().then(
      (enabled) => {
        if (mounted) setReduceMotionEnabled(enabled)
      },
      () => undefined,
    )

    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])

  useEffect(() => {
    rotation.stopAnimation()
    rotation.setValue(0)
    if (reduceMotionEnabled) return

    const animation = Animated.loop(Animated.timing(rotation, {
      toValue: 1,
      duration: theme.motion.loadingCycle,
      easing: Easing.linear,
      useNativeDriver: true,
    }))
    animation.start()
    return () => {
      animation.stop()
      rotation.setValue(0)
    }
  }, [reduceMotionEnabled, rotation, theme.motion.loadingCycle])

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  return (
    <Animated.View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ width: size, height: size, transform: [{ rotate }] }}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth={theme.icon.strokeWidth} strokeLinecap="round">
        {color == null && <Defs><LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%"><Stop offset="0" stopColor={theme.colors.brand.gradient.start} /><Stop offset="1" stopColor={theme.colors.brand.gradient.end} /></LinearGradient></Defs>}
        <Circle cx={12} cy={12} r={9} stroke={color ?? theme.colors.brand.primary} strokeOpacity={0.18} />
        <Path d="M12 3a9 9 0 1 1-9 9" stroke={color ?? `url(#${gradientId})`} />
      </Svg>
    </Animated.View>
  )
}
