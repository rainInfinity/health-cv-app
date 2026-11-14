/** 编排显式授权、原生预览布局、真实会话及根栈离页资源屏障。 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, Platform } from 'react-native'
import type { LayoutChangeEvent } from 'react-native'
import { useFocusEffect, useNavigation, usePreventRemove } from '@react-navigation/native'
import type { NavigationAction } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { createRPPGClient } from '@health-cv-app/acquisition'
import type { RPPGClient, RPPGSnapshot } from '@health-cv-app/acquisition'
import { createAcquisitionLeaveGuard } from '@/app/navigation/acquisitionLeaveGuard'
import { registerRPPGLeaveRequest } from '@/app/navigation/rppgNavigationGuard'
import type { RootStackParamList } from '@/app/navigation/types'
import { accumulateRPPGHeartRateSnapshot, createEmptyRPPGHeartRateSummary } from '@/app/rppg/rppgHeartRateSummary'
import { appendRPPGWaveformHistory, createRPPGWaveformHistory } from '@/app/rppg/rppgWaveform'
import type { RPPGWaveformHistory } from '@/app/rppg/rppgWaveform'

/** 创建不包含设备副作用的初始快照。 */
function emptySnapshot(): RPPGSnapshot {
  return {
    phase: 'closed', sessionId: null, faceReady: false, readinessReason: null,
    readinessContinuousNanos: '0', measurementStartedAtElapsedNanos: null,
    targetMeasurementDurationNanos: '30000000000', latestHeartRate: null,
    latestInstantHeartRate: null, signalStatus: null, termination: null,
    artifact: null, error: null,
  }
}

/** 只读取错误码；原生异常消息不进入产品文案。 */
function errorCode(error: unknown): string {
  return error != null && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code : 'UNKNOWN'
}

