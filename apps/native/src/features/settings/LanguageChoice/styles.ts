/** 定义语言单选项的触控表面和选择指示器。 */

import styled from 'styled-components/native'

/** 具备至少 48 dp 触控高度的单选操作表面。 */
export const Option = styled.Pressable<{ $selected: boolean }>`
  min-height: ${({ theme }) => theme.icon.touchTarget}px;
  flex-direction: row;
  align-items: center;
  border-width: 1px;
  border-color: ${({ $selected, theme }) =>
    $selected ? theme.roles.button.primary.background : theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radius.md}px;
  background-color: ${({ $selected, theme }) =>
    $selected ? theme.colors.brand.subtle : theme.colors.surface.default};
  padding-horizontal: ${({ theme }) => theme.spacing.md}px;
  padding-vertical: ${({ theme }) => theme.spacing.sm}px;
`

/** 显示当前是否选中的单选圆环。 */
export const RadioOuter = styled.View<{ $selected: boolean }>`
  width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  border-width: 2px;
  border-color: ${({ $selected, theme }) =>
    $selected ? theme.roles.button.primary.background : theme.colors.text.secondary};
  border-radius: ${({ theme }) => theme.radius.pill}px;
  margin-right: ${({ theme }) => theme.spacing.md}px;
`

/** 填充已选中的单选圆环。 */
export const RadioInner = styled.View`
  width: 10px;
  height: 10px;
  border-radius: ${({ theme }) => theme.radius.pill}px;
  background-color: ${({ theme }) => theme.roles.button.primary.background};
`
