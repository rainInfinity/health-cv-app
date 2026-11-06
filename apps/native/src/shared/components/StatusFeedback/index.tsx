/** 以文字、语义图标和忙碌状态呈现普通操作反馈。 */

import type { ReactNode } from 'react'
import type { ViewProps } from 'react-native'
import { CircleAlert, CircleCheck, Info, LoaderCircle } from '@/shared/graphics'
import { useTheme } from 'styled-components/native'

import { AppText } from '@/shared/components/AppText'
import { FeedbackSurface, IconSlot, TextGroup } from './styles'

/** 描述操作反馈的语义类型，与健康评估结果相互独立。 */
export type StatusFeedbackTone = 'info' | 'pending' | 'success' | 'error'

/** 描述反馈标题、说明及可选的业务图标。 */
export interface StatusFeedbackProps extends ViewProps {
  /** 一句话概括当前反馈状态。 */
  title: string
  /** 可选的补充说明。 */
  message?: string
  /** 反馈语义；错误不使用评估结果颜色。 */
  tone?: StatusFeedbackTone
  /** 可替换默认语义图标；图标仅作装饰，不重复朗读。 */
  icon?: ReactNode
}

/** 呈现带有明确文字和无障碍忙碌状态的通用反馈。 */
export function StatusFeedback({
  title,
  message,
  tone = 'info',
  icon,
  ...viewProps
}: StatusFeedbackProps) {
  const theme = useTheme()
  const Icon = tone === 'error'
    ? CircleAlert
    : tone === 'pending'
      ? LoaderCircle
      : tone === 'success'
        ? CircleCheck
        : Info
  const iconColor = theme.colors.feedback[tone === 'pending' ? 'loading' : tone === 'info' ? 'information' : tone]

  return (
    <FeedbackSurface
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityState={{ busy: tone === 'pending' }}
      {...viewProps}
    >
      <IconSlot accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {icon ?? (
          <Icon
            color={iconColor}
            size={theme.icon.default}
            strokeWidth={theme.icon.strokeWidth}
          />
        )}
      </IconSlot>
      <TextGroup>
        <AppText variant="label">{title}</AppText>
        {message != null && <AppText tone="secondary">{message}</AppText>}
      </TextGroup>
    </FeedbackSurface>
  )
}
