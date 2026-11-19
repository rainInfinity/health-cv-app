/** 呈现真实后摄圆形预览与原生覆盖事实，装饰动效不参与采集控制。 */

import { memo, useEffect, useId, useMemo, useRef, useSyncExternalStore } from 'react'
import type { RefObject } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import type { LayoutChangeEvent } from 'react-native'
import { useStore } from '@nanostores/react'
import { BlurTargetView, BlurView } from 'expo-blur'
import { CameraPreview } from '@health-cv-app/acquisition/react'
import Svg, { Circle, Defs, G, LinearGradient, Stop } from 'react-native-svg'
import { useTheme } from 'styled-components/native'

import { AppText } from '@/shared/components/AppText'

import { localStyles } from '@/pages/measurement/ContactMeasurement/styles'
import { Notice, NoticeCenter, PreviewFrame } from './styles'
import { fingertipMessages } from '../../FingertipMeasurement/fingertipMessages'
import type { FingertipDisplay, FingertipDisplaySnapshot, FingertipPresentation } from '../../FingertipMeasurement/fingertipPresentation'

interface FingertipPreviewProps {
  /** 正圆画布直径，单位 dp。 */
  diameter: number
  /** 仅驱动真实覆盖值的局部环形动画，不决定提示或正式开始。 */
  coverageProgress: Animated.Value
  /** 仅在前台本轮进行时显示装饰，动效不推进覆盖或阶段。 */
  animating: boolean
  /** 系统减少动态效果。 */
  reducedMotion: boolean
  /** 页面私有覆盖／提示投影，不订阅采集业务或完整快照。 */
  display: Pick<FingertipDisplay, 'getSnapshot' | 'subscribe'>
  /** 调用方提供具体方式的阶段指引，不改变覆盖事实。 */
  notice?: string
  /** 按操作、开始和结束阶段着色，未启用时保持正文色。 */
  highlightNotice?: boolean
  /** 方式专属动作尚未完成时，覆盖就绪也继续显示操作提示色。 */
  noticeRequiresAction?: boolean
  /** 本地错误与取消必须立即覆盖普通操作提示。 */
  overridePresentation: FingertipPresentation | null
  /** 授权后挂载真实预览，不隐含打开命令。 */
  previewMounted: boolean
  /** 包装层确认 Nitro 引用与正布局后回传。 */
  onPreviewLayout: (event: LayoutChangeEvent) => void
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle)
const CIRCUMFERENCE = 2 * Math.PI * 143

