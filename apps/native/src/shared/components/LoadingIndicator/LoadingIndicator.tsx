/** 提供遵循系统减少动态效果设置的主题加载图标。 */

import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing } from 'react-native'
import { LoaderCircle } from '@/shared/graphics'
import { useTheme } from 'styled-components/native'

/** 描述共享加载图标的视觉参数。 */
interface LoadingIndicatorProps {
  /** 图标边长，单位 dp。 */
  size: number
  /** 图标的主题前景色。 */
  color: string
}

/** 按主题周期旋转加载图标，并在减少动态效果时保持静止。 */
export function LoadingIndicator({ size, color }: LoadingIndicatorProps) {
  const theme = useTheme()
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
      <LoaderCircle size={size} color={color} strokeWidth={theme.icon.strokeWidth} />
    </Animated.View>
  )
}
