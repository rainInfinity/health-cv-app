/** 真实云端状态驱动每轮一次展开；不使用展示计时推断检测成功。 */
import type { Rsp } from '@health-cv-app/cloud-client'
import type { FingertipSnapshot, BloodPressureSnapshot } from '@health-cv-app/acquisition'
import { createCloudMeasurementWorkflow, emptyCloudMeasurementState } from '../../../app/measurement/cloudWorkflow'
import type { CloudMeasurementState, CloudWorkflowOptions } from '../../../app/measurement/cloudWorkflow'
import type { ContactMethod } from '../../../app/measurement/cloudPlan'
import { adaptMeasurementResult } from '../../../app/measurement/resultAdapter'
import type { MeasurementReport } from '../../../app/measurement/resultAdapter'

export interface ContactResultState {
  phase: 'idle' | 'waiting' | 'available' | 'error'
  /** 仅成功或部分成功可进入详情，其他结果在当前弹层处理。 */
  failure: 'detection' | 'query' | 'creation' | null
  captureId: string | null
  taskId: number | null
  expanded: boolean
  cloud: CloudMeasurementState
  report: MeasurementReport | null
}
export const emptyContactResultState = (): ContactResultState => ({
  phase: 'idle', failure: null, captureId: null, taskId: null, expanded: false,
  cloud: emptyCloudMeasurementState(), report: null,
})

export function createContactResultsLifecycle(
  detailTarget: 'FingertipResults' | 'BloodPressureResults',
  onChange: (state: ContactResultState) => void,
  dependencies: Omit<CloudWorkflowOptions, 'onChange'> | null,
) {
  let state = emptyContactResultState()
  let visible = false
  let disposed = false
  let detailRequested = false
  let autoExpanded = false
  const publish = (next: ContactResultState) => { state = next; if (!disposed) onChange(next) }
  const workflow = dependencies ? createCloudMeasurementWorkflow({
    ...dependencies,
    onChange(cloud) {
      const report = cloud.task ? adaptMeasurementResult(cloud.task) : null
      const terminal = cloud.phase === 'terminal'
      const ready = terminal || cloud.phase === 'error'
      const failure = cloud.failure ?? (terminal && (report?.state === 'all_failed' || report?.state === 'task_failed') ? 'detection' : null)
      const expand = ready && visible && !autoExpanded
      if (expand) autoExpanded = true
      publish({
        phase: cloud.phase === 'idle' ? 'idle' : terminal ? 'available' : cloud.phase === 'error' ? 'error' : 'waiting',
        failure, captureId: cloud.captureId, taskId: cloud.taskId,
        cloud, report,
        expanded: ready && (state.expanded || expand),
      })
    },
  }) : null
  function cancel() {
    detailRequested = false; autoExpanded = false
    workflow?.cancel()
    publish(emptyContactResultState())
  }
  return {
    getSnapshot: () => state,
    begin(captureId: string, method: ContactMethod, model: Rsp.Models.AvailableModel, generation: number) {
      if (disposed) return
      cancel()
      workflow?.begin(captureId, method, model, generation)
    },
    update(snapshot: FingertipSnapshot | BloodPressureSnapshot) { workflow?.update(snapshot) },
    setVisible(next: boolean) {
      if (disposed) return
      visible = next
      workflow?.setVisible(next)
      if (next && (state.phase === 'available' || state.phase === 'error') && !autoExpanded) {
        autoExpanded = true; publish({ ...state, expanded: true })
      }
    },
    openResults() { if (state.phase === 'available' || state.phase === 'error') publish({ ...state, expanded: true }) },
    closeResults() { if (state.phase === 'available' || state.phase === 'error') publish({ ...state, expanded: false }) },
    enterDetails(): { captureId: string; taskId: number } | null {
      if (disposed || !visible || state.phase !== 'available' || state.failure || !state.report?.hasValidMembers || !state.captureId || state.taskId == null) return null
      detailRequested = true
      return { captureId: state.captureId, taskId: state.taskId }
    },
    retainOnBlur(route: { name: string; params?: unknown } | undefined) {
      const params = route?.params
      const matched = detailRequested && state.phase === 'available' && route?.name === detailTarget
        && params != null && typeof params === 'object' && 'captureId' in params && params.captureId === state.captureId
        && 'taskId' in params && params.taskId === state.taskId
      detailRequested = false
      return matched
    },
    resume() { detailRequested = false; if (state.phase === 'available') publish({ ...state, expanded: true }) },
    requery() { if (state.failure && state.failure !== 'query') return; autoExpanded = false; return workflow?.requery() },
    cancel,
    dispose() { disposed = true; workflow?.dispose(); state = emptyContactResultState() },
  }
}
