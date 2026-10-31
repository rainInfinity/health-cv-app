/** 定义传感器控制区和完成文件的分组布局。 */

import { StyleSheet } from 'react-native'
import styled from 'styled-components/native'

/** 纵向排列单类型的采样输入和启停命令。 */
export const SensorControls = styled.View`
  gap: ${({ theme }) => theme.spacing.sm}px;
  padding-top: ${({ theme }) => theme.spacing.md}px;
  border-top-width: ${StyleSheet.hairlineWidth}px;
  border-top-color: ${({ theme }) => theme.roles.divider};
`

/** 保留单位、时间戳和文件引用之间的阅读间距。 */
export const ArtifactGroup = styled.View`
  gap: ${({ theme }) => theme.spacing.xs}px;
  padding-top: ${({ theme }) => theme.spacing.sm}px;
  border-top-width: ${StyleSheet.hairlineWidth}px;
  border-top-color: ${({ theme }) => theme.roles.divider};
`

/** 汇总本类型当前进程产生的文件记录。 */
export const ArtifactList = styled.View`
  gap: ${({ theme }) => theme.spacing.sm}px;
  padding-top: ${({ theme }) => theme.spacing.sm}px;
  border-top-width: ${StyleSheet.hairlineWidth}px;
  border-top-color: ${({ theme }) => theme.roles.divider};
`
