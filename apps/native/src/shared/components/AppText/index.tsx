/** 按应用浅色主题提供可缩放的通用文字层级。 */

import type { TextProps } from 'react-native'

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

/** 渲染遵循主题字号、行高和系统字号缩放的文本。 */
export function AppText({ variant = 'body', tone = 'primary', ...textProps }: AppTextProps) {
  return <TextElement $variant={variant} $tone={tone} {...textProps} />
}
