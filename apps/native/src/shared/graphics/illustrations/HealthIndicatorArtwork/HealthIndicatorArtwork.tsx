/** 绘制主页心率、呼吸、血氧与风险卡片的本地 SVG 图形。 */

import { useEffect, useId, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, View } from 'react-native'
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Stop, Text } from 'react-native-svg'
import { useTheme } from 'styled-components/native'
import { formatHealthNumber } from '@/shared/healthNumber'

import { ArtworkFrame } from './styles'
import { OxygenSaturationSymbol } from './OxygenSaturationSymbol'

/** 主页指标图形类别，心率图形包含装饰性动态。 */
export type HealthIndicatorArtworkKind = 'heartRate' | 'respirationRate' | 'oxygenSaturation' | 'diabetesRisk'

/** 描述主页指标插画及血氧仪表所需数值。 */
export interface HealthIndicatorArtworkProps {
  /** 当前指标的图形类别。 */
  kind: HealthIndicatorArtworkKind
  /** 血氧百分比；其他类别忽略此值。 */
  value?: number | null
  /** 血氧无数据时使用的本地化占位文案。 */
  emptyLabel?: string
  /** 首页加载时仅隐藏仪表中央读数，保留原刻度。 */
  hideValue?: boolean
  /** 结果使用完整轮廓，开关交换前景与底色；默认保持首页外观。 */
  presentation?: 'home' | 'result' | 'switch'
  /** 开关心率线条的颜色；其他外观忽略。 */
  heartRateColor?: string
  /** 显式原生画布尺寸，省略时保持首页尺寸。 */
  width?: number
  height?: number
  /** 结果解读使用血氧符号，其余场景默认使用完整半圆仪表。 */
  oxygenStyle?: 'dial' | 'symbol'
}

/** 预计算 Demo 的 15 段半圆刻度，避免每次渲染重复执行三角函数。 */
const OXYGEN_SEGMENTS = Array.from({ length: 15 }, (_, index) => {
  const angle = (185 + (170 * index) / 14) * Math.PI / 180
  return {
    x1: 70 + Math.cos(angle) * 51,
    y1: 64 + Math.sin(angle) * 51,
    x2: 70 + Math.cos(angle) * 61,
    y2: 64 + Math.sin(angle) * 61,
  }
})
/** 心率波纹每 4.8 秒循环一次，两道波纹相隔半个周期。 */
const HEART_RIPPLE_DURATION = 4800
const HEART_RIPPLE_OFFSET = HEART_RIPPLE_DURATION / 2

