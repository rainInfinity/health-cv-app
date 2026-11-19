/** 展示真实面部心率会话，不将逐搏值或产品模拟数据写入频谱平均。 */

import { useEffect, useId } from 'react'
import { useStore } from '@nanostores/react'
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme } from 'styled-components/native'
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
import { RPPGPreview } from '@health-cv-app/acquisition/react'
import type { RootStackParamList } from '@/app/navigation/types'
import { ArrowLeft, XinmuLogo } from '@/shared/graphics'
import { ActionButton } from '@/shared/components/ActionButton'
import { AppText } from '@/shared/components/AppText'
import { useFeedback } from '@/shared/components/FeedbackHost'
import { LoadingIndicator } from '@/shared/components/LoadingIndicator'
import { feedbackMessages } from '@/app/i18n/feedbackMessages'
import { PulseWaveHistory } from '@/shared/components/PulseWaveHistory'
import { faceMeasurementMessages, localizeFaceMeasurementError } from './messages'
import { useFaceMeasurement } from './useFaceMeasurement'
import { formatFaceMeasurementElapsed } from './faceMeasurementTime'
import { CameraFrame, Footer, Header, Panel, Placeholder, PreviewLabel, Readout, Screen, Viewfinder, WavePanel } from './styles'

/** 面部产品页在用户开始前不创建 runtime、不挂载预览、不申请权限。 */
export function FaceMeasurementScreen() {
  const messages = useStore(faceMeasurementMessages)
  const sharedMessages = useStore(feedbackMessages)
  const { showModal } = useFeedback()
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { width, height, fontScale } = useWindowDimensions()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const measurement = useFaceMeasurement()
  const { snapshot, summary, waveformHistory, busy, localError, closeFailed } = measurement
  const elapsedTime = formatFaceMeasurementElapsed(snapshot, measurement.elapsedMillis)
  const gradientId = useId()
  const cameraGradientId = useId()
  const cornerGradientId = useId()
  const cornerFill = `url(#${cornerGradientId})`
  const compact = height < 740
  const gutter = width < 360 ? 16 : 24
  const panelPadding = compact ? 16 : 20
  const expandedText = fontScale > 1.25
  const minimumWaveformHeight = compact ? 100 : 128
  const availableHeight = height - insets.top - insets.bottom
  // 大字号允许纵向滚动，不能为塞进一屏把取景区压缩到标签遮挡占位图。
  let previewWidth = width - gutter * 2 - 8
  if (!expandedText) {
    const panelMinimum = 80 * fontScale + 22 * fontScale + 16 + minimumWaveformHeight + 16 + 52 + panelPadding * 2
    previewWidth = Math.min(previewWidth, Math.max(120, (availableHeight - 48 - 54 - panelMinimum) * 1.25))
  }
  const previewHeight = previewWidth * 0.8

  const active = snapshot.phase === 'observing' || snapshot.phase === 'measuring'
  const finishing = snapshot.phase === 'stopping' || measurement.pendingAction === 'stop'
  const complete = snapshot.phase === 'completed'
  const error = localError ?? (snapshot.phase === 'closed' ? null : snapshot.error?.code ?? null)
  const failed = error != null || snapshot.phase === 'failed'
  const average = summary.validWindowCount > 0 ? summary.validHeartRateSum / summary.validWindowCount : null
  const ended = complete || snapshot.phase === 'failed'
  const running = !ended && (active || finishing || (!failed && (busy || snapshot.phase === 'opening' || snapshot.phase === 'preview')))
  const status = running ? messages.measuring : ended ? messages.ended : messages.ready
  const statusHint = running
    ? average == null ? messages.accumulating : messages.stable
    : ended ? messages.endedHint : messages.tapStart
  const cameraHint = running || ended ? messages.keepStill : messages.readyHint
  const previewVisible = snapshot.phase === 'opening' || snapshot.phase === 'preview' || active || finishing
  const actionLabel = running ? messages.stop : ended ? messages.restart : messages.start
  const labelStyle = { fontSize: 14, lineHeight: 22 * fontScale, fontWeight: '500' as const }
  const mutedStyle = { fontSize: 12, lineHeight: 18 * fontScale }
  const statusColor = running ? theme.colors.brand.action : theme.colors.text.muted

  useEffect(() => {
    if (error == null && !closeFailed) return
    showModal({
      title: messages.title,
      message: closeFailed ? messages.errorClose : localizeFaceMeasurementError(error ?? 'UNKNOWN', messages),
      closeLabel: sharedMessages.dismiss,
      actions: [{ label: sharedMessages.dismiss, primary: true }],
    })
  }, [closeFailed, error, messages, sharedMessages.dismiss, showModal])

  return (
    <Screen style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
      <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none" accessible={false}>
        <Defs>
          <LinearGradient id={gradientId} x1="0%" y1="0%" x2="26%" y2="100%">
            <Stop offset="0" stopColor={theme.colors.brand.subtle} />
            <Stop offset="0.65" stopColor={theme.colors.surface.default} />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill={`url(#${gradientId})`} />
      </Svg>
      <ScrollView contentContainerStyle={{ flexGrow: 1, minHeight: height - insets.top }}>
        <Header>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={messages.back}
            disabled={measurement.leaving}
            accessibilityState={{ disabled: measurement.leaving }}
            onPress={() => navigation.goBack()}
            style={({ pressed }) => ({ width: 48, height: 48, justifyContent: 'center', alignItems: 'center', opacity: pressed || measurement.leaving ? 0.5 : 1 })}
          >
            <ArrowLeft size={24} color={theme.colors.brand.action} accessible={false} />
          </Pressable>
          <AppText accessibilityRole="header" style={{ flex: 1, textAlign: 'center', fontSize: 18, lineHeight: 26 * fontScale, fontWeight: '500' }}>{messages.title}</AppText>
          <View style={{ width: 48, alignItems: 'center' }} accessible={false} importantForAccessibility="no-hide-descendants"><XinmuLogo size={28} /></View>
        </Header>
        <Viewfinder style={{ paddingHorizontal: gutter }}>
          <CameraFrame style={[{ width: previewWidth }, theme.surfaceElevation.raised]} accessible={false}>
            {measurement.previewMounted && (
              <RPPGPreview
                style={StyleSheet.absoluteFill}
                onLayout={measurement.onPreviewLayout}
                accessible={false}
                importantForAccessibility="no-hide-descendants"
              />
            )}
            {!previewVisible && (
              <Placeholder>
                <Svg style={StyleSheet.absoluteFill} width={previewWidth} height={previewHeight} accessible={false}>
                  <Defs><LinearGradient id={cameraGradientId} x1="0%" y1="0%" x2="100%" y2="100%"><Stop offset="0" stopColor={theme.colors.surface.default} /><Stop offset="1" stopColor={theme.colors.brand.subtle} /></LinearGradient></Defs>
                  <Rect width={previewWidth} height={previewHeight} fill={`url(#${cameraGradientId})`} />
                </Svg>
                <Svg width={80} height={80} viewBox="0 0 80 80" fill="none" stroke={theme.colors.brand.action} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" accessibilityLabel={messages.placeholder} accessible>
                  <Path d="M13 24h13l6-9h16l6 9h13a6 6 0 0 1 6 6v30a6 6 0 0 1-6 6H13a6 6 0 0 1-6-6V30a6 6 0 0 1 6-6Z" /><Circle cx={40} cy={44} r={15} /><Circle cx={40} cy={44} r={9} /><Path d="M60 33h3" />
                </Svg>
              </Placeholder>
            )}
            <Svg style={StyleSheet.absoluteFill} width={previewWidth} height={previewHeight} viewBox={`0 0 ${previewWidth} ${previewHeight}`} pointerEvents="none" accessible={false}>
              {/* 24 dp 色块内的 22→22.5 dp 径向过渡，旋转复用以还原四角弧形衬底。 */}
              <Defs>
                <RadialGradient id={cornerGradientId} cx="100%" cy="100%" rx="93.75%" ry="93.75%">
                  <Stop offset="0.9777778" stopColor={theme.colors.brand.primary} stopOpacity={0} />
                  <Stop offset="1" stopColor={theme.colors.brand.primary} stopOpacity={0.35} />
                </RadialGradient>
              </Defs>
              <Rect width={24} height={24} fill={cornerFill} />
              <Rect x={previewWidth - 24} width={24} height={24} fill={cornerFill} transform={`rotate(90 ${previewWidth - 12} 12)`} />
              <Rect y={previewHeight - 24} width={24} height={24} fill={cornerFill} transform={`rotate(270 12 ${previewHeight - 12})`} />
              <Rect x={previewWidth - 24} y={previewHeight - 24} width={24} height={24} fill={cornerFill} transform={`rotate(180 ${previewWidth - 12} ${previewHeight - 12})`} />
              {previewVisible && <Circle cx={previewWidth / 2} cy={previewHeight / 2} r={Math.min(previewWidth * 0.28, 70)} stroke={theme.colors.brand.primary} strokeOpacity={0.28} strokeWidth={3} fill="none" />}
              {/* 角线向画面内侧填充，避免居中描边被边界裁掉半宽。 */}
              <Path d={`M0 0H24V2H2V24H0Z M${previewWidth - 24} 0H${previewWidth}V24H${previewWidth - 2}V2H${previewWidth - 24}Z M0 ${previewHeight - 24}H2V${previewHeight - 2}H24V${previewHeight}H0Z M${previewWidth - 2} ${previewHeight - 24}H${previewWidth}V${previewHeight}H${previewWidth - 24}V${previewHeight - 2}H${previewWidth - 2}Z`} fill={theme.colors.brand.primary} />
            </Svg>
            <PreviewLabel><AppText style={[mutedStyle, { color: theme.colors.brand.action }]}>{messages.preview}</AppText></PreviewLabel>
          </CameraFrame>
          <AppText tone="secondary" style={[mutedStyle, { textAlign: 'center', marginTop: 8 }]}>{cameraHint}</AppText>
        </Viewfinder>
        <Panel style={{ padding: panelPadding, marginLeft: -insets.left, marginRight: -insets.right, paddingLeft: panelPadding + insets.left, paddingRight: panelPadding + insets.right, paddingBottom: panelPadding + insets.bottom }}>
          <Readout style={expandedText ? { flexWrap: 'wrap', justifyContent: 'center', gap: 16 } : { gap: width < 360 ? 4 : 8 }}>
            <View style={{ alignItems: 'center', width: expandedText ? Math.min(width - panelPadding * 2, 118 * fontScale) : width < 360 ? 106 : 118 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Svg width={18} height={18} viewBox="0 0 24 24" fill={theme.colors.accent.rose} accessible={false}><Path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></Svg>
                <AppText style={[labelStyle, { color: theme.colors.accent.rose }]}>{messages.average}</AppText>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', flexWrap: expandedText ? 'wrap' : 'nowrap', gap: 6 }}>
                <AppText style={{ width: (width < 360 ? 62 : 76) * fontScale, textAlign: 'right', fontSize: width < 360 ? 28 : width < 389 ? 36 : 40, lineHeight: (width < 360 ? 40 : 52) * fontScale, fontWeight: '600', letterSpacing: -2, fontVariant: ['tabular-nums'], color: theme.colors.accent.rose }}>{average == null ? '--' : Math.round(average)}</AppText>
                <AppText tone="secondary" style={mutedStyle}>{messages.unit}</AppText>
              </View>
            </View>
            <View style={{ alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <AppText tone="muted" style={mutedStyle}>{messages.timer}</AppText>
              <AppText accessibilityLabel={`${messages.timer} ${elapsedTime}`} style={{ color: running ? theme.colors.brand.action : theme.colors.text.secondary, fontSize: width < 360 ? 24 : 28, lineHeight: 36 * fontScale, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{elapsedTime}</AppText>
            </View>
            <View style={{ width: expandedText ? undefined : width < 360 ? 78 : 92, alignItems: 'center', flexShrink: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: width < 360 ? 6 : 10, borderRadius: theme.radius.pill, backgroundColor: running ? theme.colors.brand.subtle : theme.colors.surface.subtle }}>
                {running ? <LoadingIndicator size={14} color={statusColor} /> : <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: statusColor }} accessible={false} />}
                <AppText accessibilityLiveRegion="polite" style={[labelStyle, { color: statusColor, flexShrink: 1 }]}>{status}</AppText>
              </View>
              <AppText tone="muted" style={[mutedStyle, { textAlign: 'center', marginTop: 8 }]}>{statusHint}</AppText>
            </View>
          </Readout>
          <WavePanel style={compact ? { marginTop: 2, paddingTop: 2 } : undefined}>
            <PulseWaveHistory
              key={measurement.waveformKey}
              points={waveformHistory.points}
              latestTimeMs={waveformHistory.latestTimeMs}
              title={messages.waveform}
              accessibilityLabel={messages.waveformAccessibility}
              minimumHeight={minimumWaveformHeight}
              headingGap={compact ? 4 : 8}
              scrolling={snapshot.phase === 'measuring'}
            />
          </WavePanel>
          <Footer style={compact ? { marginTop: 8 } : undefined}>
            <ActionButton label={actionLabel} loading={busy} disabled={busy} onPress={active ? measurement.stop : measurement.start} />
          </Footer>
        </Panel>
      </ScrollView>
    </Screen>
  )
}
