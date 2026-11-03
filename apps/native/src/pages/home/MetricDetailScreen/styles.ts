/** 定义指标详情弹层、数值和功能说明的层级。 */

import styled from 'styled-components/native'

/** 将弹层标题与关闭操作分置两端。 */
export const DetailHeader = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm}px;
`

/** 为弹层关闭操作提供大尺寸触控目标。 */
export const DetailClose = styled.Pressable`
  width: ${({ theme }) => theme.icon.touchTarget}px;
  height: ${({ theme }) => theme.icon.touchTarget}px;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.radius.pill}px;
  background-color: ${({ theme }) => theme.colors.surface.subtle};
`

/** 将大数值及其单位并排并保持基线对齐。 */
export const MetricValueRow = styled.View`
  flex-direction: row;
  align-items: baseline;
  gap: ${({ theme }) => theme.spacing.sm}px;
`

/** 将多个摘要字段按稳定垂直间距排列。 */
export const MetricSummary = styled.View`
  gap: ${({ theme }) => theme.spacing.sm}px;
`

/** 将功能说明标题和正文组合为单独内容区。 */
export const DetailSection = styled.View`
  gap: ${({ theme }) => theme.spacing.xs}px;
`
