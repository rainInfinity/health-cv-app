/** 血压双阶段采集及同轮云端结果，正式开窗仅由原生准入。 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, ScrollView, View, useWindowDimensions } from 'react-native'
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { useStore } from '@nanostores/react'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { useTheme } from 'styled-components/native'

import type { RootStackParamList } from '@/app/navigation/types'
import { AppText } from '@/shared/components/AppText'
import { LoadingIndicator } from '@/shared/components/LoadingIndicator'
import { useFeedback } from '@/shared/components/FeedbackHost'
import { XinmuLogo } from '@/shared/graphics'
import { FingertipInstructionArtwork } from '@/pages/measurement/ContactMeasurement/FingertipInstructionArtwork'
import { FingertipPreview } from '@/pages/measurement/ContactMeasurement/FingertipPreview'
import { ChestInstructionArtwork } from './ChestInstructionArtwork'
import { ChestPlacementGuide } from './ChestPlacementGuide'
import { FingertipPlacementGuide } from '@/pages/measurement/ContactMeasurement/FingertipPlacementGuide'
import { MeasurementResultSheet, MeasurementResultEntry } from '@/pages/measurement/MeasurementResultSheet'
import { BloodPressureResultSummary, bloodPressureResultsMessages } from '@/pages/measurement/BloodPressureResults'
import { MeasurementFailure } from '@/pages/measurement/MeasurementFailure'

import { useBloodPressureMeasurement } from './useBloodPressureMeasurement'
import { fingertipMessages } from '../FingertipMeasurement/fingertipMessages'
import { bloodPressureMessages } from './bloodPressureMessages'
import {
  BrandSlot, Carousel, Countdown, DataPanel, HeaderAction, HeaderTitle, Instructions,
  PageButton, PageMark, Pagination, Screen, Session, StatusBadge, StatusGroup, Step,
  Toolbar, Viewfinder, localStyles,
} from '../ContactMeasurement/styles'


/** 明确入口自动授权准备，正式开始与三十秒截止均消费原生事实。 */
export function BloodPressureMeasurementScreen() {
  const commonMessages = useStore(fingertipMessages)
  const pressureMessages = useStore(bloodPressureMessages)
  const resultMessages = useStore(bloodPressureResultsMessages)
  const messages = useMemo(() => ({ ...commonMessages, ...pressureMessages }), [commonMessages, pressureMessages])
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'BloodPressureMeasurement'>>()
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { width, height, fontScale } = useWindowDimensions()
  const id = `finger-screen-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const compact = height <= 740
  const panelPadding = compact ? 16 : 20
  const availableHeight = height - insets.top - insets.bottom
  // 复用旧取景区域的总高度，把下方说明和间隔让给圆形，底部面板不移动。
  const originalDiameter = Math.min(width - 80, Math.max(160, Math.min(300, availableHeight - (48 + 76 + 360))))
  const viewfinderSlotHeight = originalDiameter + (compact ? 60 : 76)
  const diameter = Math.min(332, width - 40, originalDiameter + (compact ? 32 : 36))
  const measurement = useBloodPressureMeasurement()
  const { snapshot, visible } = measurement
  const { showModal, showToast, dismissToast } = useFeedback()
  const [page, setPage] = useState(0)
  const [pageWidth, setPageWidth] = useState(Math.max(1, width - panelPadding * 2))
  const [viewfinderHeight, setViewfinderHeight] = useState(viewfinderSlotHeight)
  const [panelTop, setPanelTop] = useState(48 + viewfinderSlotHeight)
  const [sessionHeight, setSessionHeight] = useState(64 * fontScale)
  const [captionHeights, setCaptionHeights] = useState({ back: 50 * fontScale, front: 50 * fontScale })
  const captionHeight = Math.max(captionHeights.back, captionHeights.front)
  const [reducedMotion, setReducedMotion] = useState(true)
  const pager = useRef<ScrollView>(null)
  const selectedPage = useRef(0)
  const pageWidthRef = useRef(pageWidth)
  const reducedMotionRef = useRef(reducedMotion)
  const selectPage = useRef<(next: number) => void>(() => undefined)
  const alive = useRef(false)
  const pageProgress = useRef(new Animated.Value(0)).current
  const coverageProgress = useRef(new Animated.Value(0)).current
  const previousPage = useRef(0)
  const pageMarkStyles = useMemo(() => [
    { width: pageProgress.interpolate({ inputRange: [0, 1], outputRange: [24, 6], extrapolate: 'clamp' }) },
    { width: pageProgress.interpolate({ inputRange: [0, 1], outputRange: [6, 24], extrapolate: 'clamp' }) },
  ], [pageProgress])


  useEffect(() => {
    const changed = previousPage.current !== page
    previousPage.current = page
    if (reducedMotion || !visible) {
      pageProgress.setValue(page)
      return
    }
    if (!changed) return
    const animation = Animated.timing(pageProgress, { toValue: page, duration: 200, useNativeDriver: false })
    animation.start()
    return () => animation.stop()
  }, [page, pageProgress, reducedMotion, visible])

  reducedMotionRef.current = reducedMotion
  pageWidthRef.current = pageWidth
  selectPage.current = (next) => {
    if (!alive.current) return
    pager.current?.scrollTo({ x: next * pageWidthRef.current, animated: !reducedMotionRef.current })
  }

  useEffect(() => {
    alive.current = true
    let mounted = true
    let motionRevision = 0
    const applyMotion = (enabled: boolean) => {
      if (!mounted) return
      reducedMotionRef.current = enabled
      setReducedMotion(enabled)
      if (enabled) pager.current?.scrollTo({ x: selectedPage.current * pageWidthRef.current, animated: false })
    }
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      motionRevision += 1
      applyMotion(enabled)
    })
    const initialRevision = motionRevision
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted && initialRevision === motionRevision) applyMotion(enabled)
    }, () => undefined)
    return () => {
      mounted = false
      alive.current = false
      subscription.remove()
    }
  }, [])


  useEffect(() => {
    selectedPage.current = 0
    setPage(0)
    pager.current?.scrollTo({ x: 0, animated: false })
  }, [measurement.previewKey])


  useEffect(() => {
    const phase = snapshot?.phase
    if (phase === 'awaiting_chest' || phase === 'starting' || phase === 'capturing') selectPage.current(1)
    else if (phase === 'observing_finger') selectPage.current(0)
  }, [snapshot?.captureId, snapshot?.phase])

  const error = measurement.leaving ? null : measurement.localError ?? (snapshot?.phase === 'failed' ? snapshot.errorCode ?? 'UNKNOWN'
    : snapshot?.phase === 'interrupted' ? snapshot.endReason ?? 'INTERRUPTED' : null)
  useEffect(() => {
    if (error == null && !measurement.closeFailed) return
    const code = error?.toUpperCase() ?? ''
    const message = measurement.closeFailed ? messages.errorClose
      : code === 'CLOUD_ACCESS_REQUIRED' ? '账号、上传用途或当前渠道的统一检测场景尚未就绪，未启动设备。请返回入口后再次明确开始。'
      : code.includes('PERMISSION') ? messages.errorPermission
        : code.includes('TORCH') ? messages.errorTorch
          : code.includes('BACK_CAMERA') ? messages.errorBackCamera
            : code.includes('BUSY') ? messages.errorBusy
              : code.includes('SENSOR') || code.includes('GYROSCOPE') || code.includes('ACCELEROMETER') || code.includes('IMU') ? messages.errorSensor
              : code.includes('COVERAGE') ? messages.errorCoverage
                : code.includes('BACKGROUND') || code.includes('FOREGROUND') ? messages.errorBackground : messages.errorGeneric
    showModal({
      title: messages.title, message, closeLabel: messages.dismiss,
      actions: [
        { label: messages.back, onPress: () => navigation.goBack() },
        { label: measurement.closeFailed ? messages.retryClose : messages.retry, primary: true, onPress: measurement.retry },
      ],
    })
  }, [error, measurement.closeFailed, measurement.retry, messages, navigation, showModal])

  const updatePage = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!alive.current) return
    const next = Math.max(0, Math.min(1, Math.round(event.nativeEvent.contentOffset.x / pageWidthRef.current)))
    if (next === selectedPage.current) return
    selectedPage.current = next
    setPage(next)
  }, [])

  const measurePager = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width
    // 高度或子项布局变化不能把正在进行的水平滚动复位成无动画跳转。
    if (nextWidth <= 0 || nextWidth === pageWidthRef.current) return
    pageWidthRef.current = nextWidth
    setPageWidth(nextWidth)
    pager.current?.scrollTo({ x: selectedPage.current * nextWidth, animated: false })
  }, [])

  const phase = snapshot?.phase ?? 'preparing'
  const running = phase === 'capturing'
  const presentation = measurement.localError != null ? 'failed' : measurement.leaving ? 'stopping' : snapshot?.presentation ?? 'ready'
  const waitingForResults = measurement.result.phase === 'waiting'
  const resultFailure = measurement.result.failure
  useEffect(() => {
    if (!waitingForResults || !visible || measurement.leaving || error != null) return
    const toastId = showToast({ tone: 'loading', message: resultMessages.waitingToast, showLabel: false, blocking: false })
    return () => dismissToast(toastId)
  }, [waitingForResults, visible, measurement.leaving, measurement.result.captureId, resultMessages.waitingToast, error, showToast, dismissToast])
  const active = waitingForResults || measurement.busy || phase === 'observing_finger' || phase === 'awaiting_chest' || phase === 'starting' || running || phase === 'stopping' || (phase === 'completed' && !snapshot?.resourcesReleased)
  const statusColor = resultFailure ? theme.colors.feedback.error : presentation === 'ready' ? theme.colors.text.muted : theme.colors.brand.action
  const waitingChest = measurement.localError == null && !measurement.leaving && (phase === 'awaiting_chest' || phase === 'starting')
  const status = resultFailure ? resultMessages[`${resultFailure}FailedTitle`] : waitingForResults ? resultMessages.waitingTitle : waitingChest ? messages.awaitingChest : messages[presentation]
  const statusHint = resultFailure ? resultMessages[`${resultFailure}FailedHint`] : waitingForResults ? resultMessages.waitingHint : waitingChest ? messages.statusAwaitingChest : presentation === 'ready' ? messages.statusReady
    : presentation === 'partial' ? messages.statusPartial
      : presentation === 'covered' ? messages.statusCovered
        : presentation === 'running' ? messages.statusRunning
          : presentation === 'stopping' ? messages.statusStopping
            : presentation === 'completed' ? messages.statusCompleted : messages.statusInterrupted
  const time = `00:${String(snapshot?.remainingSeconds ?? 30).padStart(2, '0')}`
  const minimumPageHeight = Math.max(compact ? 118 : 140, captionHeight + 72)
  const pageHeight = Math.max(minimumPageHeight, availableHeight - 48 - viewfinderHeight - panelPadding * 2 - sessionHeight - (compact ? 8 : 20) - 52)
  const artHeight = Math.max(64, Math.min(156, Math.max(96, height * 0.16), pageHeight - captionHeight - 8))

  /** 本轮详情额外携带captureId，历史报告只需要taskId。 */
  function showDetails() {
    const params = measurement.enterDetails()
    if (params != null) navigation.navigate('BloodPressureResults', params)
  }

  return (
    <Screen style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
      <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={localStyles.background}>
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id={`${id}-background`} x1="37%" y1="0%" x2="63%" y2="100%">
              <Stop stopColor={theme.colors.brand.subtle} />
              <Stop offset="0.75" stopColor={theme.colors.surface.default} />
            </LinearGradient>
          </Defs>
          <Rect width={width} height={height} fill={`url(#${id}-background)`} />
        </Svg>
      </View>
      <ScrollView pointerEvents={measurement.result.expanded ? 'none' : 'auto'} accessibilityElementsHidden={measurement.result.expanded} importantForAccessibility={measurement.result.expanded ? 'no-hide-descendants' : 'auto'} nestedScrollEnabled showsVerticalScrollIndicator={false} contentContainerStyle={[localStyles.scrollContent, { minHeight: availableHeight }]}>
        <Toolbar>
          <HeaderAction
            accessibilityRole="button"
            accessibilityLabel={messages.back}
            disabled={measurement.leaving}
            accessibilityState={{ disabled: measurement.leaving }}
            onPress={() => navigation.goBack()}
            style={({ pressed }) => ({ backgroundColor: pressed ? theme.colors.brand.subtle : 'transparent' })}
          >
            <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={theme.colors.brand.action} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Path d="m15 18-6-6 6-6" />
            </Svg>
          </HeaderAction>
          <HeaderTitle><AppText variant="body" accessibilityRole="header" style={localStyles.heading}>{messages.title}</AppText></HeaderTitle>
          <BrandSlot><XinmuLogo size={28} /></BrandSlot>
        </Toolbar>
        <Viewfinder $compact={compact} style={{ height: viewfinderSlotHeight }} onLayout={(event) => setViewfinderHeight(event.nativeEvent.layout.height)}>
          <FingertipPreview
            key={measurement.previewKey}
            diameter={diameter}
            display={measurement.display}
            highlightNotice
            noticeRequiresAction={waitingChest}
            notice={measurement.localError != null || measurement.leaving ? undefined : presentation === 'completed' ? resultMessages.completedHint : waitingChest ? messages.hintAwaitingChest : running ? messages.hintRunning : undefined}
            overridePresentation={measurement.localError != null ? 'failed' : measurement.leaving ? 'stopping' : null}
            previewMounted={measurement.previewMounted}
            onPreviewLayout={measurement.onPreviewLayout}
            coverageProgress={coverageProgress}
            animating={visible && active && measurement.localError == null && !measurement.leaving}
            reducedMotion={reducedMotion}
          />
        </Viewfinder>
        <DataPanel $compact={compact} onLayout={(event) => setPanelTop(event.nativeEvent.layout.y)} style={{ marginLeft: -insets.left, marginRight: -insets.right, paddingLeft: panelPadding + insets.left, paddingRight: panelPadding + insets.right, paddingBottom: panelPadding + insets.bottom }}>
          {measurement.result.phase !== 'idle' && !measurement.leaving && error == null && (
            <MeasurementResultEntry waiting={waitingForResults} waitingLabel={resultMessages.waitingTitle} availableLabel={resultMessages.viewResults} onPress={measurement.openResults} />
          )}
          <Session onLayout={(event) => setSessionHeight(event.nativeEvent.layout.height)}>
            <StatusGroup>
              <StatusBadge $started={snapshot != null} accessible accessibilityRole="text" accessibilityLabel={status} accessibilityLiveRegion="polite">
                {visible && active && presentation !== 'failed'
                  ? <LoadingIndicator size={14} />
                  : <Svg width="14" height="14" viewBox="0 0 14 14" accessible={false}>
                      <Circle cx="7" cy="7" r="6" fill="none" stroke={statusColor} strokeWidth="2" />
                    </Svg>}
                <AppText variant="label" style={{ color: statusColor, lineHeight: 22 * fontScale }}>{status}</AppText>
              </StatusBadge>
              <AppText variant="caption" tone="muted">{statusHint}</AppText>
            </StatusGroup>
            <Countdown accessible accessibilityLabel={`${messages.remaining} ${time}`}>
              <AppText variant="caption" tone="muted">{messages.remaining}</AppText>
              <AppText variant="display" style={[localStyles.countdown, { color: running ? theme.colors.brand.action : theme.colors.text.secondary, lineHeight: 36 * fontScale }]}>{time}</AppText>
            </Countdown>
          </Session>
          <Carousel $compact={compact}>
            <ScrollView
              ref={pager}
              horizontal
              pagingEnabled
              directionalLockEnabled
              nestedScrollEnabled
              removeClippedSubviews={false}
              showsHorizontalScrollIndicator={false}
              bounces={false}
              onLayout={measurePager}
              onScroll={updatePage}
              scrollEventThrottle={50}
              style={[localStyles.carouselScroll, { height: pageHeight }]}
            >
              <Instructions
                style={{ width: pageWidth, height: pageHeight }}
                accessibilityElementsHidden={page !== 0}
                importantForAccessibility={page !== 0 ? 'no-hide-descendants' : 'auto'}
              >
                {(['back', 'front'] as const).map((side) => (
                  <Step key={side}>
                    <FingertipInstructionArtwork side={side} height={artHeight} coverageProgress={coverageProgress} reducedMotion={reducedMotion} />
                    <View style={localStyles.stepCopy} onLayout={(event) => {
                      const measuredHeight = event.nativeEvent.layout.height
                      setCaptionHeights((previous) => previous[side] === measuredHeight ? previous : { ...previous, [side]: measuredHeight })
                    }}>
                      <AppText variant="label" style={localStyles.centered}>{side === 'back' ? messages.backTitle : messages.frontTitle}</AppText>
                      <AppText variant="caption" tone="secondary" style={localStyles.stepHint}>{side === 'back' ? messages.backHint : messages.frontHint}</AppText>
                    </View>
                  </Step>
                ))}
              </Instructions>
              <ChestInstructionArtwork
                active={visible && page === 1 && !measurement.leaving && !measurement.chestGuideVisible && !measurement.result.expanded}
                visible={page === 1}
                reducedMotion={reducedMotion}
                height={artHeight}
                width={pageWidth}
                pageHeight={pageHeight}
                titles={[messages.chestSideTitle, messages.chestFrontTitle]}
                hints={[messages.chestSideHint, messages.chestFrontHint]}
              />
            </ScrollView>
            <Pagination>
              {[messages.viewInstructions, messages.viewChest].map((label, index) => (
                <PageButton key={index} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: page === index }} onPress={() => selectPage.current(index)} style={({ pressed }) => ({ backgroundColor: pressed ? theme.colors.brand.subtle : 'transparent' })}>
                  <PageMark $selected={page === index} style={pageMarkStyles[index]} accessible={false} />
                </PageButton>
              ))}
            </Pagination>
          </Carousel>
        </DataPanel>
      </ScrollView>
      <FingertipPlacementGuide
        visible={measurement.placementGuideVisible && visible && error == null && !measurement.leaving}
        onConfirm={measurement.dismissPlacementGuide}
        reducedMotion={reducedMotion}
      />
      <ChestPlacementGuide
        visible={measurement.chestGuideVisible && visible && error == null && !measurement.leaving}
        onConfirm={measurement.confirmChestGuide}
        storageError={measurement.chestGuideStorageError}
        reducedMotion={reducedMotion}
      />
      <MeasurementResultSheet
        key={measurement.result.captureId ?? measurement.previewKey}
        expanded={measurement.result.expanded && error == null && !measurement.leaving}
        active={visible}
        panelTop={panelTop}
        reducedMotion={reducedMotion}
        onClose={measurement.closeResults}
        collapseLabel={resultMessages.collapse}
      >
        {resultFailure ? <MeasurementFailure kind={resultFailure} messages={resultMessages} onRetry={resultFailure === 'query' ? () => { void measurement.requeryResults() } : measurement.retry} />
          : measurement.result.report && <BloodPressureResultSummary report={measurement.result.report} onDetails={showDetails} onRetest={measurement.retry} />}
      </MeasurementResultSheet>
    </Screen>
  )
}