/** 文字使用最新原生事实，不读取动画的中间值。 */
function CoverageReadout({ coveragePercent, coverageReady, coverageLabel, waitingDescription, coveredDescription }: Pick<FingertipDisplaySnapshot, 'coveragePercent' | 'coverageReady'> & { coverageLabel: string; waitingDescription: string; coveredDescription: string }) {
  const theme = useTheme()
  const coverage = coveragePercent == null ? null : Math.floor(Math.max(0, Math.min(100, coveragePercent)))
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${coverageLabel}，${coverageReady ? coveredDescription : waitingDescription}`}
      accessibilityValue={coverage == null ? { text: '--' } : { min: 0, max: 100, now: coverage }}
      style={[localStyles.coverage, { backgroundColor: theme.colors.brand.subtle, borderColor: mix(theme.colors.brand.primary, theme.colors.surface.default, 0.35) }]}
    >
      <AppText variant="label" style={[localStyles.coverageText, { color: theme.colors.brand.action }]}>{coverage == null ? '--' : `${coverage}%`}</AppText>
    </View>
  )
}

/** 按主题色实现 CSS color-mix 的不透明混色，不建立额外调色系统。 */
function mix(first: string, second: string, weight: number): string {
  let result = '#'
  for (const offset of [1, 3, 5]) {
    const left = Number.parseInt(first.slice(offset, offset + 2), 16)
    const right = Number.parseInt(second.slice(offset, offset + 2), 16)
    result += Math.round(left * weight + right * (1 - weight)).toString(16).padStart(2, '0')
  }
  return result
}

/** 相机与装饰节点只随布局、阶段动效及真实挂载变化，不接收覆盖或提示。 */
const PreviewScene = memo(function PreviewScene({ diameter, coverageProgress, previewMounted, onPreviewLayout, animating, reducedMotion }: Pick<FingertipPreviewProps, 'diameter' | 'coverageProgress' | 'previewMounted' | 'onPreviewLayout' | 'animating' | 'reducedMotion'>) {
  const theme = useTheme()
  const id = `fingertip-preview-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const rippleA = useRef(new Animated.Value(0)).current
  const rippleB = useRef(new Animated.Value(0)).current
  const brand = theme.colors.brand
  const surface = theme.colors.surface.default
  const progress = useMemo(() => ({
    dashoffset: coverageProgress.interpolate({ inputRange: [0, 100], outputRange: [CIRCUMFERENCE, 0], extrapolate: 'clamp' }),
    ringOpacity: coverageProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
  }), [coverageProgress])

  useEffect(() => {
    rippleA.setValue(0)
    rippleB.setValue(0)
    if (!animating || reducedMotion) return
    const cycle = (value: Animated.Value) => Animated.loop(Animated.timing(value, {
      toValue: 1,
      duration: 3_200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }))
    const first = cycle(rippleA)
    const second = Animated.sequence([Animated.delay(1_600), cycle(rippleB)])
    first.start()
    second.start()
    return () => {
      first.stop()
      second.stop()
      rippleA.setValue(0)
      rippleB.setValue(0)
    }
  }, [animating, reducedMotion, rippleA, rippleB])

  const cameraInset = 17 * 300 / diameter
  return (
    <>
      {[rippleA, rippleB].map((progress, index) => (
        <Animated.View
          key={index}
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            localStyles.ripple,
            {
              width: diameter,
              height: diameter,
              borderRadius: diameter / 2,
              borderColor: `${index === 0 ? brand.primary : brand.gradient.end}7A`,
              opacity: progress.interpolate({ inputRange: [0, 0.18, 1], outputRange: [0, 0.45, 0] }),
              transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }],
            },
          ]}
        />
      ))}
      <View accessible={false}>
        <Svg width={diameter} height={diameter} viewBox="0 0 300 300" accessible={false}>
          <Circle cx="150" cy="150" r={150 - cameraInset} fill={theme.colors.surface.preview} stroke={theme.colors.surface.card} strokeWidth={5 * 300 / diameter} />
          <Circle cx="150" cy="150" r="143" fill="none" stroke={mix(brand.primary, surface, 0.16)} strokeWidth="7" />
        </Svg>
      </View>
      {previewMounted && (
        <View style={{ position: 'absolute', top: 17, left: 17, width: diameter - 34, height: diameter - 34, borderRadius: (diameter - 34) / 2, overflow: 'hidden' }} accessible={false} importantForAccessibility="no-hide-descendants">
          <CameraPreview style={StyleSheet.absoluteFill} onLayout={onPreviewLayout} accessible={false} importantForAccessibility="no-hide-descendants" />
        </View>
      )}
      <View pointerEvents="none" style={StyleSheet.absoluteFill} accessible={false}>
        <Svg width={diameter} height={diameter} viewBox="0 0 300 300" accessible={false}>
          <Defs>
            <LinearGradient id={`${id}-ring`} x1="0%" y1="37%" x2="100%" y2="63%">
              <Stop stopColor={brand.primary} />
              <Stop offset="1" stopColor={brand.gradient.end} />
            </LinearGradient>
          </Defs>
          <G transform="rotate(-90 150 150)" fill="none" strokeWidth="7">
            <AnimatedCircle cx="150" cy="150" r="143" stroke={`url(#${id}-ring)`} strokeLinecap="round" strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`} strokeDashoffset={progress.dashoffset} opacity={progress.ringOpacity} />
          </G>
        </Svg>
      </View>
    </>
  )
})

/** 覆盖数值／文字的局部订阅边界，不让 250ms 更新重建相机或波纹。 */
function CoverageOverlay({ display, coverageProgress, reducedMotion, animating, overridePresentation, notice: customNotice, highlightNotice, noticeRequiresAction, blurTarget }: Pick<FingertipPreviewProps, 'display' | 'coverageProgress' | 'reducedMotion' | 'animating' | 'overridePresentation' | 'notice' | 'highlightNotice' | 'noticeRequiresAction'> & { /** 只取相机与装饰背景，不包含提示文字。 */ blurTarget: RefObject<View | null> }) {
  const snapshot = useSyncExternalStore(display.subscribe, display.getSnapshot)
  const messages = useStore(fingertipMessages)
  const theme = useTheme()
  const presentation = overridePresentation ?? snapshot.presentation
  const notice = customNotice ?? (presentation === 'ready' ? messages.hintReady
    : presentation === 'partial' ? messages.hintPartial
      : presentation === 'covered' ? messages.hintCovered
        : presentation === 'running' ? messages.hintRunning
          : presentation === 'stopping' ? messages.hintStopping
            : presentation === 'completed' ? messages.hintCompleted : messages.hintInterrupted)
  const noticeColor = !highlightNotice || presentation === 'stopping' || presentation === 'completed'
    ? theme.colors.text.primary
    : !noticeRequiresAction && (presentation === 'covered' || presentation === 'running')
      ? mix(theme.colors.brand.gradient.end, theme.colors.text.primary, 0.7)
      : mix(theme.colors.accent.rose, theme.colors.text.primary, 0.7)

  useEffect(() => {
    const value = snapshot.coveragePercent ?? 0
    if (reducedMotion || !animating || snapshot.resourcesReleased) {
      coverageProgress.stopAnimation()
      coverageProgress.setValue(value)
      return
    }
    const animation = Animated.timing(coverageProgress, { toValue: value, duration: 100, easing: Easing.linear, useNativeDriver: false, isInteraction: false })
    animation.start()
    return () => animation.stop()
  }, [coverageProgress, reducedMotion, animating, snapshot.coveragePercent, snapshot.resourcesReleased])

  return (
    <>
      <NoticeCenter pointerEvents="none">
        <Notice>
          {/* Android 的模糊半径为 96 / 8 = 12，chrome 白色叠层约为 96% × 75% = 72%。 */}
          <BlurView blurTarget={blurTarget} blurMethod="dimezisBlurViewSdk31Plus" intensity={96} blurReductionFactor={8} tint="systemChromeMaterial" style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false} />
          <AppText variant="caption" numberOfLines={2} ellipsizeMode="tail" style={[localStyles.previewNoticeText, { color: noticeColor }]}>{notice}</AppText>
        </Notice>
      </NoticeCenter>
      <CoverageReadout coveragePercent={snapshot.coveragePercent} coverageReady={snapshot.coverageReady} coverageLabel={messages.coverage} waitingDescription={messages.previewWaiting} coveredDescription={messages.previewCovered} />
    </>
  )
}

/** 保留圆形布局与同一个 Animated.Value；覆盖反馈和稳定预览互不重绘。 */
export const FingertipPreview = memo(function FingertipPreview({ diameter, coverageProgress, previewMounted, onPreviewLayout, animating, reducedMotion, display, overridePresentation, notice, highlightNotice, noticeRequiresAction }: FingertipPreviewProps) {
  const blurTarget = useRef<View | null>(null)
  return (
    <PreviewFrame style={{ width: diameter, height: diameter }}>
      <BlurTargetView ref={blurTarget} style={[StyleSheet.absoluteFill, localStyles.circle]} accessible={false} importantForAccessibility="no-hide-descendants">
        <PreviewScene diameter={diameter} coverageProgress={coverageProgress} previewMounted={previewMounted} onPreviewLayout={onPreviewLayout} animating={animating} reducedMotion={reducedMotion} />
      </BlurTargetView>
      <CoverageOverlay display={display} coverageProgress={coverageProgress} animating={animating} reducedMotion={reducedMotion} overridePresentation={overridePresentation} notice={notice} highlightNotice={highlightNotice} noticeRequiresAction={noticeRequiresAction} blurTarget={blurTarget} />
    </PreviewFrame>
  )
})
