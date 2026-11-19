/** 四项看板共用排版，只按展示场景切换边框或轻阴影。 */

import styled from 'styled-components/native'
import { AppText } from '@/shared/components/AppText'

export const Dashboard = styled.View`
  gap: 12px;
`
export const DashboardRow = styled.View`
  flex-direction: row;
  align-items: stretch;
  gap: 12px;
`
export const MetricCard = styled.View<{ $summary: boolean }>`
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 128px;
  padding: ${({ theme }) => theme.layout.cardPadding}px;
  border-radius: ${({ theme }) => theme.radius.lg}px;
  background-color: ${({ theme }) => theme.colors.surface.default};
  border-width: ${({ $summary }) => $summary ? 1 : 0}px;
  border-color: ${({ theme }) => `${theme.colors.border.default}A6`};
`
export const MetricBody = styled.View`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 2px;
  margin-top: 8px;
`
export const MetricReading = styled.View`
  min-width: 0;
  flex-shrink: 1;
`
export const RiskReading = styled.View`
  align-items: center;
  flex-shrink: 1;
`
export const RiskText = styled(AppText)`
  font-size: 20px;
  line-height: 28px;
  font-weight: ${({ theme }) => theme.typography.weight.semibold};
`
export const DialFrame = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  margin-top: 8px;
`
export const Reference = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 2px 8px;
  margin-top: 12px;
`
