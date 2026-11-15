/** 页面持有本轮订阅、真实预览和导航屏障；不拥有覆盖门控或截止时钟。 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect, useNavigation, usePreventRemove } from '@react-navigation/native'
import type { NavigationAction } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { createAcquisitionClient } from '@health-cv-app/acquisition'
import { FINGERTIP_DURATION_MILLIS, prepareFingertipCameraConfig } from '@/app/measurement/fingertipConfig'
import { createAcquisitionLeaveGuard } from '@/app/navigation/acquisitionLeaveGuard'
import { registerAcquisitionLeaveRequest } from '@/app/navigation/acquisitionNavigationGuard'
import type { RootStackParamList } from '@/app/navigation/types'
import { createFingertipCaptureController } from './fingertipCapture'
import type { FingertipCaptureController } from './fingertipCapture'
import { createFingertipWaveform } from './fingertipWaveform'
import type { FingertipWaveform } from './fingertipWaveform'
import { createFingertipDisplay } from './fingertipPresentation'
import type { FingertipDisplayStatus } from './fingertipPresentation'
import { createFingertipPlacementReminder } from './fingertipPlacementReminder'

/** 页面只用稳定错误码选择安全中文反馈，不回显原生诊断文本。 */
function getErrorCode(error: unknown): string {
  return error != null && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'UNKNOWN'
}

/** 一个明确导航入口自动准备；后台与重新聚焦都不能自动创建第二轮。 */
export function useFingertipMeasurement() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const [snapshot, setSnapshot] = useState<FingertipDisplayStatus | null>(null)
  const [display] = useState(() => createFingertipDisplay(setSnapshot))
  const [placementGuideVisible, setPlacementGuideVisible] = useState(false)
  const [placementReminder] = useState(() => createFingertipPlacementReminder(setPlacementGuideVisible))
  const [waveform, setWaveform] = useState<FingertipWaveform | null>(null)
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
  const generation = useRef(0)
  const controller = useRef<FingertipCaptureController | null>(null)
  const history = useRef<FingertipWaveform | null>(null)
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
    display.cancelPendingHints()
    setLeaving(true)
    setLocalError(null)
    setCloseFailed(false)
    if (closeBarrier.current == null && controller.current != null) {
      closeBarrier.current = controller.current.close()
      void closeBarrier.current.catch(() => undefined)
    }
    void guard.request(action)
  }, [display, guard])

  usePreventRemove(!allowRemoval, ({ data }) => requestLeave(data.action))
  useEffect(() => {
    if (!allowRemoval) return
    const action = pendingNavigation.current
    pendingNavigation.current = null
    if (typeof action === 'function') action()
    else if (action != null) navigation.dispatch(action)
  }, [allowRemoval, navigation])

  /** 重试总是先完成旧轮关闭，再构造新客户端和空历史，没有暂停续采分支。 */
  const start = useCallback(async () => {
    if (preparing.current || !mounted.current || !focused.current || leaveRequested.current) return
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
      history.current?.dispose()
      history.current = null
      setWaveform(null)
      display.reset()
      setPreviewMounted(false)
      const currentGeneration = ++generation.current
      setPreviewKey(currentGeneration)
      const runtime = createAcquisitionClient()
      const valid = () => mounted.current && focused.current && generation.current === currentGeneration
      const next = createFingertipCaptureController({
        client: runtime,
        prepareConfig: () => prepareFingertipCameraConfig(runtime),
        durationMillis: FINGERTIP_DURATION_MILLIS,
        isForeground: () => valid() && AppState.currentState === 'active',
        mountPreview: () => { if (valid()) setPreviewMounted(true) },
        onPreparationInterrupted: () => {
          if (!valid()) return
          display.cancelPendingHints()
          placementReminder.reset()
          setLocalError('APP_BACKGROUND')
        },
        onCapture: (captureId) => {
          if (!valid()) return
          history.current = createFingertipWaveform(captureId, FINGERTIP_DURATION_MILLIS)
          setWaveform(history.current)
        },
        onSnapshot: (value) => {
          if (!valid()) return
          display.update(value)
          if (!leaveRequested.current && AppState.currentState === 'active') placementReminder.update(value)
        },
        onPulse: (batch) => { if (valid()) history.current?.append(batch) },
      })
      controller.current = next
      await next.prepare()
    } catch (error) {
      if (mounted.current && focused.current && !leaveRequested.current) {
        display.cancelPendingHints()
        placementReminder.reset()
        setLocalError(getErrorCode(error))
      }
    } finally {
      preparing.current = false
      if (mounted.current) setBusy(false)
    }
  }, [closeCurrent, display, placementReminder])

  useFocusEffect(useCallback(() => {
    focused.current = true
    const unregister = registerAcquisitionLeaveRequest(requestLeave)
    if (!started.current) {
      started.current = true
      void start()
    }
    return () => {
      focused.current = false
      display.cancelPendingHints()
      placementReminder.reset()
      unregister()
      // 正常离页已经过 guard；强制失焦仍只收尾本页实例，不再自动准备。
      history.current?.dispose()
      history.current = null
      if (mounted.current) setWaveform(null)
      void closeCurrent().catch(() => undefined)
    }
  }, [closeCurrent, display, placementReminder, requestLeave, start]))

  useEffect(() => {
    mounted.current = true
    const subscription = AppState.addEventListener('change', (state) => {
      const active = state === 'active'
      setVisible(active)
      if (!active) placementReminder.reset()
      if (state === 'background' || active) controller.current?.setForeground(active)
    })
    return () => {
      mounted.current = false
      generation.current += 1
      display.dispose()
      placementReminder.dispose()
      subscription.remove()
      guard.dispose()
      const current = controller.current
      void current?.close().catch(() => undefined)
      current?.dispose()
      history.current?.dispose()
    }
  }, [display, guard, placementReminder])

  /** 关闭失败重试原导航；其他失败在旧轮资源安全后重新建立一次明确入口。 */
  const retry = useCallback(() => {
    if (failedNavigation.current != null) requestLeave(failedNavigation.current)
    else void start()
  }, [requestLeave, start])
  const onPreviewLayout = useCallback(() => {
    if (generation.current === previewKey) controller.current?.previewReady()
  }, [previewKey])
  return { snapshot, display, waveform, previewMounted, previewKey, onPreviewLayout, visible, busy, leaving, localError, closeFailed, retry, placementGuideVisible, dismissPlacementGuide: placementReminder.dismiss }
}
