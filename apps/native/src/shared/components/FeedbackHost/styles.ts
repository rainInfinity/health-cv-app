/** 定义反馈浮层遮罩、对话框和 Toast 布局。 */

import styled from 'styled-components/native'

/** 覆盖页面并隔离浮层外部触控的遮罩。 */
export const Overlay = styled.View`
  flex: 1;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.xl}px;
  background-color: rgba(38, 38, 38, 0.32);
`

/** 限制对话框宽度并采用统一圆角与浮层层级。 */
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


/** 为长弹窗正文提供独立可滚动且可收缩的内容区。 */
export const DialogMessageScroll = styled.ScrollView`
  flex-shrink: 1;
`
/** 让多个对话框操作在窄屏上保持足够触控高度。 */
export const DialogActions = styled.View`
  gap: ${({ theme }) => theme.spacing.sm}px;
`

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
