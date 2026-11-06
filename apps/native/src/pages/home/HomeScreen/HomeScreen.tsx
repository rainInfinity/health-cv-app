/** 按真实认证状态展示主页健康摘要或空态。 */

import { useStore } from '@nanostores/react'
import { ArrowRight, ChevronRight, HealthIndicatorArtwork, XinmuLogo } from '@/shared/graphics'
import { Pressable, useWindowDimensions, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme } from 'styled-components/native'

import { useAuthState } from '@/app/auth/useAuthState'
import type { HealthMetric, RootStackParamList } from '@/app/navigation/types'
import { selectHealthPresentation } from '@/pages/home/healthPresentation'
import { homeMessages } from '@/pages/home/homeMessages'
import { ActionButton } from '@/shared/components/ActionButton'
import { AppCard } from '@/shared/components/AppCard'
import { AppText } from '@/shared/components/AppText'
import { PageContainer } from '@/shared/components/PageContainer'

import { BrandGroup, BrandTitle, Disclaimer, HomeHeader, IndicatorHeading } from './styles'

/** 将固定的 ISO 展示时刻格式化为明确的北京时间。 */
function formatMeasuredAt(value: string | null, emptyLabel: string): string {
  if (value == null) return emptyLabel
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return emptyLabel
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).format(timestamp)
}

/** 渲染品牌首页、四项健康指标和可达的只读详情入口。 */
export function HomeScreen() {
  const theme = useTheme()
  const { width: windowWidth } = useWindowDimensions()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const authState = useAuthState()
  const messages = useStore(homeMessages)
  const presentation = selectHealthPresentation(authState)
  const measuredAt = formatMeasuredAt(presentation.measuredAt, messages.noRecord)
  const isAuthenticated = authState.status === 'authenticated'
  const openMetric = (metric: HealthMetric) => {
    if (!isAuthenticated) {
      navigation.navigate('Login')
      return
    }
    navigation.navigate('MetricDetail', { metric })
  }
  const pageGutter = windowWidth <= theme.layout.narrowMaxWidth
    ? theme.layout.pageGutterNarrow
    : theme.layout.pageGutter
  const indicators = [
    { key: 'heartRate' as const, label: messages.heartRate, value: presentation.heartRate, unit: messages.heartRateUnit },
    { key: 'respirationRate' as const, label: messages.respirationRate, value: presentation.respirationRate, unit: messages.respirationRateUnit },
    { key: 'oxygenSaturation' as const, label: messages.oxygenSaturation, value: presentation.oxygenSaturation, unit: messages.oxygenSaturationUnit },
    { key: 'diabetesRisk' as const, label: messages.diabetesRisk, value: null, unit: '' },
  ]

  return (
    <PageContainer
      edges={['top', 'left', 'right']}
      backgroundVariant="home"
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
          <AppText variant="caption" tone="secondary">{measuredAt}</AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.xs }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.xxs }}>
              <AppText variant="display" style={{ lineHeight: 36 }}>{presentation.systolic ?? messages.emptyValue}</AppText>
              <AppText variant="caption" tone="secondary">{messages.bloodPressureUnit}</AppText>
            </View>
            <AppText variant="label" tone="secondary" style={{ lineHeight: 16 }}>{messages.systolic}</AppText>
          </View>
          <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: '#087D831A', paddingLeft: theme.spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.xxs }}>
              <AppText variant="display" style={{ lineHeight: 36 }}>{presentation.diastolic ?? messages.emptyValue}</AppText>
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
            onPress={() => openMetric('bloodPressure')}
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
                {indicator.key === 'heartRate' && indicator.value != null && (
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
                  <HealthIndicatorArtwork kind="oxygenSaturation" value={indicator.value} emptyLabel={messages.emptyValue} />
                ) : indicator.key === 'diabetesRisk' ? (
                  <>
                    <AppText variant="label" tone="secondary">
                      {isAuthenticated ? messages.noRiskResult : messages.emptyValue}
                    </AppText>
                    <HealthIndicatorArtwork kind="diabetesRisk" />
                  </>
                ) : (
                  <>
                    <View>
                      <AppText variant="display">{indicator.value ?? messages.emptyValue}</AppText>
                      {indicator.value != null && <AppText variant="caption" tone="secondary">{indicator.unit}</AppText>}
                    </View>
                    <HealthIndicatorArtwork kind={indicator.key} />
                  </>
                )}
              </View>
              <AppText variant="caption" tone="secondary" style={{ marginTop: theme.spacing.xxs, lineHeight: 16 }}>
                {indicator.key === 'diabetesRisk'
                  ? (isAuthenticated ? messages.riskLastRecord : messages.noRecord)
                  : measuredAt}
              </AppText>
            </AppCard>
          </Pressable>
        ))}
      </View>
    </PageContainer>
  )
}
