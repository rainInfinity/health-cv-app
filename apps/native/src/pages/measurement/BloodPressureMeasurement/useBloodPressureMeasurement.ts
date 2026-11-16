/** 血压使用独立联合 API；只消费低频事实，不接收或生成任何波形。 */
import { useCallback, useState } from 'react'
import { AppState } from 'react-native'
import { createAcquisitionClient } from '@health-cv-app/acquisition'
import { createBloodPressureCaptureController } from '@/app/measurement/bloodPressureCapture'
import { FINGERTIP_DURATION_MILLIS, prepareFingertipCameraConfig } from '@/app/measurement/fingertipConfig'
import { useContactMeasurementSession } from '../ContactMeasurement/useContactMeasurementSession'
import { createBloodPressureDisplay } from './bloodPressurePresentation'
import type { BloodPressureDisplayStatus } from './bloodPressurePresentation'
import { createBloodPressurePlacementReminder } from './bloodPressurePlacementReminder'

/** 血压没有页面外历史缓存；轮次投影和提醒由共用生命周期释放。 */
export function useBloodPressureMeasurement() {
  const [snapshot, setSnapshot] = useState<BloodPressureDisplayStatus | null>(null)
  const [display] = useState(() => createBloodPressureDisplay(setSnapshot))
  const [placementGuideVisible, setPlacementGuideVisible] = useState(false)
  const [placementReminder] = useState(() => createBloodPressurePlacementReminder(setPlacementGuideVisible))
  const createController = useCallback((context: Parameters<Parameters<typeof useContactMeasurementSession>[0]['createController']>[0]) => {
    const runtime = createAcquisitionClient()
    return createBloodPressureCaptureController({
      ...context, client: runtime,
      prepareConfig: () => prepareFingertipCameraConfig(runtime), durationMillis: FINGERTIP_DURATION_MILLIS,
      onSnapshot(value) {
        if (!context.isCurrent()) return
        display.update(value)
        if (AppState.currentState === 'active') placementReminder.update(value)
      },
    })
  }, [display, placementReminder])
  const session = useContactMeasurementSession({ display, placementReminder, createController })
  return { ...session, snapshot, display, placementGuideVisible, dismissPlacementGuide: placementReminder.dismiss }
}
