/** 定义默认和次级内容表面的卡片样式。 */

import styled from 'styled-components/native'

/** 描述共享卡片的表面语义。 */
export type AppCardVariant = 'default' | 'subtle'

/** 基础卡片表面，不固定高度且不增加阴影。 */
export const CardSurface = styled.View<{ $variant: AppCardVariant }>`
  gap: ${({ theme }) => theme.spacing.md}px;
  padding: ${({ theme }) => theme.spacing.lg}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  background-color: ${({ theme, $variant }) =>
    $variant === 'subtle' ? theme.colors.surface.subtle : theme.colors.surface.default};
`
