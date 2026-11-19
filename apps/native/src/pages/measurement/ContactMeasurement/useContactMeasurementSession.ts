/** 页面持有本轮订阅、真实预览和导航屏障；不拥有覆盖门控或截止时钟。 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect, useNavigation, usePreventRemove } from '@react-navigation/native'
import type { NavigationAction } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { createAcquisitionLeaveGuard } from '@/app/navigation/acquisitionLeaveGuard'
import { registerAcquisitionLeaveRequest } from '@/app/navigation/acquisitionNavigationGuard'
import type { RootStackParamList } from '@/app/navigation/types'
import type { FingertipCaptureController } from '../FingertipMeasurement/fingertipCapture'

/** 指尖可显式保留已释放资源的同轮详情展示；其他方式不提供此能力。 */
interface ContactPresentationLifecycle {
  /** 真正离开、失败或重测时同步撤销展示资格和迟到回调。 */
  cancel(): void
  /** 页面卸载时永久释放展示生命周期，不再通知页面。 */
  dispose(): void
  /** 用前台与导航焦点的共同可见性暂停或继续展示等待。 */
  setVisible(visible: boolean): void
  /** 消费一次明确同轮详情交接；未匹配目标必须沿用普通失焦清理。 */
  retainOnBlur(route: { name: string; params?: unknown } | undefined): boolean
  /** 保留路径重新聚焦时恢复同轮结果，不重新准备设备。 */
  resume(): void
}

interface ContactSessionOptions {
  /** 只管理展示投影，不持有设备。 */
  display: { reset(): void; cancelPendingHints(): void; dispose(): void }
  /** 方式专属提醒，仅由原生观测事实触发。 */
  placementReminder: { reset(): void; dispose(): void }
  /** 具体方案提供自己的命令适配，不把血压状态混入指尖。 */
  createController(context: { isCurrent(): boolean; isForeground(): boolean; mountPreview(): void; onPreparationInterrupted(): void }): FingertipCaptureController
  /** 清空或释放方案自己的局部历史。 */
  resetRound?(): void
  disposeRound?(): void
  /** 立即撤销方式专属副作用，不等待相机关闭屏障；未提供时不创建额外能力。 */
  cancelRound?(): void
  /** 仅指尖结果显式启用同轮详情保留；未提供时沿用既有离页清理。 */
  presentationLifecycle?: ContactPresentationLifecycle
}

/** 页面只用稳定错误码选择安全中文反馈，不回显原生诊断文本。 */
function getErrorCode(error: unknown): string {
  return error != null && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'UNKNOWN'
}

