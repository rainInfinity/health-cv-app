/** 从 Demo 原坐标移植正背面持机说明，不代表真实设备状态。 */

import { memo, useId, useMemo } from 'react'
import { Animated } from 'react-native'
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { useTheme } from 'styled-components/native'

import { ArtworkFrame } from './styles'

interface FingertipInstructionArtworkProps {
  /** 正面或背面的原始持机图。 */
  side: 'back' | 'front'
  /** 保持 80:128 原画布比例的可用高度。 */
  height: number
  /** 关闭放置动画时固定最终几何。 */
  reducedMotion: boolean
  /** 与覆盖环共享局部动画值，不订阅整页覆盖快照。 */
  coverageProgress: Animated.Value
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle)
const AnimatedG = Animated.createAnimatedComponent(G)

/** 复用原稿视框、路径和渐变，实例 ID 避免分页图形串色。 */
export const FingertipInstructionArtwork = memo(function FingertipInstructionArtwork({ side, height, reducedMotion, coverageProgress }: FingertipInstructionArtworkProps) {
  const theme = useTheme()
  const id = `finger-${side}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const art = theme.colors.illustration
  const surface = theme.colors.surface.default
  const brand = theme.colors.brand
  const skin = `url(#${id}-skin)`
  const phone = `url(#${id}-phone)`
  const motion = useMemo(() => ({
    placement: coverageProgress.interpolate({
      inputRange: [0, 63],
      outputRange: [140, 0],
      extrapolate: 'clamp',
    }),
    feedback: coverageProgress.interpolate({
      inputRange: [0, 12, 48],
      outputRange: [0.2, 0.2, 0.8],
      extrapolate: 'clamp',
    }),
  }), [coverageProgress])

  return (
    <ArtworkFrame style={{ height }} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height={height} viewBox="15 0 80 128" fill="none" accessible={false}>
        <Defs>
          <LinearGradient id={`${id}-skin`} x1={side === 'back' ? 440 : 34} y1={side === 'back' ? 400 : 54} x2={side === 'back' ? 700 : 80} y2={side === 'back' ? 1540 : 120} gradientUnits="userSpaceOnUse">
            <Stop stopColor={art.skinLight} />
            <Stop offset="1" stopColor={art.skin} />
          </LinearGradient>
          <LinearGradient id={`${id}-phone`} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop stopColor={art.tealLight} />
            <Stop offset="1" stopColor={brand.gradient.end} />
          </LinearGradient>
        </Defs>
        <Ellipse cx="56" cy="122" rx="30" ry="3" fill={brand.subtle} />
        {side === 'back' ? (
          <G transform="translate(18 -8) scale(.075)">
            <Rect x="224" y="258" width="632" height="1200" rx="100" fill={surface} />
            <Rect x="235" y="270" width="610" height="1180" rx="90" fill={phone} stroke={art.cameraRim} strokeWidth="13" />
            <Rect x="350" y="350" width="390" height="390" rx="110" fill={art.cameraRim} />
            <G fill={art.camera} stroke={art.blueLight} strokeWidth="12">
              <Circle cx="450" cy="450" r="55" />
              <Circle cx="620" cy="480" r="55" />
              <Circle cx="450" cy="620" r="55" />
              <Circle cx="620" cy="620" r="55" />
            </G>
            <Rect x="534" y="400" width="22" height="50" rx="11" fill={art.flash} stroke={surface} strokeWidth="7" />
            <AnimatedCircle cx="450" cy="450" r="90" stroke={brand.primary} strokeWidth="20" opacity={reducedMotion ? 0.8 : motion.feedback} />
            <AnimatedG transform={[{ translateY: reducedMotion ? 0 : motion.placement }]}>
              <Path d="M110 1568c20-178 11-348 25-478 4-80 55-125 80-195 10-37 26-65 38-56 21 19 5 127 27 264 41-106 64-214 75-345l38-264c8-65 17-113 59-117 45-5 69 33 69 91l-8 387c-1 64 22 96 51 96 38-2 69-30 105-72l86-116c35-63 60-141 78-197 13-32 39-16 54 16 44 78 37 172-5 279 53 23 97 121 63 180 8 77-45 139-81 206-33 53-74 91-91 163l-42 158Z" fill={skin} stroke={surface} strokeWidth="24" strokeLinejoin="round" />
              <Rect x="431" y="394" width="70" height="95" rx="32" fill={art.skinLight} transform="rotate(-5 466 442)" />
            </AnimatedG>
          </G>
        ) : (
          <>
            <Path d="M42 119c-2-9-16-18-16-29v-4c0-5 5-7 9-3l7 5 21-5c12-3 22 0 22 10 0 10-6 18-10 26Z" fill={skin} stroke={surface} strokeWidth="2" strokeLinejoin="round" transform="translate(120 0) scale(-1 1)" />
            <Path d="M26 86V72c0-8 8-9 10-2l5 18c2 7 1 12-2 17" fill={skin} stroke={surface} strokeWidth="2" strokeLinecap="round" transform="translate(120 0) scale(-1 1)" />
            <Rect x="33" y="12" width="54" height="96" rx="9" fill={surface} />
            <Rect x="35" y="14" width="50" height="92" rx="8" fill={phone} stroke={art.cameraRim} strokeWidth="1" />
            <Rect x="38" y="17" width="44" height="86" rx="6" fill={surface} />
            <Rect x="50" y="20" width="20" height="4" rx="2" fill={art.camera} />
            <Circle cx="60" cy="57" r="15" fill={brand.subtle} />
            <AnimatedCircle cx="60" cy="57" r="18" stroke={brand.primary} strokeWidth="2" strokeDasharray="83 30" transform="rotate(-90 60 57)" opacity={reducedMotion ? 0.8 : motion.feedback} />
            <Path d="M52 80h16m-12 5h8" stroke={art.cameraRim} strokeWidth="2" strokeLinecap="round" />
            <G fill={skin} stroke={surface} strokeWidth="1.6" transform="translate(120 0) scale(-1 1)">
              <Rect x="80" y="58" width="12" height="18" rx="6" transform="rotate(12 86 67)" />
              <Rect x="80" y="75" width="12" height="17" rx="6" transform="rotate(12 86 83.5)" />
              <Rect x="78" y="91" width="12" height="15" rx="6" transform="rotate(12 84 98.5)" />
            </G>
          </>
        )}
      </Svg>
    </ArtworkFrame>
  )
})
