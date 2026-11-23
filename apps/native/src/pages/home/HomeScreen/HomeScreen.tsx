/** 按真实认证状态展示主页健康摘要或空态。 */

import { useEffect, useRef } from 'react'
import { useStore } from '@nanostores/react'
import { ArrowRight, ChevronRight, HealthIndicatorArtwork, XinmuLogo } from '@/shared/graphics'
import { Pressable, RefreshControl, useWindowDimensions, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme } from 'styled-components/native'

import { useAuthState } from '@/app/auth/useAuthState'
import type { HealthMetric, RootStackParamList } from '@/app/navigation/types'
import { METRIC_ENTRIES, resolveMeasurementEntry } from '@/app/measurement/entry'
import { measurementGuideSkipped } from '@/app/preferences'
import { useMeasurementAccess } from '@/app/measurement/useMeasurementAccess'
import { useLatestHealth } from '../useLatestHealth'
import { selectHealthPresentation } from '@/pages/home/healthPresentation'
import { homeMessages } from '@/pages/home/homeMessages'
import { ActionButton } from '@/shared/components/ActionButton'
import { AppCard } from '@/shared/components/AppCard'
import { AppText } from '@/shared/components/AppText'
import { PageContainer } from '@/shared/components/PageContainer'
import { beijingToday, formatBeijingDateTime, parseSubmittedAt } from '@/shared/dateTime'
import { formatHealthNumber, formatRiskLevel } from '@/shared/healthNumber'

import { BrandGroup, BrandTitle, Disclaimer, HomeHeader, IndicatorHeading } from './styles'
import { HomeDataSlot } from '../HomeDataSlot'
import { usePageToast } from '@/shared/components/FeedbackHost/usePageToast'

/** 按合同解释服务端的北京时间提交时刻。 */
function formatMeasuredAt(value: string | null, emptyLabel: string): string {
  if (value == null) return emptyLabel
  const timestamp = parseSubmittedAt(value)
  if (!Number.isFinite(timestamp)) return emptyLabel
  return formatBeijingDateTime(timestamp)
}

