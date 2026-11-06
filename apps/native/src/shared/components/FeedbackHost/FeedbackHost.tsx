/** 提供全局单弹窗、单 Toast 队列及其可访问原生呈现。 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Modal, Pressable, View, useWindowDimensions } from 'react-native'
import { CircleAlert, CircleCheck, Info, X } from '@/shared/graphics'
import { useStore } from '@nanostores/react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from 'styled-components/native'

import { ActionButton } from '@/shared/components/ActionButton'
import { LoadingIndicator } from '@/shared/components/LoadingIndicator'
import { AppText } from '@/shared/components/AppText'
import { feedbackMessages } from '@/app/i18n/feedbackMessages'
import {
  DialogActions,
  DialogMessageScroll,
  DialogSurface,
  Overlay,
  ToastCopy,
  ToastSurface,
} from './styles'

import { SingleToastLifecycle } from './toastLifecycle'
import type { FeedbackTone } from './toastLifecycle'
export type { FeedbackTone } from './toastLifecycle'

/** 描述弹窗中的有名操作及其可选副作用。 */
export interface FeedbackAction {
  /** 按钮可见文本。 */
  label: string
  /** 主操作使用品牌按钮，其他操作使用白底次级按钮。 */
  primary?: boolean
  /** 关闭弹窗后执行的操作。 */
  onPress?: () => void | Promise<void>
}

/** 描述一个可替换当前弹窗的单实例对话框。 */
export interface FeedbackModalOptions {
  /** 弹窗标题。 */
  title: string
  /** 可选说明。 */
  message?: string
  /** 从上到下排列的显式用户操作。 */
  actions: FeedbackAction[]
  /** 关闭按钮的辅助技术名称和可见位置。 */
  closeLabel: string
  /** 点按遮罩是否关闭，默认允许。 */
  dismissOnBackdrop?: boolean
}

/** 描述单一 Toast 状态、正文、持续时间和用户关闭能力。 */
export interface FeedbackToastOptions {
  /** 成功、错误、加载或信息状态。 */
  tone: FeedbackTone
  /** 单行或多行反馈正文。 */
  message: string
  /** 自动关闭时间，默认 3500 毫秒；加载态始终等待显式结束。 */
  durationMs?: number
  /** 是否允许用户关闭；默认允许，认证操作反馈显式设为 false。 */
  dismissible?: boolean
}

/** 定义供页面使用的单一弹窗和 Toast 操作契约。 */
interface FeedbackContextValue {
  /** 用新 Toast 立即替换旧 Toast，并返回其序号。 */
  showToast: (options: FeedbackToastOptions) => number
  /** 仅在预期 Toast 仍显示时替换它，避免迟到结果覆盖新反馈。 */
  replaceToast: (expectedId: number, options: FeedbackToastOptions) => number | null
  /** 关闭当前 Toast；加载操作结束时应显式调用。 */
  dismissToast: () => void
  /** 显示单一弹窗，并替换当前弹窗。 */
  showModal: (options: FeedbackModalOptions) => void
  /** 关闭弹窗。 */
  dismissModal: () => void
}

/** 共享反馈上下文；缺少根 Provider 时显式暴露集成错误。 */
const FeedbackContext = createContext<FeedbackContextValue | null>(null)

/** 描述 Toast 的唯一可见序号，避免过期计时器关闭新提示。 */
interface ActiveToast extends FeedbackToastOptions {
  /** 每次替换都会递增的本地序号。 */
  id: number
}

