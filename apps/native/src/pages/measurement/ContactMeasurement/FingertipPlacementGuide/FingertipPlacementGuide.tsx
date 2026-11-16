/** 只展示手指放置与相邻后摄移动，不控制设备或覆盖观测。 */

import { useEffect, useRef, useState } from 'react'
import { Animated, AppState, Easing, Modal, useWindowDimensions } from 'react-native'
import { useStore } from '@nanostores/react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from 'styled-components/native'

import { ActionButton } from '@/shared/components/ActionButton'
import { AppText } from '@/shared/components/AppText'
import { DialogActions, DialogMessageScroll, DialogSurface, Overlay } from '@/shared/components/FeedbackDialog/styles'
import { FingertipRearCameraArtwork } from '../FingertipRearCameraArtwork'
import { fingertipMessages } from '../../FingertipMeasurement/fingertipMessages'

import { Caption, Example, Examples, GuideContent } from './styles'

interface FingertipPlacementGuideProps {
  /** 宿主控制本轮指导是否展示。 */
  visible: boolean
  /** 仅确认收起指导，不启动或切换设备。 */
  onConfirm: () => void
  /** 使用静止的已放置姿态，禁止循环动画。 */
  reducedMotion: boolean
}

/** 百分比与原始数值直接对应 Demo 的 CSS 关键帧。 */
type Keyframe = readonly [percent: number, value: number]

const PLACE_Y: readonly Keyframe[] = [[0, 140], [42, 0], [100, 0]]
const PLACE_FEEDBACK: readonly Keyframe[] = [[0, 0], [30, 0], [50, 0.8], [80, 0.8], [100, 0.35]]
const SWITCH_X: readonly Keyframe[] = [[0, 0], [20, 0], [38, 75], [56, 170], [80, 170], [88, 170], [89, 0], [94, 0], [100, 0]]
const SWITCH_Y: readonly Keyframe[] = [[0, 0], [20, 0], [38, -110], [56, 30], [80, 30], [88, 30], [89, 0], [94, 0], [100, 0]]
const SWITCH_HAND: readonly Keyframe[] = [[0, 1], [80, 1], [88, 0], [89, 0], [94, 0], [100, 1]]
const SWITCH_SOURCE: readonly Keyframe[] = [[0, 0.8], [20, 0.8], [32, 0], [94, 0], [100, 0.8]]
const SWITCH_TARGET: readonly Keyframe[] = [[0, 0], [38, 0], [56, 0.9], [80, 0.9], [92, 0], [100, 0]]
const SWITCH_ARROW: readonly Keyframe[] = [[0, 0], [20, 0], [32, 1], [54, 1], [68, 0], [100, 0]]
const KEYFRAME_EASING = Easing.bezier(0.42, 0, 0.58, 1)

/** 每段独立应用 CSS ease-in-out，使箭头、镜头高亮与手指移动保持原稿时序。 */
function animateKeyframes(value: Animated.Value, duration: number, frames: readonly Keyframe[]) {
  value.setValue(frames[0][1])
  return Animated.sequence(frames.slice(1).map(([percent, target], index) => Animated.timing(value, {
    toValue: target,
    duration: (percent - frames[index][0]) * duration / 100,
    easing: KEYFRAME_EASING,
    useNativeDriver: true,
    isInteraction: false,
  })))
}

/** 使用本地原生 Modal 隔离触控，只允许显式确认；关闭和后台立即停止图解。 */
export function FingertipPlacementGuide({ visible, onConfirm, reducedMotion }: FingertipPlacementGuideProps) {
  const messages = useStore(fingertipMessages)
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const [foreground, setForeground] = useState(AppState.currentState === 'active')
  const placeY = useRef(new Animated.Value(0)).current
  const placeFeedback = useRef(new Animated.Value(0.35)).current
  const switchX = useRef(new Animated.Value(170)).current
  const switchY = useRef(new Animated.Value(30)).current
  const switchHand = useRef(new Animated.Value(1)).current
  const switchSource = useRef(new Animated.Value(0)).current
  const switchTarget = useRef(new Animated.Value(0.9)).current
  const switchArrow = useRef(new Animated.Value(0)).current
  const availableHeight = Math.max(0, height - insets.top - insets.bottom - theme.spacing.xl * 2)
  const artworkHeight = Math.min(176, availableHeight * 0.32)

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setForeground(state === 'active'))
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    placeY.setValue(0)
    placeFeedback.setValue(0.35)
    switchX.setValue(170)
    switchY.setValue(30)
    switchHand.setValue(1)
    switchSource.setValue(0)
    switchTarget.setValue(0.9)
    switchArrow.setValue(0)
    if (!visible || !foreground || reducedMotion) return

    const placement = Animated.parallel([
      animateKeyframes(placeY, 3_600, PLACE_Y),
      animateKeyframes(placeFeedback, 3_600, PLACE_FEEDBACK),
    ])
    const switching = Animated.loop(Animated.parallel([
      animateKeyframes(switchX, 5_000, SWITCH_X),
      animateKeyframes(switchY, 5_000, SWITCH_Y),
      animateKeyframes(switchHand, 5_000, SWITCH_HAND),
      animateKeyframes(switchSource, 5_000, SWITCH_SOURCE),
      animateKeyframes(switchTarget, 5_000, SWITCH_TARGET),
      animateKeyframes(switchArrow, 5_000, SWITCH_ARROW),
    ]))
    placement.start()
    switching.start()
    return () => {
      placement.stop()
      switching.stop()
    }
  }, [visible, foreground, reducedMotion, placeY, placeFeedback, switchX, switchY, switchHand, switchSource, switchTarget, switchArrow])

  return (
    <Modal transparent visible={visible} animationType={reducedMotion ? 'none' : 'fade'} statusBarTranslucent onRequestClose={() => undefined}>
      <Overlay style={{ paddingTop: insets.top + theme.spacing.xl, paddingBottom: insets.bottom + theme.spacing.xl }}>
        <DialogSurface accessibilityViewIsModal style={[theme.surfaceElevation.overlay, { maxHeight: availableHeight }]}>
          <AppText variant="section" accessibilityRole="header">{messages.placementGuideTitle}</AppText>
          <DialogMessageScroll showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <GuideContent>
              <AppText tone="secondary">{messages.placementGuideMessage}</AppText>
              <Examples>
                <Example>
                  <FingertipRearCameraArtwork height={artworkHeight} handY={placeY} sourceOpacity={placeFeedback} />
                  <Caption>
                    <AppText variant="label" style={{ textAlign: 'center' }}>{messages.backTitle}</AppText>
                    <AppText variant="caption" tone="secondary" style={{ textAlign: 'center' }}>{messages.placementGuidePlaceHint}</AppText>
                  </Caption>
                </Example>
                <Example>
                  <FingertipRearCameraArtwork height={artworkHeight} switching handX={switchX} handY={switchY} handOpacity={switchHand} sourceOpacity={switchSource} targetOpacity={switchTarget} arrowOpacity={switchArrow} />
                  <Caption>
                    <AppText variant="label" style={{ textAlign: 'center' }}>{messages.placementGuideSwitchTitle}</AppText>
                    <AppText variant="caption" tone="secondary" style={{ textAlign: 'center' }}>{messages.placementGuideSwitchHint}</AppText>
                  </Caption>
                </Example>
              </Examples>
            </GuideContent>
          </DialogMessageScroll>
          <DialogActions>
            <ActionButton label={messages.placementGuideConfirm} onPress={onConfirm} />
          </DialogActions>
        </DialogSurface>
      </Overlay>
    </Modal>
  )
}
