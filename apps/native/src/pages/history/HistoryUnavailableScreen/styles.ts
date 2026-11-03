/** 定义历史未开放说明块的布局。 */

import styled from 'styled-components/native'

/** 为单条历史功能说明保留与产品页一致的间距。 */
export const HistoryCopy = styled.View`
  gap: ${({ theme }) => theme.spacing.sm}px;
`