/** 将弹窗和 Toast 主机置于应用根下，供所有页面共享。 */
export function FeedbackHost({ children }: { children: ReactNode }) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const sharedMessages = useStore(feedbackMessages)
  const toastLifecycleRef = useRef<SingleToastLifecycle | null>(null)
  if (toastLifecycleRef.current == null) toastLifecycleRef.current = new SingleToastLifecycle()
  const toastLifecycle = toastLifecycleRef.current
  const nextToastId = useRef(0)
  const activeToastId = useRef<number | null>(null)
  const [modal, setModal] = useState<FeedbackModalOptions | null>(null)
  const [toast, setToast] = useState<ActiveToast | null>(null)
  /** 用唯一生命周期替换 Toast，自动过期回调只能关闭自己的提示。 */
  const showToast = useCallback((options: FeedbackToastOptions): number => {
    const id = ++nextToastId.current
    activeToastId.current = id
    setToast({ ...options, id })
    toastLifecycle.replace(
      { id, tone: options.tone, durationMs: options.durationMs },
      (expiredId) => {
        if (activeToastId.current !== expiredId) return
        activeToastId.current = null
        setToast((current) => current?.id === expiredId ? null : current)
      },
    )
    return id
  }, [toastLifecycle])

  /** 只替换仍为当前提示的 Toast，隔离迟到的异步结果。 */
  const replaceToast = useCallback((expectedId: number, options: FeedbackToastOptions): number | null => {
    if (activeToastId.current !== expectedId) return null
    return showToast(options)
  }, [showToast])

  /** 显式结束 Toast 并使已排队的旧回调失效。 */
  const dismissToast = useCallback(() => {
    activeToastId.current = null
    toastLifecycle.dismiss()
    setToast(null)
  }, [toastLifecycle])

  /** 替换当前弹窗并保留调用方提供的明确操作。 */
  const showModal = useCallback((options: FeedbackModalOptions) => setModal(options), [])
  /** 关闭当前弹窗。 */
  const dismissModal = useCallback(() => setModal(null), [])

  useEffect(() => () => toastLifecycle.dispose(), [toastLifecycle])

  const context = useMemo(
    () => ({ showToast, replaceToast, dismissToast, showModal, dismissModal }),
    [dismissModal, dismissToast, replaceToast, showModal, showToast],
  )
  const iconByTone = {
    success: CircleCheck,
    error: CircleAlert,
    information: Info,
  } as const
  const iconColorByTone = {
    success: theme.colors.feedback.success,
    error: theme.colors.feedback.error,
    loading: theme.colors.feedback.loading,
    information: theme.colors.feedback.information,
  } as const
  return (
    <FeedbackContext.Provider value={context}>
      {children}
      {modal != null && (
        <Modal
          visible
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={dismissModal}
        >
          <Pressable
            style={{ flex: 1 }}
            onPress={modal.dismissOnBackdrop === false ? undefined : dismissModal}
            accessibilityRole="none"
          >
            <Overlay>
              <Pressable
                onPress={(event) => event.stopPropagation()}
                accessibilityRole="none"
                accessibilityViewIsModal
              >
                <DialogSurface
                  style={[
                    theme.surfaceElevation.overlay,
                    {
                      maxHeight: Math.max(
                        200,
                        height - insets.top - insets.bottom - theme.spacing.xl * 2,
                      ),
                    },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
                    <AppText variant="section" style={{ flex: 1 }}>{modal.title}</AppText>
                    <Pressable
                      onPress={dismissModal}
                      accessibilityRole="button"
                      accessibilityLabel={modal.closeLabel}
                      hitSlop={8}
                      style={{ minWidth: theme.icon.touchTarget, minHeight: theme.icon.touchTarget, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <X size={theme.icon.default} color={theme.colors.text.secondary} />
                    </Pressable>
                  </View>
                  {modal.message != null && (
                    <DialogMessageScroll
                      style={{ maxHeight: Math.max(96, height * 0.5) }}
                      keyboardShouldPersistTaps="handled"
                    >
                      <AppText tone="secondary">{modal.message}</AppText>
                    </DialogMessageScroll>
                  )}
                  <DialogActions>
                    {modal.actions.map((action, index) => (
                      <ActionButton
                        key={`${index}-${action.label}`}
                        label={action.label}
                        secondary={!action.primary}
                        onPress={() => {
                          dismissModal()
                          void action.onPress?.()
                        }}
                      />
                    ))}
                  </DialogActions>
                </DialogSurface>
              </Pressable>
            </Overlay>
          </Pressable>
        </Modal>
      )}
      {toast != null && (() => {
        const Icon = toast.tone === 'loading' ? null : iconByTone[toast.tone]
        return (
          <View
            pointerEvents="box-none"
            style={{ position: 'absolute', top: insets.top + theme.spacing.md, left: theme.spacing.md, right: theme.spacing.md }}
          >
            <ToastSurface
              accessibilityRole={toast.tone === 'error' ? 'alert' : undefined}
              accessibilityState={{ busy: toast.tone === 'loading' }}
              style={theme.surfaceElevation.overlay}
              accessibilityLiveRegion={toast.tone === 'error' ? 'assertive' : 'polite'}
            >
              {toast.tone === 'loading'
                ? (
                    <LoadingIndicator
                      color={iconColorByTone.loading}
                      size={theme.icon.default}
                    />
                  )
                : Icon != null && (
                    <Icon
                      size={theme.icon.default}
                      color={iconColorByTone[toast.tone]}
                      accessible={false}
                    />
                  )}
              <ToastCopy>
                <AppText>{toast.message}</AppText>
              </ToastCopy>
              {toast.dismissible !== false && (
                <Pressable
                  onPress={dismissToast}
                  accessibilityRole="button"
                  accessibilityLabel={sharedMessages.dismiss}
                  hitSlop={8}
                  style={{ minWidth: theme.icon.touchTarget, minHeight: theme.icon.touchTarget, alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={theme.icon.compact} color={theme.colors.text.secondary} />
                </Pressable>
              )}
            </ToastSurface>
          </View>
        )
      })()}
    </FeedbackContext.Provider>
  )
}

/** 获取根反馈主机公开的 Toast 与弹窗控制器。 */
export function useFeedback(): FeedbackContextValue {
  const context = useContext(FeedbackContext)
  if (context == null) {
    throw new Error('useFeedback 必须在 FeedbackHost 内调用。')
  }
  return context
}
