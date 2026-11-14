/** 定义全局弹窗和页面内弹层共用的对话框外观。 */

import styled from 'styled-components/native'

/** 覆盖宿主并隔离浮层外部触控。 */
export const Overlay = styled.View`
  flex: 1;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.xl}px;
  background-color: rgba(38, 38, 38, 0.32);
`

/** 限制对话框宽度并采用统一浮层层级。 */
export const DialogSurface = styled.View`
  width: 100%;
  max-width: 420px;
  align-self: center;
  gap: ${({ theme }) => theme.spacing.md}px;
  padding: ${({ theme }) => theme.spacing.xl}px;
  border-width: 1px;
  border-style: solid;
  border-color: ${({ theme }) => theme.roles.feedback.border};
  border-radius: ${({ theme }) => theme.radius.lg}px;
  background-color: ${({ theme }) => theme.roles.feedback.background};
`

/** 为长正文提供可滚动且可收缩的内容区。 */
export const DialogMessageScroll = styled.ScrollView`
  flex-shrink: 1;
`

/** 保持多个操作之间的统一间距。 */
export const DialogActions = styled.View`
  gap: ${({ theme }) => theme.spacing.sm}px;
`
