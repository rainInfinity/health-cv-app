/** 定义共享文本层级与中性语义颜色。 */

import styled from 'styled-components/native'

/** 描述应用页面当前使用的文本语义层级。 */
export type AppTextVariant = 'display' | 'title' | 'section' | 'body' | 'label' | 'caption'

/** 描述文字的中性展示色调。 */
export type AppTextTone = 'primary' | 'secondary' | 'muted' | 'error'

const TEXT_METRICS = {
  display: { size: 'display', weight: 'bold' },
  title: { size: 'xxl', weight: 'semibold' },
  section: { size: 'xl', weight: 'semibold' },
  body: { size: 'md', weight: 'regular' },
  label: { size: 'md', weight: 'medium' },
  caption: { size: 'sm', weight: 'regular' },
} as const

/** 遵循应用 token 的文字节点。 */
export const TextElement = styled.Text<{ $variant: AppTextVariant; $tone: AppTextTone }>`
  color: ${({ theme, $tone }) =>
    $tone === 'secondary'
      ? theme.colors.text.secondary
      : $tone === 'muted'
        ? theme.colors.text.muted
        : theme.colors.text.primary};
  font-size: ${({ theme, $variant }) => theme.typography.size[TEXT_METRICS[$variant].size]}px;
  line-height: ${({ theme, $variant }) => theme.typography.lineHeight[TEXT_METRICS[$variant].size]}px;
  font-weight: ${({ theme, $variant }) => theme.typography.weight[TEXT_METRICS[$variant].weight]};
`
