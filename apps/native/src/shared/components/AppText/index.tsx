/** 结合应用文字 token 与系统字号缩放提供通用文字层级。 */

import { useWindowDimensions, type TextProps } from 'react-native'

import { TextElement } from './styles'
import type { AppTextTone, AppTextVariant } from './styles'
export type { AppTextTone, AppTextVariant } from './styles'


/** 描述共享文本的语义和原生无障碍属性。 */
export interface AppTextProps extends TextProps {
  /** 用于匹配信息层级的排版角色。 */
  variant?: AppTextVariant
  /** 文字语义色；普通操作错误不使用评估状态色。 */
  tone?: AppTextTone
}

/** 按系统字号同步缩放行高，并提供可换行的通用文字层级。 */
export function AppText({ variant = 'body', tone = 'primary', ...textProps }: AppTextProps) {
  const { fontScale } = useWindowDimensions()
  return <TextElement $variant={variant} $tone={tone} $fontScale={fontScale} {...textProps} />
}
