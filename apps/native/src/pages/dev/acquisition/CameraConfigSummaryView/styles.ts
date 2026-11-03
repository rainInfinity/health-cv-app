/** 定义相机配置摘要内部内容的排版。 */

import styled from 'styled-components/native'

/** 让配置明细按短间距纵向排列并允许长文案换行。 */
export const SummaryDetails = styled.View`
  gap: ${({ theme }) => theme.spacing.xs}px;
`
