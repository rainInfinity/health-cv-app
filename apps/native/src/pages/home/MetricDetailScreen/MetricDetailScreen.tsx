/** 根据真实认证状态展示只读指标值、时间和功能说明。 */

import { useStore } from '@nanostores/react'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import { X } from '@/shared/graphics'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from 'styled-components/native'

import { useAuthState } from '@/app/auth/useAuthState'
import type { HealthMetric, RootStackParamList } from '@/app/navigation/types'
import { getMeasurementRecency, selectHealthPresentation } from '@/pages/home/healthPresentation'
import { homeMessages } from '@/pages/home/homeMessages'
import { featuresMessages } from '@/pages/features/featuresMessages'
import { metricDetailMessages } from '@/pages/home/metricDetailMessages'
import { feedbackMessages } from '@/app/i18n/feedbackMessages'
import { AppCard } from '@/shared/components/AppCard'
import { AppText } from '@/shared/components/AppText'

import { DetailClose, DetailHeader, DetailSection, MetricSummary, MetricValueRow } from './styles'

/** 详情页中按当前认证数据映射的只读值。 */
interface MetricValue {
  /** 页面展示的数值；无记录时为空。 */
  value: string | null
  /** 数值的原始单位。 */
  unit: string
  /** 测量或评估说明。 */
  instructions: string
}

/** 指标详情中日期和空值文案的类型。 */
type MetricDetailMessages = ReturnType<typeof metricDetailMessages.get>
/** 首页文案的类型。 */
type HomeMessages = ReturnType<typeof homeMessages.get>
/** 功能说明文案的类型。 */
type FeaturesMessages = ReturnType<typeof featuresMessages.get>

/** 将首页认证数据映射到用户请求的只读指标。 */
function selectMetricValue(
  metric: HealthMetric,
  presentation: ReturnType<typeof selectHealthPresentation>,
  home: HomeMessages,
  features: FeaturesMessages,
): MetricValue {
  switch (metric) {
    case 'bloodPressure':
      return {
        value: presentation.systolic == null || presentation.diastolic == null
          ? null
          : `${presentation.systolic}/${presentation.diastolic}`,
        unit: home.bloodPressureUnit,
        instructions: features.pressureInstructions,
      }
    case 'heartRate':
      return { value: presentation.heartRate == null ? null : String(presentation.heartRate), unit: home.heartRateUnit, instructions: features.fingertipInstructions }
    case 'respirationRate':
      return { value: presentation.respirationRate == null ? null : String(presentation.respirationRate), unit: home.respirationRateUnit, instructions: features.fingertipInstructions }
    case 'oxygenSaturation':
      return { value: presentation.oxygenSaturation == null ? null : String(presentation.oxygenSaturation), unit: home.oxygenSaturationUnit, instructions: features.oxygenInstructions }
    case 'faceHeartRate':
      return { value: null, unit: home.heartRateUnit, instructions: features.faceInstructions }
    case 'diabetesRisk':
      return { value: null, unit: '', instructions: features.riskInstructions }
  }
}

/** 按既有 recency 分类生成中文的最近测量说明。 */
function formatRecency(
  measuredAt: string | null,
  messages: MetricDetailMessages,
  nowMillis: number,
): string {
  const recency = getMeasurementRecency(measuredAt, nowMillis)
  if (recency.kind === 'none') return messages.noRecord
  if (recency.kind === 'unknown' || recency.kind === 'future') return messages.timeNeedsReview
  if (recency.kind === 'recent') return messages.justNow
  if (recency.unit === 'minute') return messages.minutesAgo({ value: recency.value })
  if (recency.unit === 'hour') return messages.hoursAgo({ value: recency.value })
  return messages.daysAgo({ value: recency.value })
}

/** 提供健康指标详情，不发起测量、不查询记录或修改服务端数据。 */
export function MetricDetailScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'MetricDetail'>>()
  const route = useRoute<RouteProp<RootStackParamList, 'MetricDetail'>>()
  const authState = useAuthState()
  const presentation = selectHealthPresentation(authState)
  const home = useStore(homeMessages)
  const features = useStore(featuresMessages)
  const messages = useStore(metricDetailMessages)
  const sharedCopy = useStore(feedbackMessages)
  const { metric } = route.params
  const metricValue = selectMetricValue(metric, presentation, home, features)
  const title = {
    bloodPressure: home.bloodPressureStatus,
    heartRate: home.heartRate,
    respirationRate: home.respirationRate,
    oxygenSaturation: home.oxygenSaturation,
    faceHeartRate: features.faceTitle,
    diabetesRisk: home.diabetesRisk,
  }[metric]
  const recency = metricValue.value == null
    ? messages.noRecord
    : formatRecency(presentation.measuredAt, messages, Date.now())

  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(38,38,38,0.36)' }}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel={sharedCopy.dismiss}
      />
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingHorizontal: theme.spacing.md,
          paddingTop: insets.top + theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.lg,
        }}
      >
        <AppCard
          contentPadding={theme.spacing.xl}
          style={[
            theme.surfaceElevation.overlay,
            {
              width: '100%',
              maxWidth: 460,
              alignSelf: 'center',
              backgroundColor: theme.colors.surface.default,
              borderWidth: 1,
              borderColor: theme.colors.border.default,
            },
          ]}
        >
          <DetailHeader>
            <AppText accessibilityRole="header" variant="title">{title}</AppText>
            <DetailClose
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel={sharedCopy.dismiss}
            >
              <X size={theme.icon.default} color={theme.colors.text.primary} />
            </DetailClose>
          </DetailHeader>
          <MetricSummary>
            <AppText variant="caption" tone="secondary">{messages.currentValue}</AppText>
            <MetricValueRow>
              <AppText variant="display">{metricValue.value ?? home.emptyValue}</AppText>
              {metricValue.value != null && metricValue.unit !== '' && (
                <AppText tone="secondary">{metricValue.unit}</AppText>
              )}
            </MetricValueRow>
            <AppText variant="caption" tone="secondary">{messages.latestMeasurement}：{recency}</AppText>
          </MetricSummary>
          <DetailSection>
            <AppText variant="section">{messages.aboutMetric}</AppText>
            <AppText tone="secondary">{metricValue.instructions}</AppText>
          </DetailSection>
          <AppText variant="caption" tone="secondary">{messages.disclaimer}</AppText>
        </AppCard>
      </ScrollView>
    </View>
  )
}
