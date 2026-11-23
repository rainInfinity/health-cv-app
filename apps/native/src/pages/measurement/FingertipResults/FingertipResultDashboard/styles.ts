/** 四项看板统一白底细边框，保持原有图文和质量角标排布。 */

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
export const MetricCard = styled.View`
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 128px;
  padding: ${({ theme }) => theme.layout.cardPadding}px;
  border-radius: ${({ theme }) => theme.radius.lg}px;
  background-color: ${({ theme }) => theme.colors.surface.default};
  border-width: 1px;
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
export const RiskReading = styled(AppText)`
  font-size: 20px;
  line-height: 26px;
  font-weight: ${({ theme }) => theme.typography.weight.semibold};
  text-align: center;
`
export const DialFrame = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
`
export const Reference = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 2px 8px;
  margin-top: 12px;
`
