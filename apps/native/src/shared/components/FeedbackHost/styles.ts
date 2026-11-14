/** 定义全局 Toast 的图标与正文布局。 */

import styled from 'styled-components/native'

/** 固定 Toast 的横向图标与可换行正文布局。 */
export const ToastSurface = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm}px;
  width: 100%;
  max-width: 520px;
  align-self: center;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-width: 1px;
  border-style: solid;
  border-color: ${({ theme }) => theme.roles.feedback.border};
  border-radius: ${({ theme }) => theme.radius.lg}px;
  background-color: ${({ theme }) => theme.roles.feedback.background};
`

/** 为 Toast 正文保留伸缩空间并维持中性文字颜色。 */
export const ToastCopy = styled.View`
  flex: 1;
`
