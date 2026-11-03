/** 定义功能说明、免责声明和功能卡片排版。 */

import styled from 'styled-components/native'

/** 将页面标题与免责声明并排放置。 */
export const FeatureIntro = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm}px;
`

/** 以稳定间距排列可达的功能说明卡片。 */
export const FeatureList = styled.View`
  gap: ${({ theme }) => theme.spacing.sm}px;
`