/** 保留本页 runtime 所有权；已关闭客户端不再用于新一轮检测。 */
export function useFaceMeasurement() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const [snapshot, setSnapshot] = useState(emptySnapshot)
  const [summary, setSummary] = useState(createEmptyRPPGHeartRateSummary)
  const waveformHistory = useRef<RPPGWaveformHistory | null>(null)
  if (waveformHistory.current == null) waveformHistory.current = createRPPGWaveformHistory()
  const [, setWaveformRevision] = useState(0)
  const [elapsedMillis, setElapsedMillis] = useState(0)
  const [previewMounted, setPreviewMounted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pendingAction, setPendingAction] = useState<'start' | 'stop' | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [runtimePresent, setRuntimePresent] = useState(false)
  const [allowRemoval, setAllowRemoval] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [closeFailed, setCloseFailed] = useState(false)
  const mounted = useRef(true)
  const client = useRef<RPPGClient | null>(null)
  const generation = useRef(0)
  const pendingCommand = useRef<Promise<void> | null>(null)
  const detachSubscriptions = useRef<(() => void) | null>(null)
  const pendingNavigation = useRef<NavigationAction | (() => void) | null>(null)
  const cancelStart = useRef(false)
  const previewReady = useRef(false)
  const previewWaiter = useRef<{ resolve(): void } | null>(null)
  const clockOrigin = useRef<number | null>(null)
  const frozenElapsed = useRef(0)
  const backgrounded = useRef(false)

  /** 页面计时只由 measuring 通知启动，绝不与原生绝对纳秒相减。 */
  const freezeClock = useCallback(() => {
    if (clockOrigin.current != null) {
      frozenElapsed.current = Math.max(frozenElapsed.current, performance.now() - clockOrigin.current)
      clockOrigin.current = null
      if (mounted.current) setElapsedMillis(frozenElapsed.current)
    }
  }, [])

  /** 只接纳当前代次的回调，关闭后的空快照不擦除已经冻结的会话摘要。 */
  const attachClient = useCallback((runtime: RPPGClient, currentGeneration: number) => {
    const update = (next: RPPGSnapshot) => {
      if (!mounted.current || generation.current !== currentGeneration || client.current !== runtime) return
      if (next.phase === 'measuring' && !backgrounded.current) {
        if (clockOrigin.current == null) clockOrigin.current = performance.now() - frozenElapsed.current
      } else {
        freezeClock()
      }
      setSnapshot(next)
      if (next.sessionId != null) {
        setSummary((previous) => accumulateRPPGHeartRateSnapshot(previous, next))
      }
    }
    const unsubscribe = runtime.subscribe(update)
    const unsubscribeRealtime = runtime.subscribeRealtime((batch) => {
      if (!mounted.current || generation.current !== currentGeneration || client.current !== runtime) return
      const current = runtime.getSnapshot()
      if (current.sessionId !== batch.sessionId || (current.phase !== 'measuring' && current.phase !== 'stopping')) return
      if (appendRPPGWaveformHistory(waveformHistory.current!, batch)) {
        setWaveformRevision((revision) => revision + 1)
      }
    })
    detachSubscriptions.current = () => {
      unsubscribe()
      unsubscribeRealtime()
    }
    update(runtime.getSnapshot())
  }, [freezeClock])

  /** close 等待相机与文件屏障；成功后丢弃 runtime，但保留已就绪的无采集预览 host。 */
  const closeRuntime = useCallback(async () => {
    const runtime = client.current
    if (runtime == null) return
    await runtime.close()
    if (client.current !== runtime) return
    detachSubscriptions.current?.()
    detachSubscriptions.current = null
    client.current = null
    // 预览 host 可供下一次全新 runtime 使用，避免 React 批处理吞掉重复挂载的布局通知。
    if (mounted.current) {
      setRuntimePresent(false)
    }
  }, [])

  const leaveGuard = useMemo(() => createAcquisitionLeaveGuard<NavigationAction | (() => void)>({
    waitForCameraCommand: async () => {
      if (pendingCommand.current != null) await pendingCommand.current
    },
    getSessionGeneration: () => generation.current,
    isCameraActive: () => client.current != null,
    closeCamera: closeRuntime,
    onReady: (action) => {
      if (!mounted.current) return
      pendingNavigation.current = action
      setAllowRemoval(true)
    },
    onFailure: (error) => {
      if (!mounted.current) return
      setLocalError(errorCode(error))
      setCloseFailed(true)
      setLeaving(false)
    },
  }), [closeRuntime])

  /** 导航意图使尚未开始的启动流程失效，但不抢断已发出的原生命令。 */
  const requestLeave = useCallback((action: NavigationAction | (() => void)) => {
    cancelStart.current = true
    previewWaiter.current?.resolve()
    previewWaiter.current = null
    setLeaving(true)
    setLocalError(null)
    setCloseFailed(false)
    void leaveGuard.request(action)
  }, [leaveGuard])

  usePreventRemove(!allowRemoval && (runtimePresent || busy || leaving), ({ data }) => {
    requestLeave(data.action)
  })

  useEffect(() => {
    if (!allowRemoval) return
    const action = pendingNavigation.current
    pendingNavigation.current = null
    if (typeof action === 'function') action()
    else if (action != null) navigation.dispatch(action)
  }, [allowRemoval, navigation])

  useFocusEffect(useCallback(() => {
    const unregister = registerRPPGLeaveRequest(requestLeave)
    return () => {
      unregister()
      detachSubscriptions.current?.()
      detachSubscriptions.current = null
      freezeClock()
      waveformHistory.current = createRPPGWaveformHistory()
      if (mounted.current) setWaveformRevision((revision) => revision + 1)
      // 正常离页已先经过 guard；此处只兜底外部强制失焦，不触碰其他采集所有者。
      void closeRuntime().then(() => {
        previewReady.current = false
        if (mounted.current) setPreviewMounted(false)
      }).catch((error: unknown) => {
        if (mounted.current) {
          setLocalError(errorCode(error))
          setCloseFailed(true)
        }
      })
    }
  }, [closeRuntime, freezeClock, requestLeave]))

  useEffect(() => {
    mounted.current = true
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'background') return
      backgrounded.current = true
      freezeClock()
      // 原生宿主生命周期负责 APP_BACKGROUND 收尾；JS 不用 stop() 冒充用户提前结束。
      previewWaiter.current?.resolve()
      previewWaiter.current = null
    })
    return () => {
      mounted.current = false
      generation.current += 1
      cancelStart.current = true
      previewWaiter.current?.resolve()
      previewWaiter.current = null
      subscription.remove()
      leaveGuard.dispose()
      detachSubscriptions.current?.()
      detachSubscriptions.current = null
      waveformHistory.current = createRPPGWaveformHistory()
      const pending = pendingCommand.current
      void (async () => {
        try { await pending } catch { /* 命令失败仍须尝试关闭本页 runtime。 */ }
        await closeRuntime()
      })().catch(() => undefined)
    }
  }, [closeRuntime, freezeClock, leaveGuard])

  useEffect(() => {
    if (snapshot.phase !== 'measuring') return
    const timer = setInterval(() => {
      if (clockOrigin.current != null) {
        setElapsedMillis(Math.max(frozenElapsed.current, performance.now() - clockOrigin.current))
      }
    }, 200)
    return () => clearInterval(timer)
  }, [snapshot.phase])

  /** 包装层同时确认真实 HybridView 与正尺寸布局，不猜测 Surface 首帧。 */
  const onPreviewLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    if (width <= 0 || height <= 0) return
    previewReady.current = true
    previewWaiter.current?.resolve()
    previewWaiter.current = null
  }, [])

  /** 串行执行一个用户命令，保留可供离页屏障等待的同一 Promise。 */
  function run(command: () => Promise<void>, action: 'start' | 'stop' = 'start') {
    if (pendingCommand.current != null || leaving) return
    setBusy(true)
    setPendingAction(action)
    setLocalError(null)
    setCloseFailed(false)
    const operation = Promise.resolve().then(command).catch((error: unknown) => {
      if (mounted.current) setLocalError(errorCode(error))
      throw error
    }).finally(() => {
      if (pendingCommand.current === operation) pendingCommand.current = null
      if (mounted.current) {
        setBusy(false)
        setPendingAction(null)
      }
    })
    pendingCommand.current = operation
    void operation.catch(() => undefined)
  }

  /** 每次明确重测立即清空展示；仅模型加载失败保留的 preview 可继续 start。 */
  function start() {
    if (pendingCommand.current != null || leaving) return
    generation.current += 1
    const currentGeneration = generation.current
    cancelStart.current = false
    backgrounded.current = false
    detachSubscriptions.current?.()
    detachSubscriptions.current = null
    clockOrigin.current = null
    frozenElapsed.current = 0
    setElapsedMillis(0)
    waveformHistory.current = createRPPGWaveformHistory()
    setWaveformRevision((revision) => revision + 1)
    setSummary(createEmptyRPPGHeartRateSummary())
    setSnapshot(emptySnapshot())
    run(async () => {
      if (Platform.OS !== 'android') throw { code: 'PLATFORM_UNSUPPORTED' }
      let runtime = client.current
      if (runtime != null && runtime.getSnapshot().phase !== 'preview') {
        await closeRuntime()
        runtime = null
      }
      if (cancelStart.current || !mounted.current) return
      if (runtime == null) {
        runtime = createRPPGClient()
        client.current = runtime
        setRuntimePresent(true)
      }
      attachClient(runtime, currentGeneration)
      await runtime.requestCameraPermission()
      if (cancelStart.current || !mounted.current) return
      if (AppState.currentState !== 'active') throw { code: 'APP_BACKGROUND' }
      // 授权弹窗可能短暂触发后台；回到前台后继续本次启动，后续后台仍由原屏障中断。
      backgrounded.current = false
      if (!previewReady.current) {
        // 保持 Android Hermes 与 ES2022 目标兼容；门闩由真实实例和布局双信号释放。
        const ready = new Promise<void>((resolve) => {
          previewWaiter.current = { resolve }
        })
        setPreviewMounted(true)
        await ready
      }
      if (cancelStart.current || !mounted.current) return
      if (AppState.currentState !== 'active' || backgrounded.current) throw { code: 'APP_BACKGROUND' }
      if (runtime.getSnapshot().phase !== 'preview') await runtime.openPreview()
      if (cancelStart.current || !mounted.current) return
      if (AppState.currentState !== 'active' || backgrounded.current) throw { code: 'APP_BACKGROUND' }
      await runtime.start()
    })
  }

  /** 用户提前结束使用原生 stop，其完成 Promise 包含真实文件收尾。 */
  function stop() {
    run(async () => {
      if (client.current != null) await client.current.stop()
    }, 'stop')
  }

  return {
    snapshot, waveformHistory: waveformHistory.current, waveformKey: generation.current, summary, elapsedMillis, previewMounted, onPreviewLayout,
    busy: busy || leaving || snapshot.phase === 'stopping', leaving, pendingAction, localError, closeFailed,
    start, stop,
  }
}
