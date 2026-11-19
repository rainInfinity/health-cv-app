/** 指尖完成后的页内底部结果面板，展示动画不参与结果资格判断。 */
import { useEffect, useId, useRef, useState } from 'react'
import { Animated, BackHandler, Easing, Pressable, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useStore } from '@nanostores/react'
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { useTheme } from 'styled-components/native'
import { AppText } from '@/shared/components/AppText'
import { LoadingIndicator } from '@/shared/components/LoadingIndicator'
import { FingertipResultSummary, fingertipResultsMessages } from '@/pages/measurement/FingertipResults'
import { Backdrop, Collapse, Entry, EntrySlot, Overlay, Sheet, SheetScroll } from './styles'

/** 展示资格由本轮结果状态提供；面板只负责布局、动画与关闭入口。 */
interface FingertipResultSheetProps {
  /** 本页可见且本轮面板已展开。 */
  expanded: boolean
  /** 失焦或后台立即停止不可见动画。 */
  active: boolean
  /** 原底部面板在屏幕安全内容区内的顶边，单位 dp。 */
  panelTop: number
  /** 沿用页面已有动态效果偏好。 */
  reducedMotion: boolean
  /** 收起当前结果，不离开检测。 */
  onClose(): void
  /** 查看当前已完成轮次的详情。 */
  onDetails(): void
  /** 安全关闭旧轮后重新准备。 */
  onRetest(): void
}

/** 入口绝对定位于原面板顶边，不增加状态或分页的排版高度。 */
export function FingertipResultEntry({ waiting, onPress }: { /** 三秒展示等待中不可操作。 */ waiting: boolean; /** 重新展开当前轮结果。 */ onPress(): void }) {
  const messages = useStore(fingertipResultsMessages)
  const theme = useTheme()
  return (
    <EntrySlot pointerEvents="box-none">
      <Entry accessibilityRole="button" accessibilityState={{ disabled: waiting, busy: waiting }} disabled={waiting} onPress={onPress} style={theme.surfaceElevation.raised}>
        {waiting ? <LoadingIndicator size={24} color={theme.colors.brand.action} /> : (
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={theme.colors.brand.action} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
            <Path d="m6 14 6-6 6 6" />
          </Svg>
        )}
        <AppText variant="label" style={{ color: theme.colors.brand.action, fontWeight: '500' }}>{waiting ? messages.waitingTitle : messages.viewResults}</AppText>
      </Entry>
    </EntrySlot>
  )
}

/** 根据正文实际高度展开；滚动只发生在正文内，箭头始终保留于顶边。 */
export function FingertipResultSheet({ expanded, active, panelTop, reducedMotion, onClose, onDetails, onRetest }: FingertipResultSheetProps) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const messages = useStore(fingertipResultsMessages)
  const id = `result-sheet-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const progress = useRef(new Animated.Value(0)).current
  const [retained, setRetained] = useState(false)
  const [contentHeight, setContentHeight] = useState(0)
  const maximumHeight = Math.max(1, height - insets.top - 80)
  const sheetHeight = contentHeight > 0 ? Math.min(contentHeight, maximumHeight) : maximumHeight
  const closedOffset = Math.max(0, sheetHeight - (height - insets.top - panelTop))

  useEffect(() => {
    if (!active) {
      progress.stopAnimation()
      progress.setValue(0)
      setRetained(false)
      return
    }
    if (expanded) setRetained(true)
    const animation = Animated.timing(progress, {
      toValue: expanded ? 1 : 0,
      duration: reducedMotion ? 0 : expanded ? 420 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    })
    animation.start(({ finished }) => { if (finished && !expanded) setRetained(false) })
    return () => animation.stop()
  }, [active, expanded, progress, reducedMotion, sheetHeight])

  useEffect(() => {
    if (!active || !expanded) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true })
    return () => subscription.remove()
  }, [active, expanded, onClose])

  if (!active || (!expanded && !retained)) return null
  return (
    <Overlay accessibilityViewIsModal>
      <Backdrop style={{ backgroundColor: theme.colors.text.primary, opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.34] }) }}>
        <View style={{ flex: 1 }} />
      </Backdrop>
      <Pressable accessibilityRole="button" accessibilityLabel={messages.collapse} onPress={onClose} style={{ flex: 1 }} />
      <Sheet style={[theme.surfaceElevation.overlay, { height: sheetHeight, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [closedOffset, 0] }) }] }]}>
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, overflow: 'hidden' }}>
          <Svg width="100%" height="100%">
            <Defs><LinearGradient id={id} x1="32%" y1="0%" x2="68%" y2="100%"><Stop stopColor={theme.colors.brand.subtle} /><Stop offset="0.7" stopColor={theme.colors.surface.default} /></LinearGradient></Defs>
            <Rect width="100%" height="100%" fill={`url(#${id})`} />
          </Svg>
        </View>
        <SheetScroll showsVerticalScrollIndicator={false} bounces={false} onContentSizeChange={(_width, nextHeight) => setContentHeight(nextHeight)} contentContainerStyle={{ paddingBottom: insets.bottom }}>
          <FingertipResultSummary onDetails={onDetails} onRetest={onRetest} />
        </SheetScroll>
        <Collapse accessibilityRole="button" accessibilityLabel={messages.collapse} onPress={onClose} style={theme.surfaceElevation.raised}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={theme.colors.text.secondary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" accessible={false}><Path d="m6 10 6 6 6-6" /></Svg>
        </Collapse>
      </Sheet>
    </Overlay>
  )
}
