/** 展示三个真实检测部位入口与同源无扰心率开关。 */

import { useStore } from '@nanostores/react'
import { View, useWindowDimensions, Pressable } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme } from 'styled-components/native'

import { featuresMessages } from '@/pages/features/featuresMessages'
import type { MeasurementRouteParams, RootStackParamList } from '@/app/navigation/types'
import { METHOD_ENTRIES, resolveMeasurementEntry } from '@/app/measurement/entry'
import { measurementGuideSkipped } from '@/app/preferences'
import { useMeasurementAccess } from '@/app/measurement/useMeasurementAccess'
import { CapturePhoto } from '@/pages/features/CapturePhoto'
import { PassiveHeartRateCard } from '@/pages/features/PassiveHeartRateCard'
import { AppCard } from '@/shared/components/AppCard'
import { AppText } from '@/shared/components/AppText'
import { PageContainer } from '@/shared/components/PageContainer'

import { FeatureIntro, FeatureList } from './styles'

/** 保留共用方式映射和设备跳过偏好，不建立指标专属检测流程。 */
export function FeaturesScreen() {
  const theme = useTheme()
  const messages = useStore(featuresMessages)
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const checkAccess = useMeasurementAccess()
  const { width, height } = useWindowDimensions()
  const compact = height < 740

  /** 在入口直接应用设备偏好，不挂载隐藏引导页或补弹声音提醒。 */
  const enterMeasurement = async (entry: MeasurementRouteParams) => {
    if (!await checkAccess(entry.method)) return
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
      <PassiveHeartRateCard />
      <FeatureList style={{ gap: compact ? 10 : 14 }}>
        {(['face', 'fingertip', 'chest'] as const).map((method) => (
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
        ))}
      </FeatureList>
    </PageContainer>
  )
}
