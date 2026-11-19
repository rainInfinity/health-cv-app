/** 定义全局 Toast 的图标与正文布局。 */

import styled from 'styled-components/native'
import { AppText } from '@/shared/components/AppText'

/** 在屏幕中央呈现提示，并用蒙版隔离原页面和已有弹层。 */
export const ToastOverlay = styled.View`
  flex: 1;
  justify-content: center;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.md}px;
  background-color: ${({ theme }) => `${theme.colors.text.primary}54`};
`

/** 与 Demo 保持 196 dp 宽、1:1 比例及上图下文布局。 */
export const ToastSurface = styled.View`
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.md}px;
  width: 196px;
  max-width: 100%;
  aspect-ratio: 1;
  padding: ${({ theme }) => `${theme.spacing.xs}px ${theme.spacing.xl}px`};
  border-width: 1px;
  border-style: solid;
  border-color: ${({ theme }) => theme.roles.feedback.border};
  border-radius: ${({ theme }) => theme.radius.lg}px;
  background-color: ${({ theme }) => theme.roles.feedback.background};
`

/** Toast 正文居中换行，字号、行高和字重与 Demo 一致。 */
export const ToastCopy = styled(AppText)`
  width: 100%;
  text-align: center;
  font-size: 15px;
  line-height: 22px;
  font-weight: 600;
`
