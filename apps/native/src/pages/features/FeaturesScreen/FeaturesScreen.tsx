/** 展示五项健康功能及与已确认数据对应的测量间隔。 */

import { useStore } from '@nanostores/react'
import { ChevronRight } from 'lucide-react-native'
import { Pressable, View } from 'react-native'
import { useTheme } from 'styled-components/native'

import { useAuthState } from '@/app/auth/useAuthState'
import { getMeasurementRecency, selectHealthPresentation } from '@/pages/home/healthPresentation'
import { featuresMessages } from '@/pages/features/featuresMessages'
import { FeatureIllustration } from '@/pages/features/FeatureIllustration'
import { feedbackMessages } from '@/app/i18n/feedbackMessages'
import { useFeedback } from '@/shared/components/FeedbackHost'
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

/** 定义功能卡片与其详情说明的文案映射。 */
const FEATURE_ENTRIES = [
  { kind: 'fingertip', titleKey: 'fingertipTitle', descriptionKey: 'fingertipDescription', instructionsKey: 'fingertipInstructions' },
  { kind: 'face', titleKey: 'faceTitle', descriptionKey: 'faceDescription', instructionsKey: 'faceInstructions' },
  { kind: 'pressure', titleKey: 'pressureTitle', descriptionKey: 'pressureDescription', instructionsKey: 'pressureInstructions' },
  { kind: 'oxygen', titleKey: 'oxygenTitle', descriptionKey: 'oxygenDescription', instructionsKey: 'oxygenInstructions' },
  { kind: 'risk', titleKey: 'riskTitle', descriptionKey: 'riskDescription', instructionsKey: 'riskInstructions' },
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

/** 展示并解释全部功能入口；点击只打开说明弹窗，不请求权限或采集。 */
export function FeaturesScreen() {
  const theme = useTheme()
  const authState = useAuthState()
  const presentation = selectHealthPresentation(authState)
  const messages = useStore(featuresMessages)
  const sharedMessages = useStore(feedbackMessages)
  const { showModal } = useFeedback()
  const nowMillis = Date.now()

  return (
    <PageContainer
      edges={['top', 'left', 'right']}
      backgroundVariant="functions"
      contentContainerStyle={{ paddingHorizontal: theme.layout.pageGutter }}
    >
      <FeatureIntro>
        <AppText variant="title">{messages.title}</AppText>
        <AppText variant="caption" tone="secondary" style={{ textAlign: 'right' }}>
          {messages.disclaimer}
        </AppText>
      </FeatureIntro>
      <FeatureList>
        {FEATURE_ENTRIES.map((feature) => {
          const title = messages[feature.titleKey]
          const description = messages[feature.descriptionKey]
          const instruction = messages[feature.instructionsKey]
          const recency = feature.kind === 'risk'
            ? messages.notAssessed
            : feature.kind === 'face'
              ? messages.noMeasurement
              : formatRecency(presentation.measuredAt, messages, nowMillis)
          return (
            <Pressable
              key={feature.kind}
              onPress={() => showModal({
                title,
                message: `${description}\n\n${instruction}\n\n${messages.notConnected}`,
                closeLabel: sharedMessages.dismiss,
                actions: [{ label: sharedMessages.dismiss, primary: true }],
              })}
              accessibilityRole="button"
              accessibilityLabel={title}
              accessibilityHint={`${description} ${recency}`}
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
                  <AppText variant="caption" tone="secondary" style={{ marginTop: 6 }}>
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
