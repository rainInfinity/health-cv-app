/** 展示贴胸双图与独立跳过选择，确认只提交偏好，不确认贴胸或开始检测。 */
import { useEffect, useState } from 'react'
import { Modal, useWindowDimensions } from 'react-native'
import { useStore } from '@nanostores/react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { useTheme } from 'styled-components/native'
import { ActionButton } from '@/shared/components/ActionButton'
import { AppText } from '@/shared/components/AppText'
import { DialogActions, DialogMessageScroll, DialogSurface, Overlay } from '@/shared/components/FeedbackDialog/styles'
import { fingertipMessages } from '@/pages/measurement/FingertipMeasurement/fingertipMessages'
import { bloodPressureMessages } from '../bloodPressureMessages'
import { ChestInstructionArtwork } from '../ChestInstructionArtwork'
import { GuideContent, GuideTitle, SkipControl, SkipMark, StorageError } from './styles'

interface ChestPlacementGuideProps {
  /** 页面与当前原生轮次共同决定实际可见性。 */
  visible: boolean
  /** 保存选择后收起，不发送原生采集命令。 */
  onConfirm(skip: boolean): void
  /** 偏好未保存时留在弹窗反馈，允许重新确认。 */
  storageError: boolean
  /** 沿用原生系统减少动态效果设置。 */
  reducedMotion: boolean
}

/** 与指尖指导相同，仅确认可关闭；实际开窗或退出由宿主立即收起。 */
export function ChestPlacementGuide({ visible, onConfirm, storageError, reducedMotion }: ChestPlacementGuideProps) {
  const messages = useStore(bloodPressureMessages)
  const commonMessages = useStore(fingertipMessages)
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const [skip, setSkip] = useState(false)
  const availableHeight = Math.max(0, height - insets.top - insets.bottom - theme.spacing.xl * 2)
  const artworkHeight = Math.min(128, availableHeight * 0.25)

  useEffect(() => {
    if (!visible) setSkip(false)
  }, [visible])

  return (
    <Modal transparent visible={visible} animationType={reducedMotion ? 'none' : 'fade'} statusBarTranslucent onRequestClose={() => undefined}>
      <Overlay style={{ paddingTop: insets.top + theme.spacing.xl, paddingBottom: insets.bottom + theme.spacing.xl }}>
        <DialogSurface accessibilityViewIsModal style={[theme.surfaceElevation.overlay, { maxHeight: availableHeight }]}>
          <GuideTitle variant="section" accessibilityRole="header">{messages.chestGuideTitle}</GuideTitle>
          <DialogMessageScroll showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <GuideContent>
              <AppText tone="secondary">{messages.chestGuideMessage}</AppText>
              {visible && <ChestInstructionArtwork
                active
                visible
                reducedMotion={reducedMotion}
                height={artworkHeight}
                titles={[messages.chestGuideSideTitle, messages.chestGuideFrontTitle]}
                hints={[messages.chestGuideSideHint, messages.chestGuideFrontHint]}
              />}
            </GuideContent>
          </DialogMessageScroll>
          <DialogActions>
            <SkipControl accessibilityRole="checkbox" accessibilityState={{ checked: skip }} accessibilityLabel={messages.chestGuideSkip} onPress={() => setSkip(!skip)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <SkipMark $checked={skip}>
                {skip && <Svg width={13} height={13} viewBox="0 0 16 16" accessible={false}><Path d="m4 8 2.5 2.5L12 5" fill="none" stroke={theme.colors.surface.default} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>}
              </SkipMark>
              <AppText variant="label" tone="secondary">{messages.chestGuideSkip}</AppText>
            </SkipControl>
            {storageError && <StorageError variant="caption" accessibilityRole="alert">{messages.chestGuideStorageError}</StorageError>}
            <ActionButton label={commonMessages.placementGuideConfirm} onPress={() => onConfirm(skip)} />
          </DialogActions>
        </DialogSurface>
      </Overlay>
    </Modal>
  )
}
