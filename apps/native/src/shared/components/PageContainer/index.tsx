/** 组合页面安全区、浅色表面与可滚动内容区域。 */

import type { ReactNode } from 'react'
import type { ScrollViewProps, StyleProp, ViewStyle } from 'react-native'
import type { SafeAreaViewProps } from 'react-native-safe-area-context'
import { useTheme } from 'styled-components/native'
import { GradientBackground } from '@/shared/components/GradientBackground'

import { PageScrollView, PageSurface } from './styles'

/** 描述共享页面容器及其滚动内容。 */
export interface PageContainerProps extends Omit<ScrollViewProps, 'children' | 'contentContainerStyle'> {
  /** 页面主体内容。 */
  children: ReactNode
  /** 覆盖默认间距时附加的内容容器样式。 */
  contentContainerStyle?: StyleProp<ViewStyle>
  /** 页面拥有的安全区边缘；原生导航头默认负责顶部安全区。 */
  edges?: SafeAreaViewProps['edges']
  /** 可选主题渐变背景；未指定时使用纯浅色画布。 */
  backgroundVariant?: 'home' | 'functions' | 'account' | 'auth' | 'startup'
}

/** 提供不重复占用导航顶部 inset、并可滚动及避让键盘的页面外壳。 */
export function PageContainer({
  children,
  contentContainerStyle,
  edges = ['left', 'right', 'bottom'],
  backgroundVariant,
  keyboardShouldPersistTaps = 'handled',
  ...scrollProps
}: PageContainerProps) {
  const theme = useTheme()

  return (
    <PageSurface
      edges={edges}
      style={backgroundVariant != null ? { backgroundColor: 'transparent' } : undefined}
    >
      {backgroundVariant != null && <GradientBackground variant={backgroundVariant} />}
      <PageScrollView
        {...scrollProps}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        contentContainerStyle={[
          {
            flexGrow: 1,
            gap: theme.spacing.md,
            padding: theme.spacing.lg,
          },
          contentContainerStyle,
        ]}
      >
        {children}
      </PageScrollView>
    </PageSurface>
  )
}
