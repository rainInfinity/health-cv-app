/** 提供带可见标签、焦点反馈和就近错误说明的受控输入项。 */

import { useState } from 'react'
import type { TextInputProps } from 'react-native'
import { useTheme } from 'styled-components/native'

import { AppText } from '@/shared/components/AppText'
import { Field, InputElement } from './styles'

/** 描述共享受控输入项及其用户可读说明。 */
export interface AppInputProps extends Omit<TextInputProps, 'onChangeText' | 'value'> {
  /** 始终可见并作为输入项无障碍名称的标签。 */
  label: string
  /** 当前输入值。 */
  value: string
  /** 更新受控输入值。 */
  onChangeText(value: string): void
  /** 输入项当前验证错误；为空时不展示错误。 */
  error?: string | null
  /** 输入项下方的补充说明。 */
  helperText?: string
  /** 用户可访问名称；未提供时使用可见标签。 */
  accessibilityLabel?: string
  /** 辅助技术在输入项名称后朗读的说明。 */
  accessibilityHint?: string
  /** 禁止编辑但仍展示当前值。 */
  disabled?: boolean
}

/** 渲染受控、可缩放并能向辅助技术暴露标签与错误的输入项。 */
export function AppInput({
  label,
  value,
  onChangeText,
  error,
  helperText,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  editable = true,
  onFocus,
  onBlur,
  placeholderTextColor,
  selectionColor,
  ...textInputProps
}: AppInputProps) {
  const [focused, setFocused] = useState(false)
  const theme = useTheme()
  const invalid = error != null && error.length > 0
  const isDisabled = disabled || !editable
  const spokenHint = [accessibilityHint, invalid ? error : helperText]
    .filter((part): part is string => part != null && part.length > 0)
    .join('. ')

  return (
    <Field>
      <AppText variant="label">{label}</AppText>
      <InputElement
        {...textInputProps}
        $disabled={isDisabled}
        $focused={focused}
        $invalid={invalid}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={spokenHint.length > 0 ? spokenHint : undefined}
        accessibilityState={{ disabled: isDisabled }}
        editable={!isDisabled}
        value={value}
        onChangeText={onChangeText}
        onFocus={(event) => {
          setFocused(true)
          onFocus?.(event)
        }}
        onBlur={(event) => {
          setFocused(false)
          onBlur?.(event)
        }}
        placeholderTextColor={placeholderTextColor ?? theme.colors.text.muted}
        selectionColor={selectionColor ?? theme.roles.focusBorder}
      />
      {invalid ? (
        <AppText accessibilityRole="alert" tone="error" variant="caption">
          {error}
        </AppText>
      ) : helperText != null ? (
        <AppText tone="secondary" variant="caption">{helperText}</AppText>
      ) : null}
    </Field>
  )
}
