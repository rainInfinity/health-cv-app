/** 底部六成屏高的单选菜单；草稿由组件持有，确认后才通知调用方提交。 */
import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, Modal, ScrollView, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from 'styled-components/native'
import { AppText } from '@/shared/components/AppText'
import { CircleCheck } from '@/shared/graphics'
import { Backdrop, BackdropButton, Header, HeaderAction, OptionButton, Root, Surface } from './styles'

/** 通用选项只包含稳定值和可见名称，不绑定具体业务。 */
export interface SelectionOption<Value extends string> {
  /** 选项的稳定业务值。 */
  value: Value
  /** 显示给用户的名称。 */
  label: string
}

/** 调用方控制显示和提交值，关闭不改变已提交选择。 */
export interface SelectionSheetProps<Value extends string> {
  /** 是否打开菜单；重新打开时从 value 建立草稿。 */
  visible: boolean
  /** 居中的菜单标题。 */
  title: string
  /** 左侧取消操作文案。 */
  cancelLabel: string
  /** 右侧确认操作文案。 */
  confirmLabel: string
  /** 当前已提交的选项值，应存在于 options 中。 */
  value: Value
  /** 按展示顺序排列的可选项，值应唯一。 */
  options: readonly SelectionOption<Value>[]
  /** 取消、遮罩或系统返回关闭完成后调用。 */
  onCancel: () => void
  /** 确认关闭完成后提交草稿，调用方应同时关闭菜单。 */
  onConfirm: (value: Value) => void
}

/** 关闭即卸载草稿与动画，外部离页关闭不会触发确认或取消副作用。 */
export function SelectionSheet<Value extends string>(props: SelectionSheetProps<Value>) {
  return props.visible ? <SelectionSheetContent {...props} /> : null
}

/** 固定头部与可滚动选项区分别布局，背景遮罩不随面板位移。 */
function SelectionSheetContent<Value extends string>({ title, cancelLabel, confirmLabel, value, options, onCancel, onConfirm }: SelectionSheetProps<Value>) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const sheetHeight = height * .6
  const [draft, setDraft] = useState(value)
  const progress = useRef(new Animated.Value(0)).current
  const motion = useRef<Animated.CompositeAnimation | null>(null)
  const mounted = useRef(true)
  const closing = useRef(false)
  const reducedMotion = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; motion.current?.stop() }
  }, [])

  /** 原生窗口显示后开始位移，减少动态效果时直接呈现。 */
  function open() {
    const animate = (reduced: boolean) => {
      if (!mounted.current || closing.current) return
      reducedMotion.current = reduced
      motion.current = Animated.timing(progress, { toValue: 1, duration: reduced ? 0 : theme.motion.overlay, easing: Easing.out(Easing.cubic), useNativeDriver: true })
      motion.current.start()
    }
    void AccessibilityInfo.isReduceMotionEnabled().then(animate, () => animate(true))
  }

  /** 淡出与下滑完成后才提交，重复点击和卸载后的回调均不执行动作。 */
  function finish(confirm: boolean) {
    if (closing.current) return
    closing.current = true
    motion.current?.stop()
    motion.current = Animated.timing(progress, { toValue: 0, duration: reducedMotion.current ? 0 : theme.motion.standard, easing: Easing.in(Easing.cubic), useNativeDriver: true })
    motion.current.start(({ finished }) => {
      if (!finished || !mounted.current) return
      if (confirm) onConfirm(draft)
      else onCancel()
    })
  }

  return <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onShow={open} onRequestClose={() => finish(false)}>
    <Root>
      <Backdrop style={{ opacity: progress }}><BackdropButton accessible={false} onPress={() => finish(false)} /></Backdrop>
      <Surface accessibilityViewIsModal style={{ height: sheetHeight, paddingBottom: insets.bottom, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight, 0] }) }] }}>
        <Header>
          <HeaderAction onPress={() => finish(false)} accessibilityRole="button"><AppText tone="secondary">{cancelLabel}</AppText></HeaderAction>
          <AppText variant="section" accessibilityRole="header" style={{ flex: 1, textAlign: 'center', fontWeight: '700' }}>{title}</AppText>
          <HeaderAction onPress={() => finish(true)} accessibilityRole="button"><AppText style={{ color: theme.colors.brand.action, fontWeight: '600' }}>{confirmLabel}</AppText></HeaderAction>
        </Header>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: theme.spacing.md, gap: theme.spacing.xs }} showsVerticalScrollIndicator={false}>
          {options.map((option) => <OptionButton key={option.value} $selected={draft === option.value} onPress={() => { if (!closing.current) setDraft(option.value) }} accessibilityRole="radio" accessibilityState={{ checked: draft === option.value }}>
            <AppText style={{ flex: 1, color: draft === option.value ? theme.colors.brand.action : theme.colors.text.primary }}>{option.label}</AppText>
            <View style={{ width: theme.icon.compact, height: theme.icon.compact }} accessible={false}>{draft === option.value && <CircleCheck size={theme.icon.compact} color={theme.colors.brand.action} />}</View>
          </OptionButton>)}
        </ScrollView>
      </Surface>
    </Root>
  </Modal>
}
