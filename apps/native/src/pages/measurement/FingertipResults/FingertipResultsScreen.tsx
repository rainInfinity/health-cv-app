/** 本轮指尖结果详情只消费固定展示样例，入口资格由检测页掌握。 */

import { useId } from 'react'
import { useStore } from '@nanostores/react'
import { useNavigation } from '@react-navigation/native'
import { useWindowDimensions } from 'react-native'
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { useTheme } from 'styled-components/native'
import { PageContainer } from '@/shared/components/PageContainer'
import { AppText } from '@/shared/components/AppText'
import { XinmuLogo } from '@/shared/graphics'
import { fingertipResultsMessages } from './fingertipResultsMessages'
import { FingertipResultDashboard } from './FingertipResultDashboard'
import { FingertipResultInterpretations } from './FingertipResultInterpretations'
import { ProcessedPulseWave } from './ProcessedPulseWave'
import { Disclaimer, Header, HeaderButton, HeaderTitle, LogoSlot, OverviewHeading, QualityNote, ReportBackground, Screen } from './styles'

/** 使用现有根栈返回，不建立独立导航容器，也不重新准备采集轮次。 */
export function FingertipResultsScreen() {
  const messages = useStore(fingertipResultsMessages)
  const navigation = useNavigation()
  const theme = useTheme()
  const { width, height } = useWindowDimensions()
  const gradientId = `result-background-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Header>
        <HeaderButton onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel={messages.back} style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={theme.colors.brand.action} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" accessible={false}><Path d="m15 18-6-6 6-6" /></Svg>
        </HeaderButton>
        <HeaderTitle accessibilityRole="header">{messages.title}</HeaderTitle>
        <LogoSlot accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><XinmuLogo size={28} /></LogoSlot>
      </Header>
      <PageContainer edges={['bottom']} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: 24, gap: 0 }}>
        <ReportBackground width={width} height={height} pointerEvents="none" accessible={false}>
          <Defs>
            <LinearGradient id={gradientId} x1="0%" y1="0%" x2="34%" y2="100%">
              <Stop offset="0" stopColor={theme.colors.brand.subtle} stopOpacity={1} />
              <Stop offset="0.55" stopColor={theme.colors.surface.canvas} stopOpacity={1} />
              <Stop offset="1" stopColor={theme.colors.surface.canvas} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect width={width} height={height} fill={`url(#${gradientId})`} />
        </ReportBackground>
        <OverviewHeading><AppText variant="section" accessibilityRole="header">{messages.overview}</AppText><AppText variant="caption" tone="muted">{messages.measurementTime}</AppText></OverviewHeading>
        <Disclaimer variant="caption" tone="muted">{messages.disclaimer}</Disclaimer>
        <FingertipResultDashboard variant="details" />
        <QualityNote variant="caption" tone="muted">{messages.qualityNote}</QualityNote>
        <ProcessedPulseWave />
        <FingertipResultInterpretations />
      </PageContainer>
    </Screen>
  )
}
