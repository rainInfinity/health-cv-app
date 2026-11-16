/** 指尖独立保留真实脉搏历史，资源与导航使用共用离页屏障。 */
import { useCallback, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { createAcquisitionClient } from '@health-cv-app/acquisition'
import { FINGERTIP_DURATION_MILLIS, prepareFingertipCameraConfig } from '@/app/measurement/fingertipConfig'
import { createFingertipVoicePlayer } from '@/app/measurement/fingertipVoicePlayer'
import { useContactMeasurementSession } from '../ContactMeasurement/useContactMeasurementSession'
import { createFingertipCaptureController } from './fingertipCapture'
import { createFingertipDisplay } from './fingertipPresentation'
import type { FingertipDisplayStatus } from './fingertipPresentation'
import { createFingertipPlacementReminder } from './fingertipPlacementReminder'
import { createFingertipWaveform } from './fingertipWaveform'
import type { FingertipWaveform } from './fingertipWaveform'
import { createFingertipVoice } from './fingertipVoice'
import type { FingertipVoice } from './fingertipVoice'

/** 组装指尖专属声音与真实采集；语音不控制原生计时及页面成功状态。 */
export function useFingertipMeasurement() {
  const [snapshot, setSnapshot] = useState<FingertipDisplayStatus | null>(null)
  const [display] = useState(() => createFingertipDisplay(setSnapshot))
  const [placementGuideVisible, setPlacementGuideVisible] = useState(false)
  const voice = useRef<FingertipVoice | null>(null)
  const [placementReminder] = useState(() => createFingertipPlacementReminder((visible) => {
    setPlacementGuideVisible(visible)
    voice.current?.setHelpVisible(visible)
  }))
  const [waveform, setWaveform] = useState<FingertipWaveform | null>(null)
  const history = useRef<FingertipWaveform | null>(null)
  const cancelRound = useCallback(() => { voice.current?.cancel() }, [])
  const disposeRound = useCallback(() => {
    voice.current?.dispose()
    voice.current = null
    history.current?.dispose()
    history.current = null
  }, [])
  const resetRound = useCallback(() => { disposeRound(); setWaveform(null) }, [disposeRound])
  const createController = useCallback((context: Parameters<Parameters<typeof useContactMeasurementSession>[0]['createController']>[0]) => {
    voice.current?.dispose()
    voice.current = null
    const runtime = createAcquisitionClient()
    return createFingertipCaptureController({
      ...context, client: runtime,
      prepareConfig: () => prepareFingertipCameraConfig(runtime), durationMillis: FINGERTIP_DURATION_MILLIS,
      onCapture(captureId) {
        if (!context.isCurrent()) return
        if (context.isForeground()) voice.current = createFingertipVoice(createFingertipVoicePlayer())
        history.current = createFingertipWaveform(captureId, FINGERTIP_DURATION_MILLIS)
        setWaveform(history.current)
      },
      onSnapshot(value) {
        if (!context.isCurrent()) return
        display.update(value)
        if (AppState.currentState === 'active') {
          voice.current?.update(value)
          placementReminder.update(value)
        }
      },
      onPulse(batch) { if (context.isCurrent()) history.current?.append(batch) },
    })
  }, [display, placementReminder])
  const session = useContactMeasurementSession({ display, placementReminder, createController, resetRound, disposeRound, cancelRound })
  return { ...session, snapshot, display, waveform, placementGuideVisible, dismissPlacementGuide: placementReminder.dismiss }
}

