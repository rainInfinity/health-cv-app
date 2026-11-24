/** 指尖报告按关联任务鉴权读取，不依赖仍存活的原生采集轮次。 */
import { useId } from 'react'
import { useStore } from '@nanostores/react'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { RootStackParamList } from '@/app/navigation/types'
import { useWindowDimensions, View } from 'react-native'
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { useTheme } from 'styled-components/native'
import { PageContainer } from '@/shared/components/PageContainer'
import { AppText } from '@/shared/components/AppText'
import { XinmuLogo } from '@/shared/graphics'
import { fingertipResultsMessages } from './fingertipResultsMessages'
import { FingertipResultDashboard } from './FingertipResultDashboard'
import { FingertipResultInterpretations } from './FingertipResultInterpretations'
import { ReportWaveform } from '@/pages/measurement/ReportWaveform'
import { useMeasurementReport } from './useMeasurementReport'
import { Disclaimer, Header, HeaderButton, HeaderTitle, LogoSlot, OverviewHeading, QualityNote, ReportBackground, Screen } from './styles'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { MeasurementFailure } from '@/pages/measurement/MeasurementFailure'
import { LoadingIndicator } from '@/shared/components/LoadingIndicator'

/** 使用现有根栈返回，不建立独立导航容器，也不重新准备采集轮次。 */
export function FingertipResultsScreen() {
  const messages = useStore(fingertipResultsMessages)
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'FingertipResults'>>()
  const route = useRoute<RouteProp<RootStackParamList, 'FingertipResults'>>()
  const { task, report, error, refresh } = useMeasurementReport(route.params.taskId)
  const failed = report?.state === 'all_failed' || report?.state === 'task_failed'
  const ready = !error && report?.hasValidMembers === true
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
      {!ready ? <View style={{ flex: 1, justifyContent: 'center' }}>
        {error ? <MeasurementFailure kind="query" messages={messages} onRetry={refresh} />
          : failed ? <MeasurementFailure kind="detection" messages={messages} onRetry={() => route.params.captureId ? navigation.goBack() : navigation.navigate('MeasurementGuide', { method: 'fingertip' })} />
            : <View style={{ alignItems: 'center' }}><LoadingIndicator size={36} /></View>}
      </View> :
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
        <OverviewHeading><AppText variant="section" accessibilityRole="header">{messages.overview}</AppText><AppText variant="caption" tone="muted">{report?.measurementTime ?? '--'}</AppText></OverviewHeading>
        <Disclaimer variant="caption" tone="muted">{messages.disclaimer}</Disclaimer>
        <FingertipResultDashboard report={report} />
        <QualityNote variant="caption" tone="muted">{messages.qualityNote}</QualityNote>
        {task && report?.hasValidMembers && <ReportWaveform task={task} kind="ppg" title={messages.pulseWave} labels={messages} />}
        <FingertipResultInterpretations report={report} />
      </PageContainer>}
    </Screen>
  )
}
