/** 绘制纯本地圆预览、模拟覆盖环与可暂停的装饰水纹。 */

import { memo, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import Svg, { Circle, Defs, G, LinearGradient, RadialGradient, Stop } from 'react-native-svg'
import { useTheme } from 'styled-components/native'

import { AppText } from '@/shared/components/AppText'

import { localStyles } from '@/pages/measurement/FingertipMeasurement/styles'
import { Notice, NoticeCenter, PreviewFrame } from './styles'

interface FingertipPreviewProps {
  /** 正圆画布直径，单位 dp。 */
  diameter: number
  /** 仅驱动本页模拟覆盖的局部动画节点。 */
  coverageProgress: Animated.Value
  /** 后台、失焦、准备及完成时停止装饰。 */
  animating: boolean
  /** 系统减少动态效果。 */
  reducedMotion: boolean
  /** 未满环与满环时的模拟取景读屏描述。 */
  waitingDescription: string
  coveredDescription: string
  /** 位于镜头中央的当前产品操作提示。 */
  notice: string
  /** 本地化的模拟覆盖语义。 */
  coverageLabel: string
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle)
const CIRCUMFERENCE = 2 * Math.PI * 143

/** 只有百分比文字订阅帧值，复杂预览图形不随读数重新渲染。 */
function CoverageReadout({ coverageProgress, coverageLabel, waitingDescription, coveredDescription }: Pick<FingertipPreviewProps, 'coverageProgress' | 'coverageLabel' | 'waitingDescription' | 'coveredDescription'>) {
  const theme = useTheme()
  const [coverage, setCoverage] = useState(0)
  const lastCoverage = useRef(0)
  useEffect(() => {
    const listener = coverageProgress.addListener(({ value }) => {
      // 以实际绘制进度取整，不能在补间结束前宣布 100%。
      const next = Math.floor(Math.max(0, Math.min(100, value)))
      if (next === lastCoverage.current) return
      lastCoverage.current = next
      setCoverage(next)
    })
    return () => coverageProgress.removeListener(listener)
  }, [coverageProgress])
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${coverageLabel}，${coverage === 100 ? coveredDescription : waitingDescription}`}
      accessibilityValue={{ min: 0, max: 100, now: coverage }}
      style={[localStyles.coverage, { backgroundColor: theme.colors.brand.subtle, borderColor: mix(theme.colors.brand.primary, theme.colors.surface.default, 0.35) }]}
    >
      <AppText variant="label" style={[localStyles.coverageText, { color: theme.colors.brand.action }]}>{coverage}%</AppText>
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

/** 取景始终是 SVG 颜色，不申请或创建真实相机。 */
export const FingertipPreview = memo(function FingertipPreview({ diameter, coverageProgress, animating, reducedMotion, waitingDescription, coveredDescription, notice, coverageLabel }: FingertipPreviewProps) {
  const theme = useTheme()
  const id = `fingertip-preview-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const rippleA = useRef(new Animated.Value(0)).current
  const rippleB = useRef(new Animated.Value(0)).current
  const brand = theme.colors.brand
  const surface = theme.colors.surface.default
  const progress = useMemo(() => ({
    coveredOpacity: coverageProgress.interpolate({ inputRange: [0, 100], outputRange: [0, 1], extrapolate: 'clamp' }),
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
    <PreviewFrame style={{ width: diameter, height: diameter }}>
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
      {/* 径向渐变仅栅格化一次，覆盖环更新不再连带重绘整张预览。 */}
      <Animated.View pointerEvents="none" renderToHardwareTextureAndroid style={[StyleSheet.absoluteFill, { opacity: progress.coveredOpacity }]} accessible={false}>
        <Svg width={diameter} height={diameter} viewBox="0 0 300 300" accessible={false}>
          <Defs>
            <RadialGradient id={`${id}-covered`} cx="36%" cy="32%" rx="75%" ry="75%">
              <Stop stopColor={mix(theme.colors.illustration.roseLight, theme.colors.accent.rose, 0.68)} />
              <Stop offset="0.55" stopColor={theme.colors.feedback.error} />
              <Stop offset="1" stopColor={mix(theme.colors.feedback.error, theme.colors.text.primary, 0.48)} />
            </RadialGradient>
          </Defs>
          <Circle cx="150" cy="150" r={150 - cameraInset} fill={`url(#${id}-covered)`} />
        </Svg>
      </Animated.View>
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
      <NoticeCenter pointerEvents="none">
        <Notice>
          <AppText variant="caption" tone="secondary" numberOfLines={2} ellipsizeMode="tail" style={localStyles.previewNoticeText}>{notice}</AppText>
        </Notice>
      </NoticeCenter>
      <CoverageReadout coverageProgress={coverageProgress} coverageLabel={coverageLabel} waitingDescription={waitingDescription} coveredDescription={coveredDescription} />
    </PreviewFrame>
  )
})