/** 绘制与 Demo 同构的指标插画；图形不推断或标记健康评估结论。 */
export function HealthIndicatorArtwork({ kind, value = null, emptyLabel = '—', hideValue = false, presentation = 'home', heartRateColor, width: requestedWidth, height: requestedHeight, oxygenStyle = 'dial' }: HealthIndicatorArtworkProps) {
  const theme = useTheme()
  const rawId = useId()
  const gradientId = `health-art-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const surface = theme.colors.surface.default
  const rose = theme.colors.accent.rose
  const mint = theme.colors.brand.gradient.end
  const primary = theme.colors.brand.primary
  const oxygenFillCount = value == null ? 0 : Math.max(0, Math.min(15, Math.trunc(value - 85)))
  const width = requestedWidth ?? (kind === 'oxygenSaturation' ? 126 : kind === 'diabetesRisk' ? 48 : 64)
  const height = requestedHeight ?? (kind === 'oxygenSaturation' ? 74 : kind === 'diabetesRisk' ? 48 : 64)
  const home = presentation === 'home'

  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(true)
  const firstRipple = useRef(new Animated.Value(0)).current
  const secondRipple = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (kind !== 'heartRate' || !home) return

    let mounted = true
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      if (mounted) setReduceMotionEnabled(enabled)
    })
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotionEnabled(enabled)
      })
      .catch(() => undefined)

    return () => {
      mounted = false
      subscription.remove()
    }
  }, [home, kind])

  useEffect(() => {
    if (kind !== 'heartRate' || !home || reduceMotionEnabled) return

    const firstAnimation = Animated.loop(Animated.timing(firstRipple, {
      toValue: 1,
      duration: HEART_RIPPLE_DURATION,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }))
    const secondAnimation = Animated.sequence([
      Animated.delay(HEART_RIPPLE_OFFSET),
      Animated.loop(Animated.timing(secondRipple, {
        toValue: 1,
        duration: HEART_RIPPLE_DURATION,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })),
    ])

    firstAnimation.start()
    secondAnimation.start()
    return () => {
      firstAnimation.stop()
      secondAnimation.stop()
      firstRipple.setValue(0)
      secondRipple.setValue(0)
    }
  }, [firstRipple, home, kind, reduceMotionEnabled, secondRipple])

  const firstRippleScale = reduceMotionEnabled
    ? 1
    : firstRipple.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1.12] })
  const firstRippleOpacity = reduceMotionEnabled
    ? 0.35
    : firstRipple.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.6, 0] })
  const secondRippleScale = reduceMotionEnabled
    ? 0.82
    : secondRipple.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1.12] })
  const secondRippleOpacity = reduceMotionEnabled
    ? 0.35
    : secondRipple.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.6, 0] })
  const heartRippleBorderStyle = {
    position: 'absolute' as const,
    top: height * 5 / 64,
    left: width * 5 / 64,
    width: width * 54 / 64,
    height: height * 54 / 64,
    borderWidth: 1,
    borderColor: `${theme.colors.accent.roseMuted}30`,
    borderRadius: width * 27 / 64,
  }

  return (
    <ArtworkFrame $width={width} $height={height}>
      {kind === 'heartRate' && (
        <View
          style={{ width, height, alignItems: 'center', justifyContent: 'center' }}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Svg width={width} height={height} viewBox="0 0 64 64" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Defs>
              <RadialGradient id={gradientId} cx=".5" cy=".5" r=".5">
                <Stop offset="0" stopColor={rose} stopOpacity=".11" />
                <Stop offset=".48" stopColor={rose} stopOpacity=".11" />
                <Stop offset=".49" stopColor={rose} stopOpacity=".03" />
                <Stop offset=".7" stopColor={rose} stopOpacity=".03" />
                <Stop offset=".71" stopColor={rose} stopOpacity="0" />
              </RadialGradient>
            </Defs>
            {home && <Circle cx="32" cy="32" r="32" fill={`url(#${gradientId})`} />}
            <G transform={home ? 'translate(8 8) scale(.046875)' : 'scale(.0625)'}>
              <Circle cx="512" cy="512" r="480" fill={presentation === 'switch' ? heartRateColor ?? theme.colors.text.muted : surface} />
              <Path
                d="M512 992C246.905 992 32 777.095 32 512 32 246.905 246.905 32 512 32c265.095 0 480 214.905 480 480 0 265.095-214.905 480-480 480z m308.595-527.61c0-49.005-19.92-95.955-55.26-130.32-63.975-62.505-167.115-52.365-245.85 9.345-78.735-61.725-181.845-71.85-245.85-9.33a181.8 181.8 0 0 0-55.23 130.305 181.8 181.8 0 0 0 55.26 130.35L468.35 784.85a73.35 73.35 0 0 0 102.24 0l194.76-190.14a181.755 181.755 0 0 0 55.23-130.32zM738.5 361.595a143.37 143.37 0 0 1 43.65 102.795 143.37 143.37 0 0 1-43.65 102.81L543.77 757.37a34.89 34.89 0 0 1-48.525 0L300.5 567.23a143.43 143.43 0 0 1-43.65-102.84 143.4 143.4 0 0 1 43.62-102.81c50.925-49.74 139.755-37.815 206.265 21.21l12.75 11.325 12.78-11.325c66.48-59.025 155.34-70.95 206.25-21.195zM450.59 563.03l32.865 79.245c6.825 16.44 30.435 15.555 36-1.35l40.5-122.7 15.72 53.985c2.52 8.625 10.695 14.355 19.68 13.8l66.39-4.245a19.2 19.2 0 1 0-2.445-38.325l-51.015 3.24-28.74-98.595c-5.28-18.105-30.795-18.555-36.705-.63l-43.68 132.345-29.01-69.93c-6.285-15.15-27.42-15.975-34.875-1.38l-17.82 34.905h-44.25a19.2 19.2 0 1 0 0 38.415h56.025c7.23 0 13.845-4.05 17.115-10.485l4.245-8.295z m-54.405-162.39a70.455 70.455 0 0 0-70.47 70.425 19.2 19.2 0 0 0 38.43 0c0-17.67 14.34-32.01 32.04-32.01a19.2 19.2 0 1 0 0-38.4z"
                fill={presentation === 'switch' ? surface : rose}
              />
            </G>
          </Svg>
          {home && <Animated.View
            pointerEvents="none"
            style={[
              heartRippleBorderStyle,
              { opacity: firstRippleOpacity, transform: [{ scale: firstRippleScale }] },
            ]}
          />}
          {home && <Animated.View
            pointerEvents="none"
            style={[
              heartRippleBorderStyle,
              { opacity: secondRippleOpacity, transform: [{ scale: secondRippleScale }] },
            ]}
          />}
        </View>
      )}
      {kind === 'respirationRate' && (
        <Svg width={home ? 48 : width} height={home ? 48 : height} viewBox="0 0 1024 1024" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Path d="M991.72665875 511.72499A479.72148469 479.72148469 0 1 1 513.85025656 32.00350531a479.72148469 479.72148469 0 0 1 477.87640219 479.72148469z" fill={primary} />
          <Path
            d="M791.90420937 465.22890781c-51.10878938-152.95735031-154.80243281-172.33071844-154.80243281-172.3307175-20.48041687-10.14795469-22.87902469-11.43951188-47.78764031 3.32114813s-18.45082594 59.41166063-17.15926875 73.80330562a166.05743719 166.05743719 0 0 1-1.10704875 22.69451625A77.67797906 77.67797906 0 0 1 532.30108344 364.11837969c0-56.82854531 7.1958225-153.69538313 7.19582156-153.69538313h-36.90165281s5.35074 90.40904906 3.69016593 150.00521813a97.9738875 97.9738875 0 0 1-33.76501218 26.01566531 131.00086688 131.00086688 0 0 1 0-17.34377719c1.29155812-13.83811969 7.93385531-58.30461094-16.97476032-73.80330562s-27.30722344-13.46910281-47.78764031-3.32114813c0 0-103.69364438 18.45082594-154.98694125 172.3307175s-45.57354094 245.39599031 6.82680563 275.10182063 151.48128469 18.45082594 189.12097031-4.61270625 26.20017375-68.45256563 25.09312313-86.71888407a403.88858813 403.88858813 0 0 1 6.64229812-76.57092937 738.03305344 738.03305344 0 0 0 1.10704969-92.25413156 48.34116469 48.34116469 0 0 1 35.42558625-20.29590844 56.64403687 56.64403687 0 0 1 45.57354094 26.38468125 707.22017344 707.22017344 0 0 0 1.10704968 85.42732594 419.20277437 419.20277437 0 0 1 6.82680563 76.57092937c-1.10704969 18.45082594-12.54656156 63.83985937 25.09312406 86.71888406s136.53611531 34.31853656 188.93646188 4.61270625 58.67362781-120.48389625 7.38033-273.44124656z"
            fill={surface}
          />
        </Svg>
      )}
      {kind === 'oxygenSaturation' && oxygenStyle === 'symbol' && <OxygenSaturationSymbol width={width} height={height} />}
      {kind === 'oxygenSaturation' && oxygenStyle === 'dial' && (
        <Svg width={width} height={height} viewBox="0 0 140 84" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {OXYGEN_SEGMENTS.map((segment, index) => (
            <Line
              key={index}
              x1={segment.x1}
              y1={segment.y1}
              x2={segment.x2}
              y2={segment.y2}
              stroke={index < oxygenFillCount ? mint : theme.colors.border.default}
              strokeWidth={6}
              strokeLinecap="round"
              strokeOpacity={index < oxygenFillCount ? 0.65 : 1}
            />
          ))}
          {!hideValue && <Text x="66" y="61" textAnchor="middle" fontSize="32" fontWeight="600" fill={theme.colors.text.primary}>
            {value == null ? emptyLabel : formatHealthNumber(value)}
          </Text>}
          {!hideValue && value != null && <Text x="91" y="52" fontSize="14" fill={theme.colors.text.muted}>%</Text>}
          <Text x="8" y="82" fontSize="12" fill={theme.colors.text.muted}>85</Text>
          <Text x="109" y="82" fontSize="12" fill={theme.colors.text.muted}>100</Text>
        </Svg>
      )}
      {kind === 'diabetesRisk' && (
        <Svg width={width} height={height} viewBox="0 0 1024 1024" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Circle cx="512" cy="512" r="480" fill={surface} />
          <Path
            d="M512 992c265.104 0 480-214.896 480-480S777.104 32 512 32 32 246.896 32 512s214.896 480 480 480z m16.176-717.408c3.36 1.728 6.24 4.224 8.4 7.248 47.376 66.192 166.224 240.24 166.224 322.224a185.424 185.424 0 0 1-370.8 0c0-81.984 118.8-256.032 166.176-322.224a23.616 23.616 0 0 1 30-7.2z m-95.616 443.52a25.776 25.776 0 0 0 16.608-45.456c-47.04-39.552-31.2-99.84-30.432-102.72a25.728 25.728 0 0 0-49.44-14.208c-1.152 3.84-26.4 94.8 46.704 156.384a25.776 25.776 0 0 0 16.56 6.048z m42.96 14.688a27.36 27.36 0 1 0 54.768-.096 27.36 27.36 0 0 0-54.72.096z"
            fill={rose}
          />
        </Svg>
      )}
    </ArtworkFrame>
  )
}
