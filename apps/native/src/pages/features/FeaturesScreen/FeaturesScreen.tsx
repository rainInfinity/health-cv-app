/** 展示双分类健康功能，保留已有健康摘要与测量间隔。 */

import { useStore } from '@nanostores/react'
import { ChevronRight, FeatureIllustration } from '@/shared/graphics'
import { AccessibilityInfo, Animated, Easing, Pressable, View, useWindowDimensions } from 'react-native'
import { useEffect, useId, useRef, useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { useTheme } from 'styled-components/native'

import { useAuthState } from '@/app/auth/useAuthState'
import { getMeasurementRecency, selectHealthPresentation } from '@/pages/home/healthPresentation'
import { featuresMessages } from '@/pages/features/featuresMessages'
import type { MeasurementRouteParams, RootStackParamList } from '@/app/navigation/types'
import { FEATURE_ENTRIES as FEATURE_ROUTES, METHOD_ENTRIES, resolveMeasurementEntry } from '@/app/measurement/entry'
import { measurementGuideSkipped } from '@/app/preferences'
import { CapturePhoto } from '@/pages/features/CapturePhoto'
import { AppCard } from '@/shared/components/AppCard'
import { AppText } from '@/shared/components/AppText'
import { PageContainer } from '@/shared/components/PageContainer'

import { FeatureIntro, FeatureList } from './styles'

/** 描述格式化测量间隔所需的中文文案。 */
interface FeaturesRecencyMessages {
  /** 无测量记录。 */
  noMeasurement: string
  /** 记录时间未知或晚于当前时间。 */
  timeNeedsReview: string
  /** 一分钟内的最近测量。 */
  justNow: string
  /** 距上次测量的分钟数。 */
  minutesUnmeasured: (parameters: { value: number }) => string
  /** 距上次测量的小时数。 */
  hoursUnmeasured: (parameters: { value: number }) => string
  /** 距上次测量的天数。 */
  daysUnmeasured: (parameters: { value: number }) => string
}

/** 保留五项指标的排序与现有插画，不按目标另建检测实现。 */
const FEATURE_ENTRIES = [
  { kind: 'fingertip', titleKey: 'fingertipTitle', descriptionKey: 'fingertipDescription' },
  { kind: 'face', titleKey: 'faceTitle', descriptionKey: 'faceDescription' },
  { kind: 'pressure', titleKey: 'pressureTitle', descriptionKey: 'pressureDescription' },
  { kind: 'oxygen', titleKey: 'oxygenTitle', descriptionKey: 'oxygenDescription' },
  { kind: 'risk', titleKey: 'riskTitle', descriptionKey: 'riskDescription' },
] as const

/** 将认证展示时间映射为 Demo 使用的无前缀测量间隔。 */
function formatRecency(
  measuredAt: string | null,
  messages: FeaturesRecencyMessages,
  nowMillis: number,
): string {
  const recency = getMeasurementRecency(measuredAt, nowMillis)
  if (recency.kind === 'none') return messages.noMeasurement
  if (recency.kind === 'unknown' || recency.kind === 'future') return messages.timeNeedsReview
  if (recency.kind === 'recent') return messages.justNow
  if (recency.unit === 'minute') return messages.minutesUnmeasured({ value: recency.value })
  if (recency.unit === 'hour') return messages.hoursUnmeasured({ value: recency.value })
  return messages.daysUnmeasured({ value: recency.value })
}

/** 分类状态仅保留于仍挂载的功能页；冷启动默认按部位。 */
export function FeaturesScreen() {
  const theme = useTheme()
  const authState = useAuthState()
  const presentation = selectHealthPresentation(authState)
  const messages = useStore(featuresMessages)
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const [category, setCategory] = useState<'method' | 'metric'>('method')
  const [tabWidth, setTabWidth] = useState(0)
  const [reduceMotion, setReduceMotion] = useState(false)
  const tabPosition = useRef(new Animated.Value(0)).current
  const id = useId().replace(/:/g, '')
  const { width, height } = useWindowDimensions()
  const compact = height < 740
  const nowMillis = Date.now()

  useEffect(() => {
    let active = true
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (active) setReduceMotion(enabled) })
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    return () => { active = false; subscription.remove() }
  }, [])

  useEffect(() => {
    const animation = Animated.timing(tabPosition, {
      toValue: category === 'method' ? 0 : tabWidth + 4,
      duration: reduceMotion ? 0 : 240,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: true,
    })
    animation.start()
    return () => animation.stop()
  }, [category, reduceMotion, tabPosition, tabWidth])

  /** 在入口直接应用设备偏好，不挂载隐藏引导页或补弹声音提醒。 */
  const enterMeasurement = (entry: MeasurementRouteParams) => {
    const destination = resolveMeasurementEntry(entry, measurementGuideSkipped[entry.method].get())
    navigation.navigate(...destination)
  }

  return (
    <PageContainer
      edges={['top', 'left', 'right']}
      backgroundVariant="functions"
      contentContainerStyle={{ paddingHorizontal: width < 360 ? theme.layout.pageGutterNarrow : theme.layout.pageGutter }}
    >
      <FeatureIntro>
        <AppText variant="title" style={{ flexShrink: 0 }}>{messages.title}</AppText>
        <AppText variant="caption" tone="secondary" style={{ flex: 1, textAlign: 'right' }}>
          {messages.disclaimer}
        </AppText>
      </FeatureIntro>
      <View
        onLayout={(event) => setTabWidth((event.nativeEvent.layout.width - 12) / 2)}
        accessibilityRole="tablist"
        accessibilityLabel={messages.category}
        style={{ position: 'relative', flexDirection: 'row', gap: 4, padding: 4, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surface.subtle, boxShadow: 'inset 2px 3px 6px rgba(38,38,38,0.14), inset -2px -2px 5px rgba(255,255,255,0.9)' }}
      >
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 4, bottom: 4, left: 4, width: tabWidth, borderRadius: theme.radius.pill, overflow: 'hidden', transform: [{ translateX: tabPosition }], ...theme.surfaceElevation.raised }}>
          <Svg width="100%" height="100%">
            <Defs><LinearGradient id={`${id}-tab`} x1="0%" y1="0%" x2="100%" y2="27%"><Stop stopColor={theme.colors.brand.gradient.start} /><Stop offset="1" stopColor={theme.colors.brand.gradient.end} /></LinearGradient></Defs>
            <Rect width="100%" height="100%" fill={`url(#${id}-tab)`} />
          </Svg>
        </Animated.View>
        {(['method', 'metric'] as const).map((value) => (
          <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: category === value }} onPress={() => setCategory(value)} style={({ pressed }) => ({ flex: 1, minHeight: 48, padding: 8, justifyContent: 'center', borderRadius: theme.radius.pill, opacity: pressed ? 0.65 : 1 })}>
            <AppText variant="label" style={{ textAlign: 'center', color: category === value ? theme.colors.surface.default : theme.colors.text.secondary, fontWeight: category === value ? '500' : '400' }}>{value === 'method' ? messages.byMethod : messages.byMetric}</AppText>
          </Pressable>
        ))}
      </View>
      <FeatureList style={{ gap: category === 'metric' ? theme.spacing.sm : compact ? 10 : 14 }}>
        {category === 'method' ? (['face', 'fingertip', 'chest'] as const).map((method) => (
          <Pressable key={method} accessibilityRole="button" accessibilityLabel={messages[`${method}MethodTitle`]} accessibilityHint={messages[`${method}MethodInstruction`]} onPress={() => enterMeasurement(METHOD_ENTRIES[method])} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
            {/* 阴影与裁剪、乘色分层，避免 Android 将隔离层的矩形边界带入阴影。 */}
            <View style={{ ...theme.surfaceElevation.raised, borderRadius: theme.radius.lg }}>
              <AppCard variant="function" contentPadding={compact ? 12 : width < 360 ? 14 : { horizontal: 20, vertical: 18 }} contentGap={0} style={{ minHeight: compact ? 112 : width < 360 ? 136 : 148, justifyContent: 'center', isolation: 'isolate', overflow: 'hidden', boxShadow: 'none', elevation: 0, shadowOpacity: 0 }}>
                <CapturePhoto method={method} />
                <View style={{ width: '56%', zIndex: 1 }}>
                  <AppText style={{ fontSize: compact || width < 360 ? 16 : 18, lineHeight: compact ? 22 : 26, fontWeight: '500', marginBottom: compact ? 4 : 8 }}>{messages[`${method}MethodTitle`]}</AppText>
                  <AppText variant="label" style={{ color: theme.colors.brand.action, fontWeight: '400', fontSize: compact ? 13 : 14, lineHeight: compact ? 20 : 22 }}>{messages[`${method}MethodMetrics`]}</AppText>
                  <AppText variant="caption" tone="secondary" style={{ marginTop: compact ? 6 : 10 }}>{messages[`${method}MethodInstruction`]}</AppText>
                </View>
              </AppCard>
            </View>
          </Pressable>
        )) : FEATURE_ENTRIES.map((feature) => {
          const title = messages[feature.titleKey]
          const description = messages[feature.descriptionKey]
          const recency = feature.kind === 'risk'
            ? messages.notAssessed
            : feature.kind === 'face'
              ? messages.noMeasurement
              : formatRecency(presentation.measuredAt, messages, nowMillis)
          return (
            <Pressable
              key={feature.kind}
              onPress={() => enterMeasurement(FEATURE_ROUTES[feature.kind])}
              accessibilityRole="button"
              accessibilityLabel={title}
              accessibilityHint={`${description} ${recency}`}
              style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
            >
              <AppCard
                variant="function"
                style={{
                  minHeight: 112,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <FeatureIllustration kind={feature.kind} width={96} height={84} />
                <View style={{ flex: 1 }}>
                  <AppText variant="body" style={{ fontWeight: '500', lineHeight: 22, marginBottom: 4 }}>
                    {title}
                  </AppText>
                  <AppText variant="caption" tone="secondary">{description}</AppText>
                  <AppText variant="caption" tone="muted" style={{ marginTop: 6 }}>
                    {recency}
                  </AppText>
                </View>
                <ChevronRight size={20} strokeWidth={2} color={theme.colors.brand.action} />
              </AppCard>
            </Pressable>
          )
        })}
      </FeatureList>
    </PageContainer>
  )
}
