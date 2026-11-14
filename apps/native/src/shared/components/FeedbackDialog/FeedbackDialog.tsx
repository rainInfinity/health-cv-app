/** 复用统一对话框外观，浮层归属和关闭后的动作由宿主负责。 */

import { Pressable, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from 'styled-components/native'
import { ActionButton } from '@/shared/components/ActionButton'
import { AppText } from '@/shared/components/AppText'
import { X } from '@/shared/graphics'
import { DialogActions, DialogMessageScroll, DialogSurface, Overlay } from './styles'

/** 描述弹窗中的有名操作及其可选副作用。 */
export interface FeedbackAction {
  /** 按钮可见文本。 */
  label: string
  /** 主操作使用品牌按钮，其他操作使用白底次级按钮。 */
  primary?: boolean
  /** 宿主关闭弹窗后执行的操作。 */
  onPress?: () => void | Promise<void>
}

/** 描述共享对话框的内容和用户取消语义。 */
export interface FeedbackModalOptions {
  /** 弹窗标题。 */
  title: string
  /** 可选说明。 */
  message?: string
  /** 从上到下排列的显式用户操作。 */
  actions: FeedbackAction[]
  /** 关闭按钮的辅助技术名称。 */
  closeLabel: string
  /** 点按遮罩是否关闭，默认允许。 */
  dismissOnBackdrop?: boolean
  /** 用户取消时调用；显式动作及程序关闭不触发。 */
  onCancel?: () => void
}

/** 由宿主控制关闭、动作和原生窗口或页面内浮层的选择。 */
interface FeedbackDialogProps {
  /** 当前对话框内容。 */
  options: FeedbackModalOptions
  /** 用户关闭或点按遮罩时通知宿主。 */
  onCancel: () => void
  /** 点击动作时通知宿主，宿主先关闭再执行。 */
  onAction: (action: FeedbackAction) => void
}

/** 只绘制对话框，不创建全局窗口，允许引导页持有自己的弹层。 */
export function FeedbackDialog({ options, onCancel, onAction }: FeedbackDialogProps) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  return (
    <Pressable style={{ flex: 1 }} onPress={options.dismissOnBackdrop === false ? undefined : onCancel} accessibilityRole="none">
      <Overlay>
        <Pressable onPress={(event) => event.stopPropagation()} accessibilityRole="none" accessibilityViewIsModal>
          <DialogSurface style={[theme.surfaceElevation.overlay, { maxHeight: Math.max(200, height - insets.top - insets.bottom - theme.spacing.xl * 2) }]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
              <AppText variant="section" style={{ flex: 1 }}>{options.title}</AppText>
              <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel={options.closeLabel} hitSlop={8} style={{ minWidth: theme.icon.touchTarget, minHeight: theme.icon.touchTarget, alignItems: 'center', justifyContent: 'center' }}>
                <X size={theme.icon.default} color={theme.colors.text.secondary} />
              </Pressable>
            </View>
            {options.message != null && (
              <DialogMessageScroll style={{ maxHeight: Math.max(96, height * 0.5) }} keyboardShouldPersistTaps="handled">
                <AppText tone="secondary">{options.message}</AppText>
              </DialogMessageScroll>
            )}
            <DialogActions>
              {options.actions.map((action, index) => (
                <ActionButton key={`${index}-${action.label}`} label={action.label} secondary={!action.primary} onPress={() => onAction(action)} />
              ))}
            </DialogActions>
          </DialogSurface>
        </Pressable>
      </Overlay>
    </Pressable>
  )
}
