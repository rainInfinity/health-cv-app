/** 定义受控输入项的标签间距、焦点和禁用样式。 */

import styled from 'styled-components/native'

/** 标签和输入内容的纵向组合。 */
export const Field = styled.View`
  gap: ${({ theme }) => theme.spacing.xs}px;
`

/** 可缩放且至少具备 48 dp 触控高度的文本输入节点。 */
export const InputElement = styled.TextInput<{
  $disabled: boolean
  $focused: boolean
  $invalid: boolean
}>`
  min-height: ${({ theme }) => theme.icon.touchTarget}px;
  padding: ${({ theme }) => theme.spacing.sm}px;
  border-width: 1px;
  border-color: ${({ theme, $disabled, $focused, $invalid }) =>
    $disabled
      ? theme.colors.border.default
      : $invalid
        ? theme.roles.error.icon
        : $focused
          ? theme.roles.focusBorder
          : theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radius.md}px;
  background-color: ${({ theme, $disabled }) =>
    $disabled ? theme.colors.surface.subtle : theme.colors.surface.default};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: ${({ theme }) => theme.typography.size.md}px;
  line-height: ${({ theme }) => theme.typography.lineHeight.md}px;
`
