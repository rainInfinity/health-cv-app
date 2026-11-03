/** 将浅色主题中的椭圆径向配方绘制为本地 SVG 背景。 */

import { useWindowDimensions } from 'react-native'
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg'
import { useTheme } from 'styled-components/native'

import { GradientSurface } from './styles'

/** 描述主题中定义的产品页与品牌开屏背景类型。 */
export interface GradientBackgroundProps {
  /** 开屏半径按视口比例缩放，其余页面使用主题定义的 dp 半径。 */
  variant: 'home' | 'functions' | 'account' | 'auth' | 'startup'
}

/** 从八位十六进制 token 中读取透明度并返回实色与比例。 */
function splitAlpha(color: string): { solidColor: string; opacity: number } {
  if (color.length !== 9) return { solidColor: color, opacity: 1 }
  return {
    solidColor: color.slice(0, 7),
    opacity: Number.parseInt(color.slice(7), 16) / 255,
  }
}

/** 将主题渐变配方绘制为不拦截交互的本地 SVG 背景。 */
export function GradientBackground({ variant }: GradientBackgroundProps) {
  const theme = useTheme()
  const { width, height } = useWindowDimensions()
  const recipe = theme.backgrounds[variant]

  return (
    <GradientSurface pointerEvents="none" accessible={false}>
      <Svg
        width={width}
        height={height}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Defs>
          {recipe.layers.map((layer, index) => {
            const { solidColor, opacity } = splitAlpha(layer.color)
            const centerX = layer.center.x * width
            const centerY = layer.center.y * height
            const radiusX = layer.radius.x * (variant === 'startup' ? width : 1)
            const radiusY = layer.radius.y * (variant === 'startup' ? height : 1)
            const gradientId = `page-background-${variant}-${index}`
            return (
              <RadialGradient
                key={gradientId}
                id={gradientId}
                cx="0"
                cy="0"
                r="1"
                gradientUnits="userSpaceOnUse"
                gradientTransform={`translate(${centerX} ${centerY}) scale(${radiusX} ${radiusY})`}
              >
                <Stop offset="0" stopColor={solidColor} stopOpacity={opacity} />
                <Stop offset="1" stopColor={solidColor} stopOpacity="0" />
              </RadialGradient>
            )
          })}
        </Defs>
        <Rect width={width} height={height} fill={recipe.base} />
        {recipe.layers.map((layer, index) => {
          const gradientId = `page-background-${variant}-${index}`
          return (
            <Ellipse
              key={gradientId}
              cx={layer.center.x * width}
              cy={layer.center.y * height}
              rx={layer.radius.x * (variant === 'startup' ? width : 1)}
              ry={layer.radius.y * (variant === 'startup' ? height : 1)}
              fill={`url(#${gradientId})`}
            />
          )
        })}
      </Svg>
    </GradientSurface>
  )
}
