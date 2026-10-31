/** 定义共享操作按钮的主题化样式组件。 */

import styled from 'styled-components/native'

/** 按钮交互表面及其禁用、次要语义。 */
export const ButtonRoot = styled.Pressable<{ $disabled: boolean; $secondary: boolean }>`
  width: 100%;
  min-height: ${({ theme }) => theme.icon.touchTarget}px;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.sm}px ${({ theme }) => theme.spacing.md}px;
  border-width: ${({ $secondary }) => ($secondary ? 1 : 0)}px;
  border-color: ${({ theme, $disabled, $secondary }) =>
    $disabled
      ? theme.colors.border.default
      : $secondary
        ? theme.roles.button.secondary.border
        : 'transparent'};
  border-radius: ${({ theme }) => theme.radius.md}px;
  background-color: ${({ theme, $disabled, $secondary }) =>
    $disabled
      ? theme.roles.button.disabled.background
      : $secondary
        ? theme.roles.button.secondary.background
        : theme.roles.button.primary.background};
  opacity: ${({ $disabled }) => ($disabled ? 0.72 : 1)};
`

/** 让按钮文字、装饰图标和加载反馈按需换行并保持居中。 */
export const ButtonContent = styled.View`
  min-height: ${({ theme }) => theme.typography.lineHeight.md}px;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.xs}px;
`

/** 显示可缩放且可换行的按钮名称。 */
export const ButtonLabel = styled.Text<{ $disabled: boolean; $secondary: boolean }>`
  flex-shrink: 1;
  color: ${({ theme, $disabled, $secondary }) =>
    $disabled
      ? theme.roles.button.disabled.foreground
      : $secondary
        ? theme.roles.button.secondary.foreground
        : theme.roles.button.primary.foreground};
  font-size: ${({ theme }) => theme.typography.size.md}px;
  line-height: ${({ theme }) => theme.typography.lineHeight.md}px;
  font-weight: ${({ theme }) => theme.typography.weight.semibold};
  text-align: center;
`

/** 隐藏装饰图标的布局槽，不参与控件无障碍名称。 */
export const IconSlot = styled.View`
  align-items: center;
  justify-content: center;
`
