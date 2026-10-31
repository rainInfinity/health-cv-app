/** 提供统一表面、边距和圆角的内容卡片。 */

import type { ReactNode } from 'react'
import type { ViewProps } from 'react-native'

import { CardSurface } from './styles'
import type { AppCardVariant } from './styles'
export type { AppCardVariant } from './styles'

/** 描述卡片内容及可访问的原生容器属性。 */
export interface AppCardProps extends ViewProps {
  /** 卡片内部的页面内容。 */
  children: ReactNode
  /** 默认内容表面或次级表面。 */
  variant?: AppCardVariant
}

/** 渲染可组合、不固定高度且遵循共享主题的内容卡片。 */
export function AppCard({ children, variant = 'default', ...viewProps }: AppCardProps) {
  return (
    <CardSurface $variant={variant} {...viewProps}>
      {children}
    </CardSurface>
  )
}
