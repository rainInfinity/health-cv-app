/** 自然高度简要结果正文，面板滚动和遮罩由共用外壳管理。 */
import styled from 'styled-components/native'
import { AppText } from '@/shared/components/AppText'

export const SummaryBody = styled.View`
  padding: 32px 24px 24px;
`
export const Completion = styled.View`
  align-items: center;
  padding-top: 8px;
  margin-bottom: 20px;
`
export const CompletionTitle = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 10px;
`
export const SuccessTitle = styled(AppText)`
  font-size: 26px;
  line-height: 36px;
  font-weight: ${({ theme }) => theme.typography.weight.semibold};
`
export const CompletionHint = styled(AppText)`
  margin-top: 12px;
  margin-bottom: 8px;
  text-align: center;
`
export const Disclaimer = styled(AppText)`
  margin-top: 8px;
  margin-bottom: 0;
  text-align: center;
  line-height: 20px;
`
export const Actions = styled.View`
  padding-top: 12px;
  gap: 12px;
`
export const RetestButton = styled.Pressable`
  min-height: ${({ theme }) => theme.icon.touchTarget}px;
  padding: 12px 16px;
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radius.pill}px;
  background-color: ${({ theme }) => theme.colors.surface.default};
  align-items: center;
  justify-content: center;
`