/** 一个明确导航入口自动准备；后台与重新聚焦都不能自动创建第二轮。 */
export function useContactMeasurementSession({ display, placementReminder, createController, resetRound, disposeRound, cancelRound, presentationLifecycle }: ContactSessionOptions) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const [previewMounted, setPreviewMounted] = useState(false)
  const [previewKey, setPreviewKey] = useState(0)
  const [busy, setBusy] = useState(true)
  const [leaving, setLeaving] = useState(false)
  const [allowRemoval, setAllowRemoval] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [closeFailed, setCloseFailed] = useState(false)
  const [visible, setVisible] = useState(AppState.currentState === 'active')
  const mounted = useRef(true)
  const focused = useRef(false)
  const started = useRef(false)
  const retainedPresentation = useRef(false)
  const generation = useRef(0)
  const controller = useRef<FingertipCaptureController | null>(null)
  const preparing = useRef(false)
  const closeBarrier = useRef<Promise<void> | null>(null)
  const leaveRequested = useRef(false)
  const pendingNavigation = useRef<NavigationAction | (() => void) | null>(null)
  const failedNavigation = useRef<NavigationAction | (() => void) | null>(null)

  /** 只关闭当前页所有者；失败保留同一实例，供明确再关闭。 */
  const closeCurrent = useCallback(async () => {
    placementReminder.reset()
    const barrier = closeBarrier.current ?? controller.current?.close()
    if (barrier == null) return
    closeBarrier.current = barrier
    try { await barrier } finally { if (closeBarrier.current === barrier) closeBarrier.current = null }
  }, [placementReminder])

  const guard = useMemo(() => createAcquisitionLeaveGuard<NavigationAction | (() => void)>({
    waitForCameraCommand: async () => {
      const barrier = closeBarrier.current
      if (barrier == null) return
      try { await barrier } catch (error) {
        if (closeBarrier.current === barrier) closeBarrier.current = null
        throw error
      }
    },
    getSessionGeneration: () => generation.current,
    isCameraActive: () => controller.current != null,
    closeCamera: closeCurrent,
    onReady: (action) => {
      if (!mounted.current) return
      pendingNavigation.current = action
      failedNavigation.current = null
      setAllowRemoval(true)
    },
    onFailure: (error) => {
      if (!mounted.current) return
      display.cancelPendingHints()
      setLocalError(getErrorCode(error))
      setCloseFailed(true)
      setLeaving(false)
    },
  }), [closeCurrent, display])

  /** 先同步登记关闭意图，使稍后返回的授权或布局不能发出设备命令。 */
  const requestLeave = useCallback((action: NavigationAction | (() => void)) => {
    failedNavigation.current = action
    leaveRequested.current = true
    presentationLifecycle?.cancel()
    retainedPresentation.current = false
    cancelRound?.()
    display.cancelPendingHints()
    setLeaving(true)
    setLocalError(null)
    setCloseFailed(false)
    if (closeBarrier.current == null && controller.current != null) {
      closeBarrier.current = controller.current.close()
      void closeBarrier.current.catch(() => undefined)
    }
    void guard.request(action)
  }, [cancelRound, display, guard, presentationLifecycle])

  usePreventRemove(!allowRemoval, ({ data }) => requestLeave(data.action))
  useEffect(() => {
    if (!allowRemoval) return
    const action = pendingNavigation.current
    pendingNavigation.current = null
    if (typeof action === 'function') action()
    else if (action != null) navigation.dispatch(action)
  }, [allowRemoval, navigation])

  /** 重试总是先完成旧轮关闭，再构造新客户端和本轮展示，没有暂停续采分支。 */
  const start = useCallback(async () => {
    if (preparing.current || !mounted.current || !focused.current || leaveRequested.current) return
    presentationLifecycle?.cancel()
    retainedPresentation.current = false
    cancelRound?.()
    display.cancelPendingHints()
    placementReminder.reset()
    preparing.current = true
    setBusy(true)
    setLocalError(null)
    setCloseFailed(false)
    try {
      try { await closeCurrent() } catch (error) {
        if (mounted.current) setCloseFailed(true)
        throw error
      }
      if (!mounted.current || !focused.current || leaveRequested.current) return
      controller.current?.dispose()
      resetRound?.()
      display.reset()
      setPreviewMounted(false)
      const currentGeneration = ++generation.current
      setPreviewKey(currentGeneration)
      const valid = () => mounted.current && focused.current && !leaveRequested.current && generation.current === currentGeneration
      const next = createController({
        isCurrent: valid,
        isForeground: () => valid() && AppState.currentState === 'active',
        mountPreview: () => { if (valid()) setPreviewMounted(true) },
        onPreparationInterrupted: () => {
          if (!valid()) return
          presentationLifecycle?.cancel()
          cancelRound?.()
          display.cancelPendingHints()
          placementReminder.reset()
          setLocalError('APP_BACKGROUND')
        },
      })
      controller.current = next
      await next.prepare()
    } catch (error) {
      if (mounted.current && focused.current && !leaveRequested.current) {
        presentationLifecycle?.cancel()
        cancelRound?.()
        display.cancelPendingHints()
        placementReminder.reset()
        setLocalError(getErrorCode(error))
      }
    } finally {
      preparing.current = false
      if (mounted.current) setBusy(false)
    }
  }, [cancelRound, closeCurrent, createController, display, placementReminder, presentationLifecycle, resetRound])

  useFocusEffect(useCallback(() => {
    focused.current = true
    setVisible(AppState.currentState === 'active')
    presentationLifecycle?.setVisible(AppState.currentState === 'active')
    if (retainedPresentation.current) {
      retainedPresentation.current = false
      presentationLifecycle?.resume()
    }
    const unregister = registerAcquisitionLeaveRequest(requestLeave)
    if (!started.current) {
      started.current = true
      void start()
    }
    return () => {
      focused.current = false
      cancelRound?.()
      presentationLifecycle?.setVisible(false)
      if (mounted.current) setVisible(false)
      display.cancelPendingHints()
      placementReminder.reset()
      unregister()
      const state = navigation.getState()
      if (!leaveRequested.current && presentationLifecycle?.retainOnBlur(state.routes[state.index])) {
        retainedPresentation.current = true
        // 设备已由正常完成屏障释放；仅注销旧轮订阅，不销毁本轮真实历史。
        controller.current?.dispose()
        return
      }
      presentationLifecycle?.cancel()
      // 正常离页已经过 guard；强制失焦仍只收尾本页实例，不再自动准备。
      disposeRound?.()
      void closeCurrent().catch(() => undefined)
    }
  }, [cancelRound, closeCurrent, display, disposeRound, navigation, placementReminder, presentationLifecycle, requestLeave, start]))

  useEffect(() => {
    mounted.current = true
    const subscription = AppState.addEventListener('change', (state) => {
      const active = state === 'active'
      setVisible(active && focused.current)
      presentationLifecycle?.setVisible(active && focused.current)
      if (!active) cancelRound?.()
      if (!active) placementReminder.reset()
      if (state === 'background' || active) controller.current?.setForeground(active)
    })
    return () => {
      mounted.current = false
      generation.current += 1
      presentationLifecycle?.dispose()
      cancelRound?.()
      display.dispose()
      placementReminder.dispose()
      subscription.remove()
      guard.dispose()
      const current = controller.current
      void current?.close().catch(() => undefined)
      current?.dispose()
      disposeRound?.()
    }
  }, [cancelRound, display, disposeRound, guard, placementReminder, presentationLifecycle])

  /** 关闭失败重试原导航；其他失败在旧轮资源安全后重新建立一次明确入口。 */
  const retry = useCallback(() => {
    if (failedNavigation.current != null) requestLeave(failedNavigation.current)
    else void start()
  }, [requestLeave, start])
  const onPreviewLayout = useCallback(() => {
    if (generation.current === previewKey) controller.current?.previewReady()
  }, [previewKey])
  return { previewMounted, previewKey, onPreviewLayout, visible, busy, leaving, localError, closeFailed, retry }
}
