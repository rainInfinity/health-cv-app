/** 三种检测方式共用准备布局；提醒确认与设备启动严格分离。 */

import { useCallback, useId, useState } from 'react'
import { BackHandler, Pressable, ScrollView, View, useWindowDimensions } from 'react-native'
import type { LayoutChangeEvent } from 'react-native'
import { useStore } from '@nanostores/react'
import { useFocusEffect } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { useTheme } from 'styled-components/native'

import type { MeasurementMethod, RootStackParamList } from '@/app/navigation/types'
import { resolveMeasurementEntry, TARGET_MESSAGE_KEYS } from '@/app/measurement/entry'
import { measurementGuideSkipped } from '@/app/preferences'
import { ActionButton } from '@/shared/components/ActionButton'
import { AppText } from '@/shared/components/AppText'
import { FeedbackDialog } from '@/shared/components/FeedbackDialog'
import { ArrowLeft, XinmuLogo } from '@/shared/graphics'
import { OperationPhoto } from './OperationPhoto'
import { PreparationIcon } from './PreparationIcon'
import type { PreparationIconKind } from './PreparationIcon'
import { measurementMessages } from './measurementMessages'
import { useGuideDialog } from './useGuideDialog'
import { GuideDialogLayer, GuideHeader, GuideMain, GuidePreparation, GuideSafeArea, GuideStep, GuideSurface, GuideVisual, SkipControl } from './styles'

const GUIDE_CONFIGURATION = {
  face: { title: 'faceTitle', description: 'faceDescription', photo: 'facePhoto', steps: ['light', 'face', 'still'] },
  fingertip: { title: 'fingertipTitle', description: 'fingertipDescription', photo: 'fingertipPhoto', steps: ['cover', 'gentle', 'stable'] },
  chest: { title: 'chestTitle', description: 'chestDescription', photo: 'chestPhoto', steps: ['cover', 'chest', 'stableChest'] },
} as const satisfies Record<MeasurementMethod, object>

const PREPARATION_STEPS = {
  sound: { icon: 'sound', title: 'soundTitle', hint: 'soundHint' },
  light: { icon: 'light', title: 'lightTitle', hint: 'lightHint' },
  face: { icon: 'face', title: 'framingTitle', hint: 'framingHint' },
  still: { icon: 'still', title: 'stillTitle', hint: 'stillHint' },
  cover: { icon: 'cover', title: 'coverTitle', hint: 'coverHint' },
  gentle: { icon: 'gentle', title: 'gentleTitle', hint: 'gentleHint' },
  stable: { icon: 'stable', title: 'stableTitle', hint: 'stableHint' },
  chest: { icon: 'chest', title: 'chestStepTitle', hint: 'chestStepHint' },
  stableChest: { icon: 'stable', title: 'stableChestTitle', hint: 'stableChestHint' },
} as const satisfies Record<string, { icon: PreparationIconKind; title: string; hint: string }>

