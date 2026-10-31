/** 定义相机查询中的分组、选择项和输入布局。 */

import { StyleSheet } from 'react-native'
import styled from 'styled-components/native'

/** 以分隔线组织相机能力与组合结果。 */
export const CapabilityGroup = styled.View`
  gap: ${({ theme }) => theme.spacing.sm}px;
  padding-top: ${({ theme }) => theme.spacing.md}px;
  border-top-width: ${StyleSheet.hairlineWidth}px;
  border-top-color: ${({ theme }) => theme.roles.divider};
`

/** 纵向排列相机选项及其方向说明。 */
export const CameraChoice = styled.View`
  gap: ${({ theme }) => theme.spacing.xs}px;
`

/** 为输入字段提供适应窄屏的纵向布局。 */
export const QueryInputs = styled.View`
  gap: ${({ theme }) => theme.spacing.sm}px;
`
