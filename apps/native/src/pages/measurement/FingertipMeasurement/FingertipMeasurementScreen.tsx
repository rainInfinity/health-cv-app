/** 指尖纯展示页面：独立本地计时、原生分页及模拟图形，不持有采集资源。 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, AppState, Easing, ScrollView, View, useWindowDimensions } from 'react-native'
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { useStore } from '@nanostores/react'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { useTheme } from 'styled-components/native'

import type { RootStackParamList } from '@/app/navigation/types'
import { AppText } from '@/shared/components/AppText'
import { LoadingIndicator } from '@/shared/components/LoadingIndicator'
import { XinmuLogo } from '@/shared/graphics'
import { FingertipInstructionArtwork } from '@/pages/measurement/FingertipMeasurement/FingertipInstructionArtwork'
import { FingertipPreview } from '@/pages/measurement/FingertipMeasurement/FingertipPreview'
import { FingertipPulseWave } from '@/pages/measurement/FingertipMeasurement/FingertipPulseWave'

import { createFingertipDisplay, getFingertipPresentation } from './fingertipDisplay'
import type { FingertipDisplayController, FingertipDisplaySnapshot, FingertipPresentation } from './fingertipDisplay'
import { fingertipMessages } from './fingertipMessages'
import {
  BrandSlot, Carousel, Countdown, DataPanel, HeaderAction, HeaderTitle, Instructions,
  PageButton, PageMark, Pagination, Screen, Session, StatusBadge, StatusGroup, Step,
  Toolbar, Viewfinder, localStyles,
} from './styles'

/** 纯展示初态，没有上一轮波形、覆盖或检测时间。 */
function emptySnapshot(): FingertipDisplaySnapshot {
  return {
    phase: 'ready', coverage: 0, remainingMs: 30_000, runningElapsedMs: 0,
    wave: { points: [], revision: 0 },
  }
}

