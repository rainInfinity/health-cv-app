/** 一轮采集仅有一条写入链；本地取消不表示服务端取消。 */
import type { CloudClient, CloudRequestOptions, Rsp } from '@health-cv-app/cloud-client'
import type { FingertipSnapshot, BloodPressureSnapshot } from '@health-cv-app/acquisition'
import type { AuthSessionManager } from '../auth/session'
import type { ContactMethod } from './cloudPlan'
import { adaptMeasurementResult } from './resultAdapter'

export interface CloudMeasurementState {
  phase: 'idle' | 'creating' | 'uploading' | 'submitting' | 'observing' | 'terminal' | 'error'
  /** 请求失败的产品分类；任务检测失败由权威结果解释。 */
  failure: 'creation' | 'query' | null
  captureId: string | null
  taskId: number | null
  task: Rsp.Tasks.TaskDetail | null
  fixedTask: Rsp.Tasks.TaskSummary | null
  receipts: readonly Rsp.Tasks.TaskInputFile[]
  message: string
}
export interface CloudWorkflowOptions {
  client: CloudClient
  auth: AuthSessionManager
  invalidateMeasurements(generation: number): unknown
  /** 应用以现有Query资源保存详情；测试可注入同等单次读取。 */
  readTask?(taskId: number, generation: number, signal: AbortSignal): Promise<Rsp.Tasks.TaskDetail>
  onChange(state: CloudMeasurementState): void
  setTimeout?(callback: () => void, delay: number): unknown
  clearTimeout?(handle: unknown): void
}
export const emptyCloudMeasurementState = (): CloudMeasurementState => ({ phase: 'idle', failure: null, captureId: null, taskId: null, task: null, fixedTask: null, receipts: [], message: '' })

