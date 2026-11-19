/** 指标解读保持图文分栏，完整建议和风险说明独占下方整行。 */

import styled from 'styled-components/native'
import { AppText } from '@/shared/components/AppText'

export const Interpretations = styled.View`
  margin-top: 28px;
  gap: 12px;
`
export const SectionHeading = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
`
export const InterpretationCard = styled.View`
  padding: ${({ theme }) => theme.layout.cardPadding}px;
  border-radius: ${({ theme }) => theme.radius.lg}px;
  background-color: ${({ theme }) => theme.colors.surface.default};
`
export const MainRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 16px;
`
export const Identity = styled.View`
  width: 96px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  gap: 12px;
`
export const IdentityTitle = styled(AppText)`
  text-align: center;
  font-weight: ${({ theme }) => theme.typography.weight.semibold};
`
export const Content = styled.View`
  flex: 1;
  min-width: 0;
`
export const ReadingHeader = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`
export const Reading = styled.View`
  flex-direction: row;
  align-items: baseline;
  gap: 4px;
`
export const ReadingNumber = styled(AppText)`
  font-size: 24px;
  line-height: 32px;
  font-weight: ${({ theme }) => theme.typography.weight.semibold};
`
export const Assessment = styled.View`
  padding: 4px 8px;
  border-radius: 6px;
  background-color: ${({ theme }) => theme.colors.brand.subtle};
`
export const Introduction = styled(AppText)`
  margin-top: 12px;
  font-size: 14px;
  line-height: 24px;
`
export const Guidance = styled.View`
  margin-top: 16px;
  padding-left: 12px;
  border-left-width: 2px;
  border-left-color: ${({ theme }) => theme.colors.brand.primary}47;
`
export const Advice = styled(AppText)`
  font-size: 14px;
  line-height: 24px;
`
export const RiskReading = styled(AppText)`
  font-size: 20px;
  line-height: 28px;
  font-weight: ${({ theme }) => theme.typography.weight.semibold};
`
export const RiskParagraph = styled(AppText)`
  margin-top: 8px;
  font-size: 14px;
  line-height: 24px;
`
