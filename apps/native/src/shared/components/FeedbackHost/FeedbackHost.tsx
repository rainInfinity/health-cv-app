/** 提供全局单弹窗、单 Toast 队列及其可访问原生呈现。 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { useStore } from '@nanostores/react'
import { useTheme } from 'styled-components/native'

import { FeedbackDialog } from '@/shared/components/FeedbackDialog'
import type { FeedbackModalOptions } from '@/shared/components/FeedbackDialog'
import { LoadingIndicator } from '@/shared/components/LoadingIndicator'
import { feedbackMessages } from '@/app/i18n/feedbackMessages'
import { ToastCopy, ToastOverlay, ToastSurface } from './styles'

import { SingleToastLifecycle } from './toastLifecycle'
import type { FeedbackTone } from './toastLifecycle'
export type { FeedbackTone } from './toastLifecycle'

/** 描述单一 Toast 状态、正文、持续时间和用户关闭能力。 */
export interface FeedbackToastOptions {
  /** 成功、错误、加载或信息状态。 */
  tone: FeedbackTone
  /** 单行或多行反馈正文。 */
  message: string
  /** 自动关闭时间；成功默认1500毫秒，错误和信息默认3500毫秒，加载等待显式结束。 */
  durationMs?: number
  /** 是否允许系统返回关闭；默认普通提示允许、加载提示不允许，不影响外部点击规则。 */
  dismissOnBack?: boolean
  /** 默认使用原生窗口；false 使用隔离触摸的根覆盖层，保留 Android 系统返回。 */
  blocking?: boolean
  /** 是否添加中文状态名前缀；默认显示，检测结果等待仅显示业务正文。 */
  showLabel?: boolean
}

/** 定义供页面使用的单一弹窗和 Toast 操作契约。 */
interface FeedbackContextValue {
  /** 用新 Toast 立即替换旧 Toast，并返回其序号。 */
  showToast: (options: FeedbackToastOptions) => number
  /** 仅在预期 Toast 仍显示时替换它，避免迟到结果覆盖新反馈。 */
  replaceToast: (expectedId: number, options: FeedbackToastOptions) => number | null
  /** 关闭提示；指定序号时仅关闭本操作仍持有的 Toast。 */
  dismissToast: (expectedId?: number) => void
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

/** 普通提示使用原生窗口；长任务覆盖层隔离触摸但不截获系统返回。 */
function ToastLayer({ blocking, onRequestClose, children }: {
  /** 是否使用阻断式原生窗口。 */
  blocking: boolean
  /** 阻断窗口收到用户关闭时的动作。 */
  onRequestClose: () => void
  /** 提示正文。 */
  children: ReactNode
}) {
  if (!blocking) return <View pointerEvents="auto" style={StyleSheet.absoluteFill}>{children}</View>
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onRequestClose}>
      {children}
    </Modal>
  )
}

