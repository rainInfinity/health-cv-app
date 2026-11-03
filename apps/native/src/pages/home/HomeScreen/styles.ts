/** 定义首页品牌区、免责声明和健康指标布局。 */

import styled from 'styled-components/native'

/** 将品牌标志、名称和免责声明并列放置。 */
export const HomeHeader = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm}px;
`

/** 将品牌标志与名称保持紧凑对齐。 */
export const BrandGroup = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs}px;
`

/** 以品牌标题角色显示首页名称。 */
export const BrandTitle = styled.Text`
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: ${({ theme }) => theme.typography.size.xxl}px;
  line-height: ${({ theme }) => theme.typography.lineHeight.xxl}px;
  font-weight: ${({ theme }) => theme.typography.weight.semibold};
`

/** 收窄免责声明宽度，使其不挤压品牌标志和名称。 */
export const Disclaimer = styled.View`
  max-width: 132px;
`

/** 在指标网格前提供标题与卡片的分隔间距。 */
export const IndicatorHeading = styled.View`
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`
