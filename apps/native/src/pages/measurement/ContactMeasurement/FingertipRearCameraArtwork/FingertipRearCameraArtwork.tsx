/** 复用 Demo 后摄原始几何，以独立原生图层移动手指，不切换相机。 */

import { memo, useId, useMemo, useState } from 'react'
import { Animated, type LayoutChangeEvent } from 'react-native'
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { useTheme } from 'styled-components/native'

import { ArtworkFrame, ArtworkLayer } from './styles'

/** 原画布中的数值，允许由宿主选择原生或现有 JS 动画驱动。 */
type MotionValue = number | Animated.Value | Animated.AnimatedInterpolation<number>

interface FingertipRearCameraArtworkProps {
  /** 可用图解高度，单位 dp。 */
  height: number
  /** 增加相邻后摄高亮、方向箭头及原稿右侧留白。 */
  switching?: boolean
  /** 手指在原始后摄坐标中的水平位移。 */
  handX?: MotionValue
  /** 手指在原始后摄坐标中的垂直位移。 */
  handY?: MotionValue
  /** 循环回位时隐藏手指。 */
  handOpacity?: MotionValue
  /** 起始后摄的覆盖高亮。 */
  sourceOpacity: MotionValue
  /** 相邻后摄的覆盖高亮。 */
  targetOpacity?: MotionValue
  /** 手指移动方向的提示。 */
  arrowOpacity?: MotionValue
}

/** 将原稿坐标位移映射到实际 Svg 缩放，图层透明度和位移可使用 native driver。 */
export const FingertipRearCameraArtwork = memo(function FingertipRearCameraArtwork({ height, switching = false, handX = 0, handY = 0, handOpacity = 1, sourceOpacity, targetOpacity = 0, arrowOpacity = 0 }: FingertipRearCameraArtworkProps) {
  const theme = useTheme()
  const id = `finger-rear-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const [width, setWidth] = useState(0)
  const art = theme.colors.illustration
  const surface = theme.colors.surface.default
  const brand = theme.colors.brand
  const viewBox = switching ? '15 0 95 128' : '15 0 80 128'
  const scale = Math.min(width / (switching ? 95 : 80), height / 128) * 0.075
  const handStyle = useMemo(() => ({
    opacity: handOpacity,
    transform: [
      { translateX: typeof handX === 'number' ? handX * scale : Animated.multiply(handX, scale) },
      { translateY: typeof handY === 'number' ? handY * scale : Animated.multiply(handY, scale) },
    ],
  }), [handOpacity, handX, handY, scale])

  /** 实际列宽决定原稿等比缩放，不假设弹窗或说明页有相同宽度。 */
  function onLayout(event: LayoutChangeEvent) {
    setWidth(event.nativeEvent.layout.width)
  }

  return (
    <ArtworkFrame onLayout={onLayout} style={{ height }} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height={height} viewBox={viewBox} fill="none" accessible={false}>
        <Defs>
          <LinearGradient id={`${id}-phone`} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop stopColor={art.tealLight} />
            <Stop offset="1" stopColor={brand.gradient.end} />
          </LinearGradient>
        </Defs>
        <Ellipse cx="56" cy="122" rx="30" ry="3" fill={brand.subtle} />
        <G transform="translate(18 -8) scale(.075)">
          <Rect x="224" y="258" width="632" height="1200" rx="100" fill={surface} />
          <Rect x="235" y="270" width="610" height="1180" rx="90" fill={`url(#${id}-phone)`} stroke={art.cameraRim} strokeWidth="13" />
          <Rect x="350" y="350" width="390" height="390" rx="110" fill={art.cameraRim} />
          <G fill={art.camera} stroke={art.blueLight} strokeWidth="12">
            <Circle cx="450" cy="450" r="55" />
            <Circle cx="620" cy="480" r="55" />
            <Circle cx="450" cy="620" r="55" />
            <Circle cx="620" cy="620" r="55" />
          </G>
          <Rect x="534" y="400" width="22" height="50" rx="11" fill={art.flash} stroke={surface} strokeWidth="7" />
        </G>
      </Svg>
      <ArtworkLayer pointerEvents="none" style={{ opacity: sourceOpacity }}>
        <Svg width="100%" height={height} viewBox={viewBox} fill="none" accessible={false}>
          <G transform="translate(18 -8) scale(.075)">
            <Circle cx="450" cy="450" r="90" stroke={brand.primary} strokeWidth="20" />
          </G>
        </Svg>
      </ArtworkLayer>
      {switching && (
        <>
          <ArtworkLayer pointerEvents="none" style={{ opacity: targetOpacity }}>
            <Svg width="100%" height={height} viewBox={viewBox} fill="none" accessible={false}>
              <G transform="translate(18 -8) scale(.075)">
                <Circle cx="620" cy="480" r="90" stroke={brand.primary} strokeWidth="20" />
              </G>
            </Svg>
          </ArtworkLayer>
          <ArtworkLayer pointerEvents="none" style={{ opacity: arrowOpacity }}>
            <Svg width="100%" height={height} viewBox={viewBox} fill="none" accessible={false}>
              <G transform="translate(18 -8) scale(.075)">
                <Path d="M490 320Q590 255 675 365m-58-13 58 13-12-58" stroke={brand.action} strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
              </G>
            </Svg>
          </ArtworkLayer>
        </>
      )}
      <ArtworkLayer pointerEvents="none" style={handStyle}>
        <Svg width="100%" height={height} viewBox={viewBox} fill="none" accessible={false}>
          <Defs>
            <LinearGradient id={`${id}-skin`} x1="440" y1="400" x2="700" y2="1540" gradientUnits="userSpaceOnUse">
              <Stop stopColor={art.skinLight} />
              <Stop offset="1" stopColor={art.skin} />
            </LinearGradient>
          </Defs>
          <G transform="translate(18 -8) scale(.075)">
            <Path d="M110 1568c20-178 11-348 25-478 4-80 55-125 80-195 10-37 26-65 38-56 21 19 5 127 27 264 41-106 64-214 75-345l38-264c8-65 17-113 59-117 45-5 69 33 69 91l-8 387c-1 64 22 96 51 96 38-2 69-30 105-72l86-116c35-63 60-141 78-197 13-32 39-16 54 16 44 78 37 172-5 279 53 23 97 121 63 180 8 77-45 139-81 206-33 53-74 91-91 163l-42 158Z" fill={`url(#${id}-skin)`} stroke={surface} strokeWidth="24" strokeLinejoin="round" />
            <Rect x="431" y="394" width="70" height="95" rx="32" fill={art.skinLight} transform="rotate(-5 466 442)" />
          </G>
        </Svg>
      </ArtworkLayer>
    </ArtworkFrame>
  )
})
