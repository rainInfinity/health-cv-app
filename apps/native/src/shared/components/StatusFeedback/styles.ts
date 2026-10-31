/** 定义普通状态反馈的图标、文字与内容布局。 */

import styled from 'styled-components/native'

/** 将语义图标与多行说明并排显示。 */
export const FeedbackSurface = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.sm}px;
`

/** 为装饰图标预留稳定宽度，不改变文字可读区域。 */
export const IconSlot = styled.View`
  width: ${({ theme }) => theme.icon.default}px;
  min-height: ${({ theme }) => theme.typography.lineHeight.md}px;
  align-items: center;
  justify-content: center;
`

/** 按照标题和说明的层次排列反馈文字。 */
export const TextGroup = styled.View`
  flex: 1;
  gap: ${({ theme }) => theme.spacing.xxs}px;
`
