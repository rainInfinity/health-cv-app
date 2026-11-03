/** 定义基础内容表面及健康、功能渐变卡片样式。 */

import styled from 'styled-components/native'

/** 描述共享卡片的表面语义。 */
export type AppCardVariant = 'default' | 'subtle' | 'health' | 'function'
/** 描述卡片内容的轴向边距，单位为 dp。 */
export interface AppCardContentPaddingAxes {
  /** 左右内边距。 */
  horizontal: number
  /** 上下内边距。 */
  vertical: number
}

/** 卡片内容边距；数值设置四边，对象可分别设置水平和垂直边距。 */
export type AppCardContentPadding = number | AppCardContentPaddingAxes

/** 基础卡片按语义变体提供内容间距、浅色表面和圆角。 */
export const CardSurface = styled.View<{
  $variant: AppCardVariant
  $contentPadding?: AppCardContentPadding
  $contentGap?: number
}>`
  position: relative;
  gap: ${({ theme, $variant, $contentGap }) =>
    $contentGap ?? ($variant === 'health' ? 0 : $variant === 'function' ? theme.spacing.xs : theme.spacing.md)}px;
  padding-horizontal: ${({ theme, $variant, $contentPadding }) => {
    const padding = $contentPadding ?? ($variant === 'function' ? theme.spacing.sm : theme.spacing.lg)
    return typeof padding === 'number' ? padding : padding.horizontal
  }}px;
  padding-vertical: ${({ theme, $variant, $contentPadding }) => {
    const padding = $contentPadding ?? ($variant === 'function' ? theme.spacing.sm : theme.spacing.lg)
    return typeof padding === 'number' ? padding : padding.vertical
  }}px;
  border-radius: ${({ theme }) => theme.radius.lg}px;
  background-color: ${({ theme, $variant }) =>
    $variant === 'subtle' ? theme.colors.surface.subtle : theme.colors.surface.card};
`

/** 在不裁切外层阴影的前提下裁剪渐变内容。 */
export const CardGradient = styled.View`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  overflow: hidden;
  border-radius: ${({ theme }) => theme.radius.lg}px;
`