/** 渲染品牌首页、四项健康指标和可达的只读详情入口。 */
export function HomeScreen() {
  const theme = useTheme()
  const { width: windowWidth } = useWindowDimensions()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const authState = useAuthState()
  const messages = useStore(homeMessages)
  const latest = useLatestHealth()
  const feedback = usePageToast()
  const reportedError = useRef(0)
  useEffect(() => {
    if (!latest.errorUpdatedAt || latest.fetching || !feedback.visible || reportedError.current === latest.errorUpdatedAt) return
    reportedError.current = latest.errorUpdatedAt
    feedback.show({ tone: 'error', showLabel: false, message: latest.hasPrevious ? messages.refreshFailed : messages.loadFailed })
  }, [latest.errorUpdatedAt, latest.fetching, latest.hasPrevious, messages, feedback.visible, feedback.show])
  const checkAccess = useMeasurementAccess()
  const openingMeasurement = useRef(false)
  const presentation = selectHealthPresentation(authState, latest.data)
  const measuredAt = formatMeasuredAt(presentation.records.bloodPressure?.submittedAt ?? null, messages.noRecord)
  const isAuthenticated = authState.status === 'authenticated'
  const openMetric = (metric: Exclude<HealthMetric, 'faceHeartRate'>) => {
    if (!isAuthenticated) {
      navigation.navigate('Login')
      return
    }
    navigation.navigate('ProductTabs', { screen: 'History', params: { metric, day: beijingToday(), requestId: `${Date.now()}` } })
  }
  /** 已登录主操作进入真实血压流程，独立详情入口保持只读。 */
  async function measureBloodPressure() {
    if (openingMeasurement.current) return
    openingMeasurement.current = true
    try {
      if (!await checkAccess('chest')) return
      const entry = METRIC_ENTRIES.bloodPressure
      navigation.navigate(...resolveMeasurementEntry(entry, measurementGuideSkipped[entry.method].get()))
    } finally {
      openingMeasurement.current = false
    }
  }
  const pageGutter = windowWidth <= theme.layout.narrowMaxWidth
    ? theme.layout.pageGutterNarrow
    : theme.layout.pageGutter
  const indicators = [
    { key: 'heartRate' as const, label: messages.heartRate, value: presentation.heartRate, unit: messages.heartRateUnit },
    { key: 'respirationRate' as const, label: messages.respirationRate, value: presentation.respirationRate, unit: messages.respirationRateUnit },
    { key: 'oxygenSaturation' as const, label: messages.oxygenSaturation, value: presentation.oxygenSaturation, unit: messages.oxygenSaturationUnit },
    { key: 'diabetesRisk' as const, label: messages.diabetesRisk, value: presentation.diabetesRisk, unit: '' },
  ]

  return (
    <PageContainer
      edges={['top', 'left', 'right']}
      backgroundVariant="home"
      refreshControl={isAuthenticated ? <RefreshControl refreshing={latest.mode === 'refreshing' && latest.fetching} onRefresh={latest.refresh} colors={[theme.colors.brand.action]} tintColor={theme.colors.brand.action} /> : undefined}
      contentContainerStyle={{
        gap: 0,
        paddingTop: theme.spacing.md,
        paddingHorizontal: pageGutter,
        paddingBottom: theme.layout.homeBottom,
      }}
    >
      <HomeHeader style={{ marginBottom: theme.spacing.md }}>
        <BrandGroup>
          <XinmuLogo size={40} />
          <BrandTitle>{messages.title}</BrandTitle>
        </BrandGroup>
        <Disclaimer>
          <AppText variant="caption" tone="secondary">{messages.disclaimer}</AppText>
        </Disclaimer>
      </HomeHeader>

      <AppCard
        variant="health"
        style={{ marginBottom: theme.spacing.sm }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
          <AppText variant="section">{messages.bloodPressureStatus}</AppText>
          <Pressable
            onPress={() => openMetric('bloodPressure')}
            accessibilityRole="button"
            accessibilityLabel={messages.details}
            hitSlop={8}
            style={{ minHeight: theme.icon.touchTarget, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xxs }}
          >
            <AppText variant="label" tone="secondary">{messages.details}</AppText>
            <ChevronRight size={16} color={theme.colors.brand.action} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
          <AppText variant="caption" tone="secondary">{messages.latestMeasurement}</AppText>
          <HomeDataSlot mode={latest.mode} time><AppText variant="caption" tone="secondary">{measuredAt}</AppText></HomeDataSlot>
        </View>
        <View style={{ flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.xs }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.xxs }}>
              <HomeDataSlot mode={latest.mode}><AppText variant="display" style={{ lineHeight: 36 }}>{presentation.systolic == null ? messages.emptyValue : formatHealthNumber(presentation.systolic)}</AppText></HomeDataSlot>
              <AppText variant="caption" tone="secondary">{messages.bloodPressureUnit}</AppText>
            </View>
            <AppText variant="label" tone="secondary" style={{ lineHeight: 16 }}>{messages.systolic}</AppText>
          </View>
          <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: '#087D831A', paddingLeft: theme.spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.xxs }}>
              <HomeDataSlot mode={latest.mode}><AppText variant="display" style={{ lineHeight: 36 }}>{presentation.diastolic == null ? messages.emptyValue : formatHealthNumber(presentation.diastolic)}</AppText></HomeDataSlot>
              <AppText variant="caption" tone="secondary">{messages.bloodPressureUnit}</AppText>
            </View>
            <AppText variant="label" tone="secondary" style={{ lineHeight: 16 }}>{messages.diastolic}</AppText>
          </View>
        </View>
        <View style={{ marginTop: theme.spacing.sm }}>
          <ActionButton
            label={isAuthenticated ? messages.measure : messages.loginToUse}
            icon={<ArrowRight size={theme.icon.compact} color={theme.colors.surface.default} />}
            iconPosition="trailing"
            onPress={measureBloodPressure}
          />
        </View>
      </AppCard>

      <IndicatorHeading>
        <AppText variant="section">{messages.moreIndicators}</AppText>
      </IndicatorHeading>
      <View style={{ flex: 1, alignContent: 'stretch', flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {indicators.map((indicator) => (
          <Pressable
            key={indicator.key}
            onPress={() => openMetric(indicator.key)}
            accessibilityRole="button"
            accessibilityLabel={indicator.label}
            style={{ flexGrow: 1, flexBasis: '46%', minWidth: 145 }}
          >
            <AppCard
              contentGap={0}
              contentPadding={theme.layout.cardPadding}
              style={{ flex: 1, minHeight: 148 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.xs }}>
                <AppText variant="label" style={{ flex: indicator.key === 'heartRate' ? 0 : 1, minWidth: 0 }}>
                  {indicator.label}
                </AppText>
                {indicator.key === 'heartRate' && indicator.value != null && presentation.records.heartRate?.captureMode === 'active' && (
                  <AppText
                    variant="caption"
                    style={{
                      paddingHorizontal: theme.spacing.xxs,
                      paddingVertical: 1,
                      borderRadius: theme.radius.sm,
                      backgroundColor: theme.colors.brand.subtle,
                      color: theme.colors.brand.action,
                      lineHeight: 16,
                    }}
                  >
                    {messages.activeSource}
                  </AppText>
                )}
                <ChevronRight size={16} color={theme.colors.text.secondary} style={{ marginLeft: 'auto' }} />
              </View>
              <View style={{ flex: 1, minHeight: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.xxs }}>
                {indicator.key === 'oxygenSaturation' ? (
                  <View style={{ position: 'relative' }}>
                    <HealthIndicatorArtwork kind="oxygenSaturation" value={latest.mode === 'loading' ? null : indicator.value} hideValue={latest.mode !== 'ready'} emptyLabel={messages.emptyValue} />
                    {latest.mode !== 'ready' && <View style={{ position: 'absolute', left: 35, top: 24, width: 54, height: 36 }}><HomeDataSlot mode={latest.mode}><AppText variant="display" style={{ lineHeight: 36 }}>{messages.emptyValue}</AppText></HomeDataSlot></View>}
                  </View>
                ) : indicator.key === 'diabetesRisk' ? (
                  <>
                    {/* 风险文字放大后，加载圈仍保留原18字号对应的直径。 */}
                    <HomeDataSlot mode={latest.mode} loadingScale={18 / 20}><AppText variant="section" style={{ fontSize: 20, lineHeight: 26, textAlign: 'center' }}>
                      {indicator.value == null ? messages.emptyValue : formatRiskLevel(indicator.value)}
                    </AppText></HomeDataSlot>
                    <HealthIndicatorArtwork kind="diabetesRisk" />
                  </>
                ) : (
                  <>
                    <View>
                      <HomeDataSlot mode={latest.mode}><AppText variant="display">{indicator.value == null ? messages.emptyValue : formatHealthNumber(indicator.value)}</AppText></HomeDataSlot>
                      <AppText variant="caption" tone="secondary">{indicator.unit}</AppText>
                    </View>
                    <HealthIndicatorArtwork kind={indicator.key} />
                  </>
                )}
              </View>
              <HomeDataSlot mode={latest.mode} time>
              <AppText variant="caption" tone="secondary" style={{ marginTop: theme.spacing.xxs, lineHeight: 16 }}>
                {formatMeasuredAt(presentation.records[indicator.key]?.submittedAt ?? null, messages.noRecord)}
              </AppText>
              </HomeDataSlot>
            </AppCard>
          </Pressable>
        ))}
      </View>
    </PageContainer>
  )
}
