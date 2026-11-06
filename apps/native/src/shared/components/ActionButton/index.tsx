/** 提供具备触控、按压、禁用、加载和无障碍反馈的共享操作按钮。 */

import { useId, useState, type ReactNode } from 'react'
import { type LayoutChangeEvent, type PressableProps } from 'react-native'
import { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { useTheme } from 'styled-components/native'
import { LoadingIndicator } from '@/shared/components/LoadingIndicator'

import { ButtonContent, ButtonGradient, ButtonLabel, ButtonRoot, IconSlot } from './styles'

/** 描述共享按钮的语义、加载状态和图标内容。 */
export interface ActionButtonProps extends Omit<PressableProps, 'children' | 'disabled' | 'onPress' | 'style'> {
  /** 按钮可见且用于默认无障碍名称的操作文本。 */
  label: string
  /** 禁用当前操作，且向辅助技术公开禁用状态。 */
  disabled?: boolean
  /** 使用白色表面和品牌边界的次要按钮样式。 */
  secondary?: boolean
  /** 使用危险操作渐变样式。 */
  danger?: boolean
  /** 显示处理中反馈并阻止重复按压。 */
  loading?: boolean
  /** 与可见文本配合显示的装饰图标。 */
  icon?: ReactNode
  /** 图标位于文字前方或后方。 */
  iconPosition?: 'leading' | 'trailing'
  /** 覆盖可见文本的辅助技术名称。 */
  accessibilityLabel?: string
  /** 辅助技术在名称后朗读的操作说明。 */
  accessibilityHint?: string
  /** 用户手动触发的界面操作。 */
  onPress: () => void
}

/** 渲染至少 48 dp、可感知状态且加载时不重复触发的按钮。 */
export function ActionButton({
  label,
  disabled = false,
  secondary = false,
  danger = false,
  loading = false,
  icon,
  iconPosition = 'leading',
  accessibilityLabel,
  accessibilityHint,
  onPress,
  ...pressableProps
}: ActionButtonProps) {
  const theme = useTheme()
  const gradientId = useId()
  const [size, setSize] = useState({ width: 0, height: 0 })
  const recipe = danger ? theme.roles.button.danger.gradient : theme.roles.button.primary.gradient
  const radians = recipe.angle * Math.PI / 180
  const dx = Math.sin(radians)
  const dy = -Math.cos(radians)
  const length = Math.abs(size.width * dx) + Math.abs(size.height * dy)

  /** 尺寸变化时更新渐变端点，使多行按钮仍保持指定角度。 */
  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout
    setSize((previous) => previous.width === width && previous.height === height ? previous : { width, height })
    pressableProps.onLayout?.(event)
  }
  const unavailable = disabled || loading
  const color = secondary
    ? theme.roles.button.secondary.foreground
    : loading
      ? danger ? theme.roles.button.danger.foreground : theme.roles.button.primary.foreground
      : unavailable
        ? theme.roles.button.disabled.foreground
        : danger
          ? theme.roles.button.danger.foreground
          : theme.roles.button.primary.foreground
  const iconContent = icon == null ? null : (
    <IconSlot accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {icon}
    </IconSlot>
  )

  return (
    <ButtonRoot
      {...pressableProps}
      $disabled={disabled && !loading}
      $secondary={secondary}
      $danger={danger}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: unavailable, busy: loading }}
      disabled={unavailable}
      onPress={onPress}
      onLayout={onLayout}
      style={({ pressed }) => pressed && !unavailable
        ? {
            backgroundColor: secondary
              ? theme.colors.brand.subtle
              : danger
                ? theme.roles.button.danger.background
                : theme.roles.button.primary.pressed,
          }
        : undefined}
    >
      {({ pressed }) => (
        <>
          {!secondary && (loading || !unavailable) && size.width > 0 && size.height > 0 && (
            <ButtonGradient
              width={size.width}
              height={size.height}
              viewBox={`0 0 ${size.width} ${size.height}`}
              pointerEvents="none"
              opacity={loading ? 1 : pressed ? 0.78 : 1}
            >
              <Defs>
                <LinearGradient
                  id={gradientId}
                  gradientUnits="userSpaceOnUse"
                  x1={(size.width - dx * length) / 2}
                  y1={(size.height - dy * length) / 2}
                  x2={(size.width + dx * length) / 2}
                  y2={(size.height + dy * length) / 2}
                >
                  {recipe.colors.map((stopColor, index) => (
                    <Stop key={index} offset={recipe.locations[index]} stopColor={stopColor} />
                  ))}
                </LinearGradient>
              </Defs>
              <Rect width={size.width} height={size.height} fill={`url(#${gradientId})`} />
            </ButtonGradient>
          )}
          <ButtonContent>
            {loading && (
              <LoadingIndicator color={color} size={theme.icon.compact} />
            )}
            {!loading && iconPosition === 'leading' && iconContent}
            <ButtonLabel $disabled={disabled && !loading} $secondary={secondary} $danger={danger}>
              {label}
            </ButtonLabel>
            {!loading && iconPosition === 'trailing' && iconContent}
          </ButtonContent>
        </>
      )}
    </ButtonRoot>
  )
}
