/** 血压详情使用独立原生安全区，卡片保持白底、细边框及无阴影。 */
import { SafeAreaView } from 'react-native-safe-area-context'
import styled from 'styled-components/native'
import Svg from 'react-native-svg'
import { AppText } from '@/shared/components/AppText'

export const Screen = styled(SafeAreaView)`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.brand.subtle};
`
export const Header = styled.View`
  min-height: 48px;
  flex-direction: row;
  align-items: center;
  padding: 0 16px;
`
export const HeaderButton = styled.Pressable`
  width: ${({ theme }) => theme.icon.touchTarget}px;
  min-height: ${({ theme }) => theme.icon.touchTarget}px;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.radius.pill}px;
`
export const HeaderTitle = styled(AppText)`
  flex: 1;
  text-align: center;
  font-size: 18px;
  line-height: 26px;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
`
export const LogoSlot = styled.View`
  width: 48px;
  min-height: 48px;
  align-items: center;
  justify-content: center;
`
export const ReportBackground = styled(Svg)`
  position: absolute;
  top: 0;
  left: 0;
`
export const OverviewHeading = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  margin-bottom: 12px;
`
export const Disclaimer = styled(AppText)`
  margin-top: 8px;
  margin-bottom: 16px;
  line-height: 20px;
`
export const QualityNote = styled(AppText)`
  margin-top: 12px;
`
export const Interpretations = styled.View`
  gap: 12px;
  margin-top: 28px;
`
export const InterpretationHeading = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
`
export const InterpretationCard = styled.View`
  padding: 16px;
  gap: 12px;
  border: 1px solid ${({ theme }) => `${theme.colors.border.default}A6`};
  border-radius: ${({ theme }) => theme.radius.lg}px;
  background-color: ${({ theme }) => theme.colors.surface.default};
`
export const InterpretationText = styled(AppText)`
  font-size: 14px;
  line-height: 24px;
  font-weight: ${({ theme }) => theme.typography.weight.regular};
  color: ${({ theme }) => theme.colors.text.secondary};
`
export const InterpretationReading = styled.View`
  flex-direction: row;
  align-items: baseline;
  gap: 4px;
`
