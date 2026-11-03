/** 定义共享文本层级与中性语义颜色。 */

import styled from 'styled-components/native'

/** 描述应用页面当前使用的文本语义层级。 */
export type AppTextVariant = 'display' | 'title' | 'section' | 'body' | 'label' | 'caption'

/** 描述文字的中性展示色调。 */
export type AppTextTone = 'primary' | 'secondary' | 'muted' | 'error'

/** 将既有组件变体映射到共享文字角色，不在组件内复制字号。 */
const TEXT_ROLES = {
  display: 'metric',
  title: 'pageTitle',
  section: 'sectionTitle',
  body: 'body',
  label: 'label',
  caption: 'caption',
} as const

/** 按字号比例调整行高并可在 Flex 布局中换行的文字节点。 */
export const TextElement = styled.Text<{ $variant: AppTextVariant; $tone: AppTextTone; $fontScale: number }>`
  color: ${({ theme, $tone }) =>
    $tone === 'secondary'
      ? theme.colors.text.secondary
      : $tone === 'muted'
        ? theme.colors.text.muted
        : theme.colors.text.primary};
  font-size: ${({ theme, $variant }) => theme.typography.roles[TEXT_ROLES[$variant]].fontSize}px;
  line-height: ${({ theme, $variant, $fontScale }) =>
    theme.typography.roles[TEXT_ROLES[$variant]].lineHeight * $fontScale}px;
  flex-shrink: 1;
  font-weight: ${({ theme, $variant }) => theme.typography.roles[TEXT_ROLES[$variant]].fontWeight};
`
