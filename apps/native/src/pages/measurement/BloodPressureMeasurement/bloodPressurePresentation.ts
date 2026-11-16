/** 血压只投影本轮阶段、覆盖与原生剩余量；不消费 IMU 参数或波形。 */
import type { BloodPressurePhase } from '@health-cv-app/acquisition'
import { createContactDisplay } from '../ContactMeasurement/contactPresentation'
import type { ContactDisplayStatus, ContactObservation } from '../ContactMeasurement/contactPresentation'
import { getFingertipPresentation } from '../FingertipMeasurement/fingertipPresentation'

export type BloodPressureDisplayStatus = ContactDisplayStatus<BloodPressurePhase>

export function createBloodPressureDisplay(onStatus: (status: BloodPressureDisplayStatus | null) => void) {
  return createContactDisplay<BloodPressurePhase>(onStatus, (value: ContactObservation<BloodPressurePhase>) => {
    if (value.phase === 'awaiting_chest' || value.phase === 'starting') return 'covered'
    return getFingertipPresentation({ ...value, phase: value.phase === 'observing_finger' ? 'observing' : value.phase })
  }, 'observing_finger')
}
