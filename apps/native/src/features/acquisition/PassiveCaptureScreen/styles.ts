/** 定义被动采集页的操作和产物分组布局。 */

import { StyleSheet } from 'react-native'
import styled from 'styled-components/native'

/** 纵向排列服务启停动作和忙碌提示。 */
export const ActionGroup = styled.View`
  gap: ${({ theme }) => theme.spacing.sm}px;
`

/** 以细分隔线区分已完成的视频引用。 */
export const ArtifactGroup = styled.View`
  gap: ${({ theme }) => theme.spacing.xs}px;
  padding-top: ${({ theme }) => theme.spacing.sm}px;
  border-top-width: ${StyleSheet.hairlineWidth}px;
  border-top-color: ${({ theme }) => theme.roles.divider};
`
