/** 管理引导页内弹层的原生透明度动画，淡出完成后才执行页面动作。 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing } from 'react-native'
import type { FeedbackAction, FeedbackModalOptions } from '@/shared/components/FeedbackDialog'

// 与 React Native Android Modal 的 fade 一致：config_shortAnimTime 与 accelerate_interpolator。
const FADE_DURATION_MS = 200
const FADE_EASING = Easing.in(Easing.quad)

/** 保留已关闭前的内容直到动画结束，避免弹层被提前卸载而丢失淡出。 */
export function useGuideDialog() {
  const [dialog, setDialog] = useState<FeedbackModalOptions | null>(null)
  const opacity = useRef(new Animated.Value(0)).current
  const animation = useRef<Animated.CompositeAnimation | null>(null)
  const closing = useRef(false)
  const reducedMotion = useRef(true)

  useEffect(() => {
    let mounted = true
    let revision = 0
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      revision += 1
      reducedMotion.current = enabled
    })
    const initialRevision = revision
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted && revision === initialRevision) reducedMotion.current = enabled
    }, () => undefined)
    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])

  useEffect(() => {
    if (dialog == null) return
    animation.current = Animated.timing(opacity, {
      toValue: 1,
      duration: reducedMotion.current ? 0 : FADE_DURATION_MS,
      easing: FADE_EASING,
      useNativeDriver: true,
      isInteraction: false,
    })
    animation.current.start()
    return () => animation.current?.stop()
  }, [dialog, opacity])

  /** 新弹层从透明开始，正文替换也沿用相同淡入。 */
  const showDialog = useCallback((options: FeedbackModalOptions) => {
    animation.current?.stop()
    closing.current = false
    opacity.setValue(0)
    setDialog(options)
  }, [opacity])

  /** 关闭期间忽略重复操作；卸载中断动画时不执行迟到的导航。 */
  const closeDialog = useCallback((afterClose?: FeedbackAction['onPress']) => {
    if (dialog == null || closing.current) return
    closing.current = true
    animation.current?.stop()
    animation.current = Animated.timing(opacity, {
      toValue: 0,
      duration: reducedMotion.current ? 0 : FADE_DURATION_MS,
      easing: FADE_EASING,
      useNativeDriver: true,
      isInteraction: false,
    })
    animation.current.start(({ finished }) => {
      if (!finished) return
      setDialog(null)
      closing.current = false
      void afterClose?.()
    })
  }, [dialog, opacity])

  return { dialog, opacity, showDialog, closeDialog }
}