/** 将弹窗和 Toast 主机置于应用根下，供所有页面共享。 */
export function FeedbackHost({ children }: { children: ReactNode }) {
  const theme = useTheme()
  const sharedMessages = useStore(feedbackMessages)
  const toastLifecycleRef = useRef<SingleToastLifecycle | null>(null)
  if (toastLifecycleRef.current == null) toastLifecycleRef.current = new SingleToastLifecycle()
  const toastLifecycle = toastLifecycleRef.current
  const nextToastId = useRef(0)
  const activeToastId = useRef<number | null>(null)
  const [modal, setModal] = useState<FeedbackModalOptions | null>(null)
  const activeModal = useRef<FeedbackModalOptions | null>(null)
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

  /** 显式结束持有的提示；旧操作清理不得关闭后来替换的反馈。 */
  const dismissToast = useCallback((expectedId?: number) => {
    if (expectedId != null && activeToastId.current !== expectedId) return
    activeToastId.current = null
    toastLifecycle.dismiss()
    setToast(null)
  }, [toastLifecycle])

  /** 系统返回沿用调用方的关闭策略，不结束或取消业务操作。 */
  const dismissToastOnBack = useCallback(() => {
    if (toast != null && (toast.dismissOnBack ?? toast.tone !== 'loading')) dismissToast(toast.id)
  }, [dismissToast, toast])

  /** 所有非加载提示都允许点击外部关闭，不改变正在执行的业务。 */
  const dismissToastOnBackdrop = useCallback(() => {
    if (toast != null && toast.tone !== 'loading') dismissToast(toast.id)
  }, [dismissToast, toast])

  /** 替换当前弹窗并保留调用方提供的明确操作。 */
  const showModal = useCallback((options: FeedbackModalOptions) => {
    activeModal.current = options
    setModal(options)
  }, [])
  /** 程序关闭不等同于用户取消，避免导航收起弹窗时触发返回。 */
  const dismissModal = useCallback(() => {
    activeModal.current = null
    setModal(null)
  }, [])
  /** 只取消一次当前弹窗，并在关闭后执行页面的取消语义。 */
  const cancelModal = useCallback(() => {
    const current = activeModal.current
    if (current == null) return
    dismissModal()
    current.onCancel?.()
  }, [dismissModal])

  useEffect(() => () => toastLifecycle.dispose(), [toastLifecycle])

  const context = useMemo(
    () => ({ showToast, replaceToast, dismissToast, showModal, dismissModal }),
    [dismissModal, dismissToast, replaceToast, showModal, showToast],
  )
  const iconColorByTone = {
    success: theme.colors.feedback.success,
    error: theme.colors.feedback.error,
    information: theme.colors.feedback.information,
  } as const
  return (
    <FeedbackContext.Provider value={context}>
      <View style={{ flex: 1 }} accessibilityElementsHidden={toast != null} importantForAccessibility={toast != null ? 'no-hide-descendants' : 'auto'}>{children}</View>
      {modal != null && (
        <Modal
          visible
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={cancelModal}
        >
          <FeedbackDialog options={modal} onCancel={cancelModal} onAction={(action) => {
            dismissModal()
            void action.onPress?.()
          }} />
        </Modal>
      )}
      {toast != null && (
        <ToastLayer blocking={toast.blocking !== false} onRequestClose={dismissToastOnBack}>
          <ToastOverlay>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={dismissToastOnBackdrop}
              accessible={toast.tone !== 'loading'}
              accessibilityRole="button"
              accessibilityLabel={sharedMessages.dismiss}
            />
            <ToastSurface
              accessibilityViewIsModal={toast.blocking !== false}
              accessibilityRole={toast.tone === 'error' ? 'alert' : undefined}
              accessibilityState={{ busy: toast.tone === 'loading' }}
              style={theme.surfaceElevation.overlay}
              accessibilityLiveRegion={toast.tone === 'error' ? 'assertive' : 'polite'}
              onStartShouldSetResponder={() => true}
            >
              {toast.tone === 'loading' ? (
                <LoadingIndicator size={64} />
              ) : (
                <Svg width={64} height={64} viewBox="0 0 24 24" fill="none" stroke={theme.colors.surface.default} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
                  <Circle cx={12} cy={12} r={10} fill={iconColorByTone[toast.tone]} stroke="none" />
                  {toast.tone === 'success' ? <Path d="m7.5 12 3 3 6-6" />
                    : toast.tone === 'error' ? <Path d="m8.5 8.5 7 7m0-7-7 7" />
                      : <><Circle cx={12} cy={7.5} r={1.2} fill={theme.colors.surface.default} stroke="none" /><Path d="M12 11v6" /></>}
                </Svg>
              )}
              <ToastCopy>{toast.showLabel === false ? toast.message : `${sharedMessages[toast.tone]}：${toast.message}`}</ToastCopy>
            </ToastSurface>
          </ToastOverlay>
        </ToastLayer>
      )}
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
