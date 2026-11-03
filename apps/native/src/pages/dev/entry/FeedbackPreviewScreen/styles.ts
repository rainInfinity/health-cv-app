/** 定义统一反馈预览按钮的可滚动垂直间距。 */

import styled from 'styled-components/native'

/** 将不同反馈状态入口按顺序排列。 */
export const PreviewActions = styled.View`
  gap: ${({ theme }) => theme.spacing.sm}px;
`