export function createCloudMeasurementWorkflow(options: CloudWorkflowOptions) {
  let state = emptyCloudMeasurementState()
  let round: { captureId: string; method: ContactMethod; model: Rsp.Models.AvailableModel; generation: number } | null = null
  let visible = false
  let disposed = false
  let attempted = false
  let writesPaused = false
  let operation: AbortController | null = null
  let timer: unknown = null
  let querying = false
  let invalidated = false
  const schedule = options.setTimeout ?? ((callback, delay) => setTimeout(callback, delay))
  const clear = options.clearTimeout ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  const current = (value = round) => !disposed && value != null && value === round && options.auth.isAuthenticatedAt(value.generation)
  function publish(patch: Partial<CloudMeasurementState>) { if (!current()) return; state = { ...state, ...patch }; options.onChange(state) }
  function stopTimer() { if (timer != null) clear(timer); timer = null }
  function cancel() {
    stopTimer(); operation?.abort(); operation = null; round = null; attempted = false; invalidated = false; querying = false; writesPaused = false
    state = emptyCloudMeasurementState(); if (!disposed) options.onChange(state)
  }
  const unsubscribe = options.auth.state.subscribe(() => { if (round && !current()) cancel() })
  async function request<T>(value: NonNullable<typeof round>, action: (request: CloudRequestOptions) => Promise<T>): Promise<T> {
    if (!current(value) || !visible) throw new Error('measurement-paused')
    const controller = new AbortController(); operation = controller
    try { return await options.auth.runProtected(action, { signal: controller.signal }, value.generation) }
    finally { if (operation === controller) operation = null }
  }
  function planPoll() {
    stopTimer()
    if (!current() || !visible || state.phase === 'error' || !['SUBMITTED', 'RUNNING'].includes(state.task?.status ?? '')) return
    timer = schedule(() => { timer = null; void query() }, 2000)
  }
  async function query() {
    const value = round
    if (!current(value) || !visible || querying || operation != null || state.taskId == null) return
    const taskId = state.taskId
    querying = true
    stopTimer()
    publish({ phase: 'observing', failure: null })
    try {
      const controller = new AbortController()
      operation = controller
      const task = options.readTask
        ? await options.readTask(taskId, value!.generation, controller.signal)
        : await options.auth.runProtected((requestOptions) => options.client.tasks.getById(taskId, requestOptions), { signal: controller.signal }, value!.generation)
      if (operation === controller) operation = null
      if (!current(value)) return
      if (task.status === 'SUCCEEDED' || task.status === 'FAILED') {
        const report = adaptMeasurementResult(task)
        publish(report.state === 'unavailable'
          ? { task, phase: 'error', failure: 'query', message: '结果查询失败，请稍后重新获取' }
          : { task, phase: 'terminal', failure: null, message: report.summary })
        if (!invalidated && report.hasValidMembers) {
          invalidated = true
          options.invalidateMeasurements(value!.generation)
        }
      } else if (task.status === 'SUBMITTED' || task.status === 'RUNNING') {
        publish({ task, phase: 'observing', message: task.status === 'RUNNING' ? '云端正在计算检测结果' : '已提交，等待云端处理' })
      } else {
        publish({ task, phase: 'error', failure: task.status === 'DRAFT' ? 'creation' : 'query', message: task.status === 'DRAFT' ? '由于未知错误，任务创建失败，请重新检测' : '结果查询失败，请稍后重新获取' })
      }
    } catch {
      if (current(value)) publish({ phase: 'error', failure: 'query', message: '结果查询失败，请稍后重新获取' })
    } finally {
      if (current(value)) { operation = null; querying = false; planPoll() }
    }
  }
  return {
    getSnapshot: () => state,
    begin(captureId: string, method: ContactMethod, model: Rsp.Models.AvailableModel, generation: number) {
      cancel()
      if (!options.auth.isAuthenticatedAt(generation) || disposed) return
      round = { captureId, method, model, generation }
      publish({ captureId })
    },
    update(snapshot: FingertipSnapshot | BloodPressureSnapshot) {
      const value = round
      if (!current(value) || snapshot.captureId !== value!.captureId) return
      if (snapshot.errorCode != null || snapshot.phase === 'failed' || snapshot.phase === 'interrupted') { cancel(); return }
      if (attempted || snapshot.phase !== 'completed' || snapshot.endReason !== 'duration_reached' || !snapshot.resourcesReleased) return
      const artifact = snapshot.artifact
      const ppg = artifact?.files.find((file) => file.kind === 'ppg')
      const frame = artifact?.files.find((file) => file.kind === 'frame')
      if (!artifact || artifact.sessionId !== snapshot.sessionId || !ppg?.path || ppg.sizeBytes <= 0 || !frame?.path || frame.sizeBytes <= 0) return
      const acc = 'accArtifact' in snapshot ? snapshot.accArtifact : null
      if (value!.method === 'chest' && (!('accSessionId' in snapshot) || !acc || acc.sessionId !== snapshot.accSessionId || acc.kind !== 'accelerometer' || !acc.path || acc.sizeBytes <= 0)) return
      if (!Number.isSafeInteger(snapshot.elapsedMillis) || snapshot.elapsedMillis <= 0) return
      attempted = true
      if (!visible) { publish({ phase: 'error', failure: 'creation', message: '由于未知错误，任务创建失败，请重新检测' }); return }
      const files = [{ logicalName: 'ppg', path: ppg.path }, ...(value!.method === 'chest' ? [{ logicalName: 'acc', path: acc!.path }] : [])]
      void (async () => {
        try {
          publish({ phase: 'creating', message: '正在创建本次检测任务' })
          const task = await request(value!, (requestOptions) => options.client.tasks.create({ modelId: value!.model.modelId }, requestOptions))
          if (!current(value)) return
          publish({ taskId: task.taskId, fixedTask: task })
          for (const file of files) {
            if (!visible || writesPaused) {
              publish({ phase: 'error', failure: 'creation', message: '由于未知错误，任务创建失败，请重新检测' })
              if (visible) await query()
              return
            }
            publish({ phase: 'uploading', message: `正在上传${file.logicalName === 'ppg' ? '脉搏' : '加速度'}文件` })
            const receipt = await request(value!, (requestOptions) => options.client.tasks.uploadFile(task.taskId, { logicalName: file.logicalName, file: { uri: file.path, name: `${file.logicalName}.csv`, type: 'text/csv' } }, requestOptions))
            if (!current(value)) return
            if (receipt.logicalName !== file.logicalName || receipt.isSelected !== true || receipt.sizeBytes <= 0) throw new Error('invalid-upload-receipt')
            publish({ receipts: [...state.receipts, receipt] })
          }
          if (!visible || writesPaused) {
            publish({ phase: 'error', failure: 'creation', message: '由于未知错误，任务创建失败，请重新检测' })
            if (visible) await query()
            return
          }
          publish({ phase: 'submitting', message: '正在提交云端检测' })
          try {
            await request(value!, (requestOptions) => options.client.tasks.submit(task.taskId, { measurement: { captureMethod: value!.method === 'chest' ? 'fingertip_chest' : 'fingertip', captureMode: 'active', durationMs: snapshot.elapsedMillis } }, requestOptions))
          } catch {
            if (!current(value)) return
            publish({ message: '提交回执尚未确认，正在查询已知任务' })
          }
          if (current(value) && visible) await query()
        } catch {
          if (!current(value)) return
          publish({ phase: 'error', failure: 'creation', message: '由于未知错误，任务创建失败，请重新检测' })
        }
      })()
    },
    setVisible(next: boolean) {
      const changed = next !== visible; visible = next
      if (!next) {
        if (['creating', 'uploading', 'submitting'].includes(state.phase)) writesPaused = true
        stopTimer()
        return
      }
      if (changed && current() && state.phase !== 'terminal' && state.failure !== 'creation' && state.taskId != null && !operation && !querying) void query()
    },
    requery: query,
    cancel,
    dispose() { disposed = true; cancel(); unsubscribe() },
  }
}
