/** 指尖放置指导沿用反馈弹窗表面，双列图解保持原稿间距。 */

import styled from 'styled-components/native'

import { AppText } from '@/shared/components/AppText'

/** 标题在弹窗可用内容宽度内居中，不影响其他反馈弹窗。 */
export const GuideTitle = styled(AppText)`
  text-align: center;
`

export const GuideContent = styled.View`
  flex-shrink: 0;
`

export const Examples = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.xs}px;
  margin-top: ${({ theme }) => theme.spacing.lg}px;
`

export const Example = styled.View`
  flex: 1;
  min-width: 0;
`

export const Caption = styled.View`
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xxs}px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`