/** 入口导航且布局完成后自动演示；返回只销毁本页的展示资源。 */
export function FingertipMeasurementScreen() {
  const messages = useStore(fingertipMessages)
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'FingertipMeasurement'>>()
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
  const [snapshot, setSnapshot] = useState(emptySnapshot)
  const [coveragePresentation, setCoveragePresentation] = useState<FingertipPresentation>('ready')
  const [waveController, setWaveController] = useState<FingertipDisplayController | null>(null)
  const [page, setPage] = useState(0)
  const [pageWidth, setPageWidth] = useState(Math.max(1, width - panelPadding * 2))
  const [viewfinderHeight, setViewfinderHeight] = useState(viewfinderSlotHeight)
  const [sessionHeight, setSessionHeight] = useState(64 * fontScale)
  const [captionHeights, setCaptionHeights] = useState({ back: 50 * fontScale, front: 50 * fontScale })
  const captionHeight = Math.max(captionHeights.back, captionHeights.front)
  const [reducedMotion, setReducedMotion] = useState(true)
  const [visible, setVisible] = useState(false)
  const [waveInteracting, setWaveInteracting] = useState(false)
  const pager = useRef<ScrollView>(null)
  const controller = useRef<FingertipDisplayController | null>(null)
  const layoutReady = useRef(false)
  const selectedPage = useRef(0)
  const pageWidthRef = useRef(pageWidth)
  const reducedMotionRef = useRef(reducedMotion)
  const selectPage = useRef<(next: number) => void>(() => undefined)
  const alive = useRef(false)
  const pageProgress = useRef(new Animated.Value(0)).current
  const coverageProgress = useRef(new Animated.Value(0)).current
  const coverageAnimation = useRef<Animated.CompositeAnimation | null>(null)
  const previousPage = useRef(0)
  const pageMarkStyles = useMemo(() => [
    { width: pageProgress.interpolate({ inputRange: [0, 1], outputRange: [24, 6], extrapolate: 'clamp' }) },
    { width: pageProgress.interpolate({ inputRange: [0, 1], outputRange: [6, 24], extrapolate: 'clamp' }) },
  ], [pageProgress])

  useEffect(() => {
    let previous: FingertipPresentation = 'ready'
    const listener = coverageProgress.addListener(({ value }) => {
      const next = getFingertipPresentation('covering', value)
      if (next === previous) return
      previous = next
      setCoveragePresentation(next)
    })
    return () => coverageProgress.removeListener(listener)
  }, [coverageProgress])

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

  useFocusEffect(useCallback(() => {
    alive.current = true
    let mounted = true
    let appVisible = AppState.currentState === 'active'
    let motionRevision = 0
    let publishedPhase = 'ready'
    let publishedSeconds = 30
    let coverageTarget = 0
    coverageAnimation.current?.stop()
    coverageProgress.setValue(0)
    const display = createFingertipDisplay({
      now: () => performance.now(),
      schedule: (callback, delay) => setTimeout(callback, delay),
      cancel: (handle) => clearTimeout(handle as number),
      active: appVisible,
      reducedMotion: reducedMotionRef.current,
      onChange: (next) => {
        if (!mounted) return
        // 仅局部 Animated 节点补齐快照间隔，不让覆盖计时触发整页重绘。
        if (!appVisible || reducedMotionRef.current || next.phase !== 'covering') {
          coverageAnimation.current?.stop()
          coverageProgress.setValue(next.coverage)
        } else if (coverageTarget !== next.coverage) {
          coverageAnimation.current?.stop()
          coverageAnimation.current = Animated.timing(coverageProgress, {
            toValue: next.coverage,
            duration: 50,
            easing: Easing.linear,
            useNativeDriver: false,
            isInteraction: false,
          })
          coverageAnimation.current.start()
        }
        coverageTarget = next.coverage
        const nextSeconds = Math.ceil(next.remainingMs / 1_000)
        if (next.phase === publishedPhase && nextSeconds === publishedSeconds) return
        publishedPhase = next.phase
        publishedSeconds = nextSeconds
        setSnapshot(next)
      },
      onRunning: () => { if (mounted) selectPage.current(1) },
    })
    controller.current = display
    setWaveController(display)
    selectedPage.current = 0
    setPage(0)
    setSnapshot(display.getSnapshot())
    pager.current?.scrollTo({ x: 0, animated: false })
    setVisible(appVisible)
    if (layoutReady.current) display.layoutReady()

    const appSubscription = AppState.addEventListener('change', (state) => {
      if (!mounted) return
      appVisible = state === 'active'
      setVisible(appVisible)
      display.setActive(appVisible)
    })
    const applyMotion = (enabled: boolean) => {
      if (!mounted) return
      reducedMotionRef.current = enabled
      setReducedMotion(enabled)
      display.setReducedMotion(enabled)
      if (enabled) pager.current?.scrollTo({ x: selectedPage.current * pageWidthRef.current, animated: false })
    }
    const motionSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      motionRevision += 1
      applyMotion(enabled)
    })
    const initialMotionRevision = motionRevision
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted && initialMotionRevision === motionRevision) applyMotion(enabled)
    }, () => undefined)

    return () => {
      mounted = false
      alive.current = false
      coverageAnimation.current?.stop()
      display.dispose()
      controller.current = null
      setWaveController(null)
      appSubscription.remove()
      motionSubscription.remove()
      setVisible(false)
      setSnapshot(emptySnapshot())
      setWaveInteracting(false)
    }
  }, [coverageProgress]))

  const onLayout = useCallback(() => {
    layoutReady.current = true
    controller.current?.layoutReady()
  }, [])

  const updatePage = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!alive.current) return
    const next = Math.max(0, Math.min(1, Math.round(event.nativeEvent.contentOffset.x / pageWidthRef.current)))
    if (next === selectedPage.current) return
    selectedPage.current = next
    setPage(next)
  }, [])

  const onWaveInteractionChange = useCallback((active: boolean) => {
    // 在触摸起点即关闭原生分页，避免 React 提交前被外层抢走水平拖动。
    pager.current?.setNativeProps({ scrollEnabled: !active })
    setWaveInteracting(active)
  }, [])

  const measurePager = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width
    // 高度或子项布局变化不能把正在进行的水平滚动复位成无动画跳转。
    if (nextWidth <= 0 || nextWidth === pageWidthRef.current) return
    pageWidthRef.current = nextWidth
    setPageWidth(nextWidth)
    pager.current?.scrollTo({ x: selectedPage.current * nextWidth, animated: false })
  }, [])

  const phase = snapshot.phase
  const running = phase === 'running'
  const presentation = phase === 'covering' ? coveragePresentation : phase
  const statusColor = phase === 'ready' ? theme.colors.text.muted : theme.colors.brand.action
  const status = messages[presentation]
  const statusHint = presentation === 'ready' ? messages.statusReady
    : presentation === 'partial' ? messages.statusPartial
      : presentation === 'covered' ? messages.statusCovered
        : running ? messages.statusRunning : messages.statusCompleted
  const previewHint = presentation === 'ready' ? messages.hintReady
    : presentation === 'partial' ? messages.hintPartial
      : presentation === 'covered' ? messages.hintCovered
        : running ? messages.hintRunning : messages.hintCompleted
  const time = `00:${String(Math.ceil(snapshot.remainingMs / 1_000)).padStart(2, '0')}`
  const minimumPageHeight = Math.max(compact ? 118 : 140, captionHeight + 72)
  const pageHeight = Math.max(minimumPageHeight, availableHeight - 48 - viewfinderHeight - panelPadding * 2 - sessionHeight - (compact ? 8 : 20) - 52)
  const artHeight = Math.max(64, Math.min(156, Math.max(96, height * 0.16), pageHeight - captionHeight - 8))
  const plotHeight = Math.max(64, pageHeight - 30 * fontScale)

  return (
    <Screen style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }} onLayout={onLayout}>
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
      <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} contentContainerStyle={[localStyles.scrollContent, { minHeight: availableHeight }]}>
        <Toolbar>
          <HeaderAction
            accessibilityRole="button"
            accessibilityLabel={messages.back}
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
            diameter={diameter}
            coverageProgress={coverageProgress}
            animating={visible && (phase === 'covering' || running)}
            reducedMotion={reducedMotion}
            waitingDescription={messages.previewWaiting}
            coveredDescription={messages.previewCovered}
            notice={previewHint}
            coverageLabel={messages.coverage}
          />
        </Viewfinder>
        <DataPanel $compact={compact} style={{ marginLeft: -insets.left, marginRight: -insets.right, paddingLeft: panelPadding + insets.left, paddingRight: panelPadding + insets.right, paddingBottom: panelPadding + insets.bottom }}>
          <Session onLayout={(event) => setSessionHeight(event.nativeEvent.layout.height)}>
            <StatusGroup>
              <StatusBadge $started={phase !== 'ready'} accessible accessibilityRole="text" accessibilityLabel={status} accessibilityLiveRegion="polite">
                {visible && (phase === 'covering' || running)
                  ? <LoadingIndicator size={14} color={statusColor} />
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
              scrollEnabled={!waveInteracting}
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
              <View style={[localStyles.wavePage, { width: pageWidth, height: pageHeight }]} accessibilityElementsHidden={page !== 1} importantForAccessibility={page !== 1 ? 'no-hide-descendants' : 'auto'}>
                {waveController && (
                  <FingertipPulseWave
                    controller={waveController}
                    visible={visible && page === 1}
                    reducedMotion={reducedMotion}
                    title={messages.wave}
                    height={plotHeight}
                    accessibilityLabel={messages.waveDescription}
                    onInteractionChange={onWaveInteractionChange}
                  />
                )}
              </View>
            </ScrollView>
            <Pagination>
              {[messages.viewInstructions, messages.viewWave].map((label, index) => (
                <PageButton key={index} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: page === index }} onPress={() => selectPage.current(index)} style={({ pressed }) => ({ backgroundColor: pressed ? theme.colors.brand.subtle : 'transparent' })}>
                  <PageMark $selected={page === index} style={pageMarkStyles[index]} accessible={false} />
                </PageButton>
              ))}
            </Pagination>
          </Carousel>
        </DataPanel>
      </ScrollView>
    </Screen>
  )
}