/** 根栈页面自行分配一次安全区，指尖确认后保留可返回的准备层级。 */
export function MeasurementGuideScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'MeasurementGuide'>) {
  const theme = useTheme()
  const messages = useStore(measurementMessages)
  const { width, height } = useWindowDimensions()
  const { method, target } = route.params
  const preference = measurementGuideSkipped[method]
  const skipped = useStore(preference)
  const configuration = GUIDE_CONFIGURATION[method]
  const { dialog, opacity, showDialog, closeDialog } = useGuideDialog()
  const [visualHeight, setVisualHeight] = useState(240)
  const [disclaimerHeight, setDisclaimerHeight] = useState(18)
  const [storageError, setStorageError] = useState(false)
  const id = useId().replace(/:/g, '')
  const compact = height < 740
  const gutter = width < 360 ? theme.layout.pageGutterNarrow : theme.layout.pageGutter

  /** 忽略亚像素差异，避免照片随重复布局通知重建。 */
  const handleVisualLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.floor(event.nativeEvent.layout.height)
    setVisualHeight((current) => current === nextHeight ? current : nextHeight)
  }, [])

  /** 为说明文字预留完整高度，不把取整误差反馈到图片尺寸。 */
  const handleDisclaimerLayout = useCallback((event: LayoutChangeEvent) => {
    // 向上取整保留完整文字高度，避免亚像素布局反复调整照片。
    const nextHeight = Math.ceil(event.nativeEvent.layout.height)
    setDisclaimerHeight((current) => current === nextHeight ? current : nextHeight)
  }, [])

  /** 提醒和未接入反馈都只关闭当前引导页的弹层。 */
  const cancelDialog = useCallback(() => closeDialog(), [closeDialog])

  useFocusEffect(useCallback(() => {
    if (dialog == null) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      cancelDialog()
      return true
    })
    return () => subscription.remove()
  }, [cancelDialog, dialog]))

  /** 跳过时移除引导层级；未接入方式只显示真实能力边界。 */
  const startMeasurement = useCallback(() => {
    const destination = resolveMeasurementEntry({ method, target }, true)
    if (destination == null) {
      showDialog({
        title: messages.notConnectedTitle,
        message: messages.chestNotConnected,
        closeLabel: messages.closeReminder,
        actions: [{ label: messages.understood, primary: true }],
      })
    } else if (method === 'face' || skipped) {
      navigation.replace(...destination)
    } else {
      navigation.navigate(...destination)
    }
  }, [messages, method, navigation, showDialog, skipped, target])

  /** 已勾选时当次也不提醒；其他情况先在引导页内完成声音确认。 */
  const prompt = useCallback(() => {
    if (skipped) {
      startMeasurement()
      return
    }
    showDialog({
      title: messages.soundReminderTitle,
      message: messages.soundReminder,
      closeLabel: messages.closeReminder,
      actions: [
        { label: messages.confirm, primary: true, onPress: startMeasurement },
        { label: messages.returnPreparation },
      ],
    })
  }, [messages, showDialog, skipped, startMeasurement])

  return (
    <GuideSurface>
      <Svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }} pointerEvents="none">
        <Defs>
          <LinearGradient id={`${id}-background`} x1="24%" y1="0%" x2="76%" y2="100%">
            <Stop stopColor={theme.colors.brand.subtle} />
            <Stop offset="0.75" stopColor={theme.colors.surface.default} />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill={`url(#${id}-background)`} />
      </Svg>
      <GuideSafeArea edges={['top', 'bottom', 'left', 'right']} accessibilityElementsHidden={dialog != null} importantForAccessibility={dialog != null ? 'no-hide-descendants' : 'auto'}>
          <GuideHeader>
            <Pressable accessibilityRole="button" accessibilityLabel={messages.back} onPress={() => navigation.goBack()} style={({ pressed }) => ({ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
              <ArrowLeft size={24} color={theme.colors.brand.action} />
            </Pressable>
            <AppText style={{ flex: 1, textAlign: 'center', fontWeight: '500' }}>{target ? `${messages[method === 'face' ? 'faceMethod' : method === 'fingertip' ? 'fingertipMethod' : 'chestMethod']} · ${messages[TARGET_MESSAGE_KEYS[target]]}` : messages.preparation}</AppText>
            <View style={{ width: 48, alignItems: 'center' }}><XinmuLogo size={28} /></View>
          </GuideHeader>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
            <GuideMain style={{ paddingHorizontal: gutter, paddingTop: compact ? 8 : 12, paddingBottom: compact ? 16 : 24, gap: compact ? 12 : 20 }}>
              <View style={{ alignItems: 'center' }}>
                <AppText variant="title" style={{ color: theme.colors.brand.action, textAlign: 'center' }}>{messages[configuration.title]}</AppText>
                <AppText variant="label" tone="secondary" style={{ textAlign: 'center', marginTop: 8, fontWeight: '400' }}>{messages[configuration.description]}</AppText>
              </View>
              <GuideVisual onLayout={handleVisualLayout} style={{ paddingBottom: disclaimerHeight + 8, minHeight: 160 + disclaimerHeight + 8 }}>
                <OperationPhoto method={method} size={Math.max(64, Math.min(360, width - gutter * 2, visualHeight - disclaimerHeight - 8))} label={messages[configuration.photo]} />
                <AppText variant="caption" tone="muted" onLayout={handleDisclaimerLayout} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, textAlign: 'center' }}>{messages.disclaimer}</AppText>
              </GuideVisual>
              <GuidePreparation style={compact ? { paddingVertical: 16 } : undefined}>
                {(['sound', ...configuration.steps] as const).map((key) => {
                  const step = PREPARATION_STEPS[key]
                  return (
                    <GuideStep key={key}>
                      <PreparationIcon kind={step.icon} />
                      <AppText variant="label" style={{ textAlign: 'center', marginTop: 8, marginBottom: 4 }}>{messages[step.title]}</AppText>
                      <AppText variant="caption" tone="secondary" style={{ textAlign: 'center' }}>{messages[step.hint]}</AppText>
                    </GuideStep>
                  )
                })}
              </GuidePreparation>
              <View>
                <SkipControl accessibilityRole="checkbox" accessibilityState={{ checked: skipped }} accessibilityLabel={messages.skip} onPress={() => {
                  try {
                    preference.set(!skipped)
                    setStorageError(false)
                  } catch {
                    setStorageError(true)
                  }
                }} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                  <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: theme.colors.brand.primary, backgroundColor: skipped ? theme.colors.brand.primary : theme.colors.surface.default }}>
                    {skipped && <Svg width={13} height={13} viewBox="0 0 16 16"><Path d="m4 8 2.5 2.5L12 5" fill="none" stroke={theme.colors.surface.default} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>}
                  </View>
                  <AppText variant="label" tone="secondary" style={{ fontWeight: '400' }}>{messages.skip}</AppText>
                </SkipControl>
                {storageError && <AppText variant="caption" accessibilityRole="alert" style={{ textAlign: 'center', marginBottom: 8 }}>{messages.storageError}</AppText>}
                <View style={{ width: '90%', alignSelf: 'center' }}><ActionButton label={messages.start} onPress={prompt} /></View>
              </View>
            </GuideMain>
          </ScrollView>
      </GuideSafeArea>
      {dialog != null && (
        <GuideDialogLayer needsOffscreenAlphaCompositing renderToHardwareTextureAndroid style={{ opacity }}>
          <FeedbackDialog options={dialog} onCancel={cancelDialog} onAction={(action) => closeDialog(action.onPress)} />
        </GuideDialogLayer>
      )}
    </GuideSurface>
  )
}
