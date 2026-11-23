/** 将原生被动服务快照映射为仅右侧可操作的无扰心率卡片。 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, AppState, Easing } from 'react-native'
import { useFocusEffect, useIsFocused } from '@react-navigation/native'
import { useStore } from '@nanostores/react'
import { useTheme } from 'styled-components/native'

import {
  connectPassiveCaptureScreen,
  disablePassiveCapture,
  isPassiveCaptureEnabled,
  openPassiveCaptureSettings,
  passiveCaptureBusy,
  passiveCaptureError,
  passiveCaptureSnapshot,
  refreshPassiveCaptureSnapshot,
} from '@/app/passive-capture'
import { usePassiveCaptureEnable } from '@/app/passive-capture-interaction'
import {
  canOpenPassiveCaptureSettings,
  localizePassiveCaptureError,
  passiveCaptureMessages,
} from '@/app/passive-capture-messages'
import { featuresMessages } from '@/pages/features/featuresMessages'
import { HealthIndicatorArtwork } from '@/shared/graphics'
import { ActionButton } from '@/shared/components/ActionButton'
import { AppCard } from '@/shared/components/AppCard'
import { AppText } from '@/shared/components/AppText'
import { LoadingIndicator } from '@/shared/components/LoadingIndicator'
import { InsetTrack } from '@/shared/components/InsetTrack'
import { StatusFeedback } from '@/shared/components/StatusFeedback'

import { PassiveCopy, PendingOverlay, SwitchRipple, SwitchTarget, SwitchThumb, SwitchTrack } from './styles'

/** 双波纹保持首页同样的4.8秒周期，相隔半周期。 */
const RIPPLE_DURATION = 4800

/** 服务只由用户命令改变；订阅、焦点和前台恢复只刷新真实状态。 */
export function PassiveHeartRateCard() {
  const theme = useTheme()
  const messages = useStore(featuresMessages)
  const serviceMessages = useStore(passiveCaptureMessages)
  const snapshot = useStore(passiveCaptureSnapshot)
  const busy = useStore(passiveCaptureBusy)
  const errorCode = useStore(passiveCaptureError)
  const requestEnable = usePassiveCaptureEnable()
  const focused = useIsFocused()
  const [foreground, setForeground] = useState(AppState.currentState === 'active')
  const [reduceMotion, setReduceMotion] = useState(true)
  // 只保留最后一份已确认外观，启动和关闭收尾不能提前宣称成功。
  const confirmedEnabled = useRef(isPassiveCaptureEnabled(snapshot))
  if (isPassiveCaptureEnabled(snapshot)) confirmedEnabled.current = true
  else if (snapshot.state === 'disabled' || snapshot.state === 'failed') confirmedEnabled.current = false
  const enabled = confirmedEnabled.current
  const position = useRef(new Animated.Value(enabled ? 34 : 0)).current
  const firstRipple = useRef(new Animated.Value(0)).current
  const secondRipple = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const unsubscribe = connectPassiveCaptureScreen()
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      setForeground(state === 'active')
      if (state === 'active') refreshPassiveCaptureSnapshot()
    })
    return () => {
      appStateSubscription.remove()
      unsubscribe()
    }
  }, [])

  useFocusEffect(useCallback(() => {
    refreshPassiveCaptureSnapshot()
    setForeground(AppState.currentState === 'active')
  }, []))

  useEffect(() => {
    let mounted = true
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduceMotion(value)
    }, () => undefined)
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    return () => { mounted = false; subscription.remove() }
  }, [])

  useEffect(() => {
    const animation = Animated.timing(position, {
      toValue: enabled ? 34 : 0,
      duration: reduceMotion ? 0 : 240,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: true,
    })
    animation.start()
    return () => animation.stop()
  }, [enabled, position, reduceMotion])

  useEffect(() => {
    if (!enabled || busy || !focused || !foreground || reduceMotion) return
    const first = Animated.loop(Animated.timing(firstRipple, {
      toValue: 1, duration: RIPPLE_DURATION, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }))
    const second = Animated.sequence([
      Animated.delay(RIPPLE_DURATION / 2),
      Animated.loop(Animated.timing(secondRipple, {
        toValue: 1, duration: RIPPLE_DURATION, easing: Easing.out(Easing.quad), useNativeDriver: true,
      })),
    ])
    first.start()
    second.start()
    return () => {
      first.stop()
      second.stop()
      firstRipple.setValue(0)
      secondRipple.setValue(0)
    }
  }, [busy, enabled, firstRipple, focused, foreground, reduceMotion, secondRipple])

  return (
    <>
      <AppCard variant="health" contentPadding={{ horizontal: 16, vertical: 12 }} contentGap={12} style={{ minHeight: 88, flexDirection: 'row', alignItems: 'center' }}>
        <PassiveCopy>
          <AppText style={{ fontSize: 16, lineHeight: 24, fontWeight: '500' }}>{messages.passiveTitle}</AppText>
          <AppText variant="caption" tone="secondary">{messages.passiveDescription}</AppText>
        </PassiveCopy>
        <SwitchTarget
          accessibilityRole="switch"
          accessibilityLabel={messages.passiveTitle}
          accessibilityHint={messages.passiveDescription}
          accessibilityState={{ checked: enabled, disabled: busy, busy }}
          accessibilityValue={busy ? { text: serviceMessages.commandPending } : undefined}
          disabled={busy}
          onPress={() => { if (enabled) void disablePassiveCapture(); else requestEnable() }}
          style={({ pressed }) => ({ opacity: busy ? 0.7 : pressed ? 0.85 : 1 })}
        >
          <SwitchTrack pointerEvents="none">
            <InsetTrack width={76} height={42} highlighted={enabled} />
          </SwitchTrack>
          <SwitchThumb pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ transform: [{ translateX: position }], boxShadow: `0px 2px 5px ${theme.colors.text.primary}2E` }}>
            {[firstRipple, secondRipple].map((ripple, index) => <SwitchRipple key={index} style={{ opacity: ripple.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.35, 0] }), transform: [{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) }] }} />)}
            <HealthIndicatorArtwork kind="heartRate" presentation="switch" width={38} height={38} heartRateColor={enabled ? theme.colors.brand.action : theme.colors.text.muted} />
            {busy && <PendingOverlay><LoadingIndicator size={20} /></PendingOverlay>}
          </SwitchThumb>
        </SwitchTarget>
      </AppCard>
      {errorCode != null && <StatusFeedback tone="error" title={serviceMessages.errorTitle} message={localizePassiveCaptureError(errorCode, serviceMessages)} />}
      {canOpenPassiveCaptureSettings(errorCode) && <ActionButton label={serviceMessages.openAppSettings} secondary disabled={busy} onPress={() => void openPassiveCaptureSettings()} />}
    </>
  )
}
