/** 独立结果页使用原生安全区和返回栏，无摄像头、倒计时或产品底栏。 */

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
