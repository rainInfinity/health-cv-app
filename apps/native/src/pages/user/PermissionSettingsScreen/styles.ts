/** 定义权限状态行、分组及状态文字布局。 */

import styled from 'styled-components/native'

/** 纵向排列单项权限说明和显式请求操作。 */
export const PermissionGroup = styled.View`
  gap: ${({ theme }) => theme.spacing.sm}px;
`

/** 将权限状态名称与当前系统状态分列显示。 */
export const PermissionRow = styled.View`
  min-height: ${({ theme }) => theme.icon.touchTarget}px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm}px;
  padding-vertical: ${({ theme }) => theme.spacing.xs}px;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.border.default};
`
