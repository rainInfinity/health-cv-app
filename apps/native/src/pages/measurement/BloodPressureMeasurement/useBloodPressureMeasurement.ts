/** 血压使用独立联合 API；只消费低频事实，不接收或生成任何波形。 */
import { useCallback, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { createAcquisitionClient } from '@health-cv-app/acquisition'
import { createBloodPressureCaptureController } from '@/app/measurement/bloodPressureCapture'
import { chestPlacementGuideSkipped } from '@/app/preferences'
import { FINGERTIP_DURATION_MILLIS, prepareFingertipCameraConfig } from '@/app/measurement/fingertipConfig'
import { createMeasurementVoicePlayer } from '@/app/measurement/measurementVoicePlayer'
import { bloodPressureVoiceResources } from '@/app/measurement/bloodPressureVoiceResources'
import { useContactMeasurementSession } from '../ContactMeasurement/useContactMeasurementSession'
import { createBloodPressureDisplay } from './bloodPressurePresentation'
import type { BloodPressureDisplayStatus } from './bloodPressurePresentation'
import { createBloodPressurePlacementReminder } from './bloodPressurePlacementReminder'
import { createBloodPressureVoice } from './bloodPressureVoice'
import type { BloodPressureVoice } from './bloodPressureVoice'
import { createBloodPressureChestGuide } from './bloodPressureChestGuide'

/** 取消锁独立于播放器，首条快照之前取消也不能在回前台后懒建旧轮语音。 */
interface VoiceRound {
  /** 首条有效快照绑定后创建，准备期为空。 */
  voice: BloodPressureVoice | null
  /** 本轮身份；未开始观测时为空，不接受其他轮次。 */
  captureId: string | null
  /** 取消后永久禁止本轮懒建或恢复声音。 */
  cancelled: boolean
  /** 仅用于区分系统授权弹窗与真正的页面取消。 */
  permissionPending: boolean
  /** 判断本轮入口仍挂载、聚焦且未请求离开。 */
  isCurrent(): boolean
}

/** 血压没有页面外历史缓存；轮次投影和提醒由共用生命周期释放。 */
export function useBloodPressureMeasurement() {
  const [snapshot, setSnapshot] = useState<BloodPressureDisplayStatus | null>(null)
  const [display] = useState(() => createBloodPressureDisplay(setSnapshot))
  const [placementGuideVisible, setPlacementGuideVisible] = useState(false)
  const [chestGuideVisible, setChestGuideVisible] = useState(false)
  const [chestGuideStorageError, setChestGuideStorageError] = useState(false)
  const [chestGuide] = useState(() => createBloodPressureChestGuide((visible) => {
    setChestGuideVisible(visible)
    setChestGuideStorageError(false)
  }, () => chestPlacementGuideSkipped.get()))
  const voiceRound = useRef<VoiceRound | null>(null)
  const [placementReminder] = useState(() => createBloodPressurePlacementReminder((visible) => {
    setPlacementGuideVisible(visible)
    voiceRound.current?.voice?.setHelpVisible(visible)
  }))
  const cancelRound = useCallback(() => {
    const round = voiceRound.current
    // 权限弹窗未建立语音，且入口仍有效时，沿用控制器既有的授权后继续语义。
    if (round != null && round.voice == null && round.captureId == null && round.permissionPending && round.isCurrent()) return
    chestGuide.cancel()
    if (round == null) return
    round.cancelled = true
    // 永久取消需释放播放器，避免 Expo Audio 前台恢复已暂停的旧录音。
    round.voice?.dispose()
  }, [chestGuide])
  const disposeRound = useCallback(() => {
    chestGuide.cancel()
    const round = voiceRound.current
    if (round == null) return
    round.cancelled = true
    round.voice?.dispose()
    voiceRound.current = null
  }, [chestGuide])
  const createController = useCallback((context: Parameters<Parameters<typeof useContactMeasurementSession>[0]['createController']>[0]) => {
    disposeRound()
    chestGuide.reset()
    const round: VoiceRound = {
      voice: null, captureId: null, cancelled: false, permissionPending: false,
      isCurrent: context.isCurrent,
    }
    voiceRound.current = round
    const runtime = createAcquisitionClient()
    return createBloodPressureCaptureController({
      ...context,
      client: {
        async requestCameraPermission() {
          round.permissionPending = true
          try { return await runtime.requestCameraPermission() } finally { round.permissionPending = false }
        },
        openCamera: (config) => runtime.openCamera(config),
        startBloodPressureCapture: (config) => runtime.startBloodPressureCapture(config),
        closeCamera: () => runtime.closeCamera(),
        getBloodPressureSnapshot: () => runtime.getBloodPressureSnapshot(),
        subscribeBloodPressure: (listener) => runtime.subscribeBloodPressure(listener),
      },
      prepareConfig: () => prepareFingertipCameraConfig(runtime), durationMillis: FINGERTIP_DURATION_MILLIS,
      onSnapshot(value) {
        if (!context.isCurrent()) return
        display.update(value)
        if (context.isForeground() && AppState.currentState === 'active') {
          if (voiceRound.current === round && !round.cancelled) {
            if (round.captureId == null) {
              round.captureId = value.captureId
              round.voice = createBloodPressureVoice(createMeasurementVoicePlayer(bloodPressureVoiceResources))
            }
            if (round.captureId === value.captureId) round.voice?.update(value)
          }
          // 先消费真实阶段，再通知帮助可见性，避免旧阶段帮助抢先发声。
          placementReminder.update(value)
          chestGuide.update(value)
        }
      },
    })
  }, [chestGuide, display, disposeRound, placementReminder])
  const session = useContactMeasurementSession({
    display, placementReminder, createController, cancelRound, resetRound: disposeRound, disposeRound,
  })
  const confirmChestGuide = useCallback((skip: boolean) => {
    try {
      if (skip) chestPlacementGuideSkipped.set(true)
      chestGuide.dismiss()
    } catch {
      setChestGuideStorageError(true)
    }
  }, [chestGuide])
  return {
    ...session, snapshot, display, placementGuideVisible, dismissPlacementGuide: placementReminder.dismiss,
    chestGuideVisible, chestGuideStorageError, confirmChestGuide,
  }
}
