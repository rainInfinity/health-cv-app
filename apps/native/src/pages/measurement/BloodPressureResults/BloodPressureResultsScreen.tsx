/** 血压报告按任务编号鉴权读取，历史报告不依赖原生轮次或交接资格。 */
import { useId } from 'react'
import { useStore } from '@nanostores/react'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useWindowDimensions, View } from 'react-native'
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { useTheme } from 'styled-components/native'
import type { RootStackParamList } from '@/app/navigation/types'
import { PageContainer } from '@/shared/components/PageContainer'
import { AppText } from '@/shared/components/AppText'
import { formatHealthNumber } from '@/shared/healthNumber'
import { XinmuLogo } from '@/shared/graphics'
import { ReportWaveform } from '@/pages/measurement/ReportWaveform'
import { useMeasurementReport } from '@/pages/measurement/FingertipResults/useMeasurementReport'
import { BloodPressureResultCard } from './BloodPressureResultCard'
import { bloodPressureResultsMessages } from './bloodPressureResultsMessages'
import { classifyBloodPressure } from './bloodPressureAssessment'
import { Disclaimer, Header, HeaderButton, HeaderTitle, InterpretationCard, InterpretationHeading, InterpretationReading, Interpretations, InterpretationText, LogoSlot, OverviewHeading, QualityNote, ReportBackground, Screen } from './styles'
import { MeasurementFailure } from '@/pages/measurement/MeasurementFailure'
import { LoadingIndicator } from '@/shared/components/LoadingIndicator'

/** 返回原轮简要结果，不重新准备采集；波形实例随详情卸载释放。 */
export function BloodPressureResultsScreen() {
  const messages = useStore(bloodPressureResultsMessages)
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'BloodPressureResults'>>()
  const route = useRoute<RouteProp<RootStackParamList, 'BloodPressureResults'>>()
  const { task, report, error, refresh } = useMeasurementReport(route.params.taskId)
  const failed = report?.state === 'all_failed' || report?.state === 'task_failed'
  const ready = !error && report?.hasValidMembers === true
  const pressure = report?.metrics.bloodPressure
  const systolic = pressure?.status === 'succeeded' ? pressure.readings.find((item) => item.code === 'sbp')?.value : undefined
  const diastolic = pressure?.status === 'succeeded' ? pressure.readings.find((item) => item.code === 'dbp')?.value : undefined
  const level = systolic !== undefined && diastolic !== undefined ? classifyBloodPressure(systolic, diastolic) : null
  const theme = useTheme()
  const { width, height } = useWindowDimensions()
  const gradientId = `pressure-report-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`


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
          : failed ? <MeasurementFailure kind="detection" messages={messages} onRetry={() => route.params.captureId ? navigation.goBack() : navigation.navigate('MeasurementGuide', { method: 'chest', target: 'bloodPressure' })} />
            : <View style={{ alignItems: 'center' }}><LoadingIndicator size={36} /></View>}
      </View> :
      <PageContainer edges={['bottom']} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: 24, gap: 0 }}>
        <ReportBackground width={width} height={height} pointerEvents="none" accessible={false}>
          <Defs>
            <LinearGradient id={gradientId} x1="0%" y1="0%" x2="34%" y2="100%">
              <Stop offset="0" stopColor={theme.colors.brand.subtle} />
              <Stop offset="0.55" stopColor={theme.colors.surface.canvas} />
              <Stop offset="1" stopColor={theme.colors.surface.canvas} />
            </LinearGradient>
          </Defs>
          <Rect width={width} height={height} fill={`url(#${gradientId})`} />
        </ReportBackground>
        <OverviewHeading><AppText variant="section" accessibilityRole="header">{messages.overview}</AppText><AppText variant="caption" tone="muted">{report?.measurementTime ?? '--'}</AppText></OverviewHeading>
        <Disclaimer variant="caption" tone="muted">{messages.disclaimer}</Disclaimer>
        <BloodPressureResultCard report={report} />
        <QualityNote variant="caption" tone="muted">{messages.qualityNote}</QualityNote>
        {task && pressure?.status === 'succeeded' && <>
          <ReportWaveform task={task} kind="ppg" title={messages.ppgWave} labels={messages} />
          <ReportWaveform task={task} kind="scg" title={messages.scgWave} labels={messages} />
        </>}
        <Interpretations>
          <InterpretationHeading><AppText variant="section" accessibilityRole="header">{messages.interpretations}</AppText><AppText variant="caption" tone="muted">{messages.restingReference}</AppText></InterpretationHeading>
          <InterpretationCard>
            <AppText variant="body" style={{ fontWeight: '600' }} accessibilityRole="header">{level ? messages[`${level}Assessment`] : '--'}</AppText>
            <InterpretationText>{messages.estimateText({ value: `${systolic === undefined ? '--' : formatHealthNumber(systolic)}/${diastolic === undefined ? '--' : formatHealthNumber(diastolic)}` })}{messages.overallText}</InterpretationText>
          </InterpretationCard>
          {[
            { title: messages.systolic, code: 'sbp', value: systolic, text: messages.systolicText },
            { title: messages.diastolic, code: 'dbp', value: diastolic, text: messages.diastolicText },
          ].map((reading) => (
            <InterpretationCard key={reading.code}>
              <InterpretationHeading>
                <AppText variant="body" style={{ fontWeight: '600' }} accessibilityRole="header">{reading.title}</AppText>
                <InterpretationReading><AppText style={{ fontSize: 24, lineHeight: 32, fontWeight: '600' }}>{reading.value === undefined ? '--' : formatHealthNumber(reading.value)}</AppText><AppText variant="caption" tone="muted">mmHg</AppText></InterpretationReading>
              </InterpretationHeading>
              <InterpretationText>{reading.text}</InterpretationText>
            </InterpretationCard>
          ))}
          <InterpretationCard>
            <AppText variant="body" style={{ fontWeight: '600' }} accessibilityRole="header">{messages.dailyAdvice}</AppText>
            <InterpretationText>{messages.dailyAdviceText}</InterpretationText>
            <InterpretationText>{messages.confirmationAdvice}</InterpretationText>
          </InterpretationCard>
        </Interpretations>
      </PageContainer>}
    </Screen>
  )
}
