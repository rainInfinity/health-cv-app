/** 定义相机配置区段和受控输入的纵向布局。 */

import { StyleSheet } from 'react-native'
import styled from 'styled-components/native'

/** 以分隔线分组相机的独立配置类别。 */
export const EditorGroup = styled.View`
  gap: ${({ theme }) => theme.spacing.sm}px;
  padding-top: ${({ theme }) => theme.spacing.md}px;
  border-top-width: ${StyleSheet.hairlineWidth}px;
  border-top-color: ${({ theme }) => theme.roles.divider};
`

/** 为窄屏和大字号保留可读的输入字段宽度。 */
export const EditorInputs = styled.View`
  gap: ${({ theme }) => theme.spacing.sm}px;
`
