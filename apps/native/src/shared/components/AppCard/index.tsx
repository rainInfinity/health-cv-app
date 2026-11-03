/** 提供统一表面、边距和圆角的内容卡片。 */

import { useId, useState, type ReactNode } from 'react'
import type { LayoutChangeEvent, ViewProps } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { useTheme } from 'styled-components/native'

import { CardGradient, CardSurface } from './styles'
import type { AppCardContentPadding, AppCardVariant } from './styles'
export type { AppCardContentPadding, AppCardVariant } from './styles'

/** 描述卡片内容及其可访问的原生容器属性。 */
export interface AppCardProps extends ViewProps {
  /** 卡片内部的页面内容。 */
  children: ReactNode
  /** 默认、次级表面，或健康与功能主题渐变。 */
  variant?: AppCardVariant
  /** 卡片内容的边距；数值统一设置四边，轴向对象单位为 dp。 */
  contentPadding?: AppCardContentPadding
  /** 卡片直接子元素之间的间距，单位为 dp。 */
  contentGap?: number
}

/** 将健康或功能渐变按主题角度绘制为可裁切 SVG 背景。 */
function CardGradientBackground({ variant }: { variant: 'health' | 'function' }) {
  const theme = useTheme()
  const gradientId = useId()
  const [gradientSize, setGradientSize] = useState({ width: 0, height: 0 })
  const recipe = variant === 'health' ? theme.gradients.healthCard : theme.gradients.functionCard
  const radians = recipe.angle * Math.PI / 180
  const dx = Math.sin(radians)
  const dy = -Math.cos(radians)
  const length = Math.abs(gradientSize.width * dx) + Math.abs(gradientSize.height * dy)

  return (
    <CardGradient
      pointerEvents="none"
      accessible={false}
      onLayout={(event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout
        setGradientSize((previous) => previous.width === width && previous.height === height
          ? previous
          : { width, height })
      }}
    >
      {gradientSize.width > 0 && gradientSize.height > 0 && (
        <Svg
          width={gradientSize.width}
          height={gradientSize.height}
          viewBox={`0 0 ${gradientSize.width} ${gradientSize.height}`}
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Defs>
            <LinearGradient
              id={gradientId}
              gradientUnits="userSpaceOnUse"
              x1={(gradientSize.width - dx * length) / 2}
              y1={(gradientSize.height - dy * length) / 2}
              x2={(gradientSize.width + dx * length) / 2}
              y2={(gradientSize.height + dy * length) / 2}
            >
              {recipe.colors.map((color, index) => (
                <Stop key={index} offset={recipe.locations[index]} stopColor={color} />
              ))}
            </LinearGradient>
          </Defs>
          <Rect
            width={gradientSize.width}
            height={gradientSize.height}
            rx={theme.radius.lg}
            fill={`url(#${gradientId})`}
          />
        </Svg>
      )}
    </CardGradient>
  )
}

/** 渲染可组合、支持健康与功能渐变且遵循共享主题的内容卡片。 */
export function AppCard({
  children,
  variant = 'default',
  contentPadding,
  contentGap,
  ...viewProps
}: AppCardProps) {
  const theme = useTheme()
  return (
    <CardSurface
      $variant={variant}
      $contentPadding={contentPadding}
      $contentGap={contentGap}
      {...viewProps}
      style={[theme.surfaceElevation.raised, viewProps.style]}
    >
      {(variant === 'health' || variant === 'function') && <CardGradientBackground variant={variant} />}
      {children}
    </CardSurface>
  )
}
