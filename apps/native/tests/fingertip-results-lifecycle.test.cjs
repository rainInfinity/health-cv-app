// 真实云端状态驱动结果；消费者验证同轮详情、真实历史、重测与离页隔离。
const assert = require('node:assert/strict')
const { test } = require('node:test')
const Module = require('node:module')
const path = require('node:path')
const base = '../node_modules/.cache/native-test/'
const { createContactResultsLifecycle } = require(`${base}pages/measurement/ContactMeasurement/contactResultsLifecycle.js`)
const model = { modelId: 7, modelCode: 'ppg.active.offline.all', requiredInputs: ['ppg'], isExample: false }
const flushTasks = async () => { for (let i = 0; i < 40; i++) await Promise.resolve() }
function cloudDependencies(overrides = {}) {
  const calls = [], listeners = new Set()
  let generation = 1, taskStatus = 'SUCCEEDED'
  const result = { outcome: 'ALL_SUCCEEDED', results: {
    hr_br: { algorithmKey: 'ppg.active.offline.hr_br.v1', status: 'SUCCEEDED', result: { hr: 73, br: 15, quality: { score: 88, threshold: 70 } }, failureCode: null, failureMessage: null, qualityFailure: null },
    spo2: { algorithmKey: 'ppg.active.offline.spo2.v1', status: 'SUCCEEDED', result: { spo2: 98, quality: { score: 82, threshold: 70 } }, failureCode: null, failureMessage: null, qualityFailure: null },
    diabetes: { algorithmKey: 'ppg.active.offline.diabetes.v1', status: 'SUCCEEDED', result: { prob: .52, risk_level: 0, quality: { score: 81, threshold: 70 } }, failureCode: null, failureMessage: null, qualityFailure: null },
  } }
  const task = () => ({ taskId: 42, modelId: 7, modelCode: model.modelCode, versionId: 9, version: 'fixed', status: taskStatus, isExample: false, submittedAt: '2026-11-23 08:30:00', measurement: null, qualityFailure: null, result })
  const auth = {
    state: { subscribe(callback) { listeners.add(callback); callback(); return () => listeners.delete(callback) } },
    getSessionGeneration: () => generation, isAuthenticatedAt: (expected) => generation === expected,
    runProtected: async (action, options, expected) => { if (expected !== generation) throw Error('session'); return action(options) },
  }
  const client = { tasks: {
    async create() { calls.push('create'); return { ...task(), status: 'DRAFT' } },
    async uploadFile(id, input) { calls.push(`upload:${input.logicalName}`); return { fileId: 1, logicalName: input.logicalName, sizeBytes: 10, isSelected: true } },
    async submit() { calls.push('submit'); return { ...task(), status: 'SUBMITTED' } },
    async getById() { calls.push('get'); return task() },
    async list() { return { items: [], total: 0, offset: 0, limit: 20 } },
    ...overrides,
  } }
  return {
    options: { client, auth, invalidateMeasurements() {}, setTimeout() { return 1 }, clearTimeout() {} }, calls,
    changeIdentity() { generation++; for (const listener of [...listeners]) listener() },
    setTaskStatus(value) { taskStatus = value },
  }
}
function completed(overrides = {}) {
  return {
    captureId: 'round-1', sessionId: 'ppg-1', phase: 'completed', resourcesReleased: true, endReason: 'duration_reached', errorCode: null,
    remainingMillis: 0, elapsedMillis: 30017, coverageState: 'complete', coveragePercent: 98, coverageReady: true,
    artifact: { sessionId: 'ppg-1', files: [{ kind: 'ppg', path: '/round/ppg.csv', sizeBytes: 100 }, { kind: 'frame', path: '/round/frame.csv', sizeBytes: 20 }] },
    accSessionId: 'acc-1', accArtifact: { kind: 'accelerometer', sessionId: 'acc-1', path: '/round/acc.csv', sizeBytes: 100 },
    ...overrides,
  }
}
function resultsHarness(target = 'FingertipResults', overrides = {}) {
  const cloud = cloudDependencies(overrides), received = []
  const lifecycle = createContactResultsLifecycle(target, (value) => received.push(value), cloud.options)
  lifecycle.setVisible(true)
  lifecycle.begin('round-1', target === 'BloodPressureResults' ? 'chest' : 'fingertip', model, 1)
  return { lifecycle, received, cloud }
}
test('真实终态才展开，不再等待三秒；重复完成仅创建一次且收起后不自动重开', async () => {
  const { lifecycle, received, cloud } = resultsHarness()
  cloud.setTaskStatus('RUNNING'); lifecycle.update(completed())
  assert.equal(lifecycle.getSnapshot().phase, 'waiting'); assert.equal(lifecycle.enterDetails(), null)
  await flushTasks(); assert.equal(lifecycle.getSnapshot().phase, 'waiting')
  cloud.setTaskStatus('SUCCEEDED'); await lifecycle.requery()
  assert.equal(lifecycle.getSnapshot().phase, 'available'); assert.equal(lifecycle.getSnapshot().expanded, true)
  assert.equal(lifecycle.getSnapshot().report.metrics.heartRate.readings[0].value, 73)
  lifecycle.closeResults(); lifecycle.update(completed()); await flushTasks()
  assert.equal(lifecycle.getSnapshot().expanded, false)
  assert.equal(cloud.calls.filter((value) => value === 'create').length, 1)
  assert.equal(received.filter((value) => value.expanded).length, 1)
  lifecycle.dispose()
})
test('详情交接必须匹配方式与双身份，返回不重采重传', async () => {
  for (const target of ['FingertipResults', 'BloodPressureResults']) {
    const { lifecycle, cloud } = resultsHarness(target)
    lifecycle.update(completed()); await flushTasks()
    const params = { captureId: 'round-1', taskId: 42 }
    assert.equal(lifecycle.retainOnBlur({ name: target, params }), false)
    assert.deepEqual(lifecycle.enterDetails(), params)
    assert.equal(lifecycle.retainOnBlur({ name: target, params: { ...params, taskId: 43 } }), false)
    lifecycle.enterDetails()
    assert.equal(lifecycle.retainOnBlur({ name: target === 'FingertipResults' ? 'BloodPressureResults' : 'FingertipResults', params }), false)
    lifecycle.enterDetails(); assert.equal(lifecycle.retainOnBlur({ name: target, params }), true)
    const writes = cloud.calls.filter((value) => value !== 'get')
    lifecycle.setVisible(false); lifecycle.closeResults(); lifecycle.setVisible(true); lifecycle.resume(); await flushTasks()
    assert.equal(lifecycle.getSnapshot().expanded, true)
    assert.deepEqual(cloud.calls.filter((value) => value !== 'get'), writes)
    lifecycle.dispose()
  }
})
test('后台不查询或弹层，恢复先查真实失败报告，不造默认值', async () => {
  const { lifecycle, cloud } = resultsHarness()
  cloud.setTaskStatus('RUNNING'); lifecycle.update(completed()); await flushTasks()
  lifecycle.setVisible(false); cloud.setTaskStatus('FAILED'); await lifecycle.requery()
  assert.equal(lifecycle.getSnapshot().phase, 'waiting')
  lifecycle.setVisible(true); await flushTasks()
  assert.equal(lifecycle.getSnapshot().report.state, 'task_failed')
  assert.equal(lifecycle.getSnapshot().report.hasValidMembers, false)
  assert.equal(lifecycle.getSnapshot().expanded, true)
  assert.equal(lifecycle.getSnapshot().report.metrics.heartRate.readings.length, 0)
  lifecycle.dispose()
})
test('离开、换号、重测和卸载撤销旧轮，迟到完成不能恢复报告', async () => {
  for (const action of ['cancel', 'dispose', 'identity', 'remeasure']) {
    const { lifecycle, cloud } = resultsHarness()
    lifecycle.update(completed())
    if (action === 'identity') cloud.changeIdentity()
    else if (action === 'remeasure') lifecycle.begin('round-2', 'fingertip', model, 1)
    else lifecycle[action]()
    await flushTasks(); lifecycle.update(completed()); await flushTasks()
    assert.equal(lifecycle.getSnapshot().phase, 'idle'); assert.equal(lifecycle.enterDetails(), null)
    lifecycle.dispose()
  }
})

test('创建和上传失败只提供重测资格，不生成详情；重复完成不重开已收起失败', async () => {
  for (const stage of ['create', 'uploadFile']) {
    const { lifecycle } = resultsHarness('FingertipResults', { async [stage]() { throw Error('offline') } })
    lifecycle.update(completed()); await flushTasks()
    assert.equal(lifecycle.getSnapshot().failure, 'creation')
    assert.equal(lifecycle.getSnapshot().expanded, true)
    assert.equal(lifecycle.enterDetails(), null)
    lifecycle.closeResults(); lifecycle.update(completed()); await flushTasks()
    assert.equal(lifecycle.getSnapshot().expanded, false)
    lifecycle.dispose()
  }
})

test('查询失败只重新读取原任务，成功后显示同轮报告；任务失败禁止详情', async () => {
  let reads = 0
  const failed = resultsHarness('FingertipResults', { async getById() { reads++; throw Error('offline') } })
  failed.lifecycle.update(completed()); await flushTasks()
  assert.equal(failed.lifecycle.getSnapshot().failure, 'query')
  assert.equal(failed.lifecycle.getSnapshot().expanded, true)
  assert.equal(failed.lifecycle.enterDetails(), null)
  await failed.lifecycle.requery()
  assert.equal(reads, 2)
  assert.equal(failed.cloud.calls.filter((value) => value === 'create').length, 1)
  assert.equal(failed.cloud.calls.filter((value) => value === 'submit').length, 1)
  failed.lifecycle.dispose()
  const terminal = resultsHarness()
  terminal.cloud.setTaskStatus('FAILED'); terminal.lifecycle.update(completed()); await flushTasks()
  assert.equal(terminal.lifecycle.getSnapshot().failure, 'detection')
  assert.equal(terminal.lifecycle.enterDetails(), null)
  terminal.lifecycle.dispose()
})

// 最小React宿主仅调度公开Hook，不替换采集控制器、云端流程或展示适配。
let host
const sameDeps = (a, b) => a != null && b != null && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
const reactStub = {
  useState(initial) {
    const owner = host, index = owner.cursor++
    if (!(index in owner.slots)) owner.slots[index] = typeof initial === 'function' ? initial() : initial
    return [owner.slots[index], (next) => {
      const value = typeof next === 'function' ? next(owner.slots[index]) : next
      if (!Object.is(value, owner.slots[index])) { owner.slots[index] = value; owner.dirty = true }
    }]
  },
  useRef(initial) { const index = host.cursor++; return host.slots[index] ?? (host.slots[index] = { current: initial }) },
  useMemo(create, deps) {
    const index = host.cursor++
    if (!sameDeps(host.slots[index]?.deps, deps)) host.slots[index] = { value: create(), deps }
    return host.slots[index].value
  },
  useCallback(callback, deps) { return reactStub.useMemo(() => callback, deps) },
  useEffect(create, deps) {
    const index = host.cursor++
    if (!sameDeps(host.slots[index]?.deps, deps)) {
      const previous = host.slots[index], owner = host
      host.slots[index] = { deps, cleanup: previous?.cleanup }
      owner.effects.push(() => { previous?.cleanup?.(); owner.slots[index].cleanup = create() })
    }
  },
}
function pageHarness(source = 'fingertip', { allowed = true, permissionWait } = {}) {
  const cloud = cloudDependencies()
  const bloodPressure = source === 'bloodPressure'
  const measurementRoute = bloodPressure ? 'BloodPressureMeasurement' : 'FingertipMeasurement'
  let appListener, pulseListener, registeredLeave, preparations = 0, closes = 0
  const snapshots = { fingertip: null, bloodPressure: null }
  const listeners = { fingertip: new Set(), bloodPressure: new Set() }
  const snapshotCallbacks = { fingertip: [], bloodPressure: [] }
  const captures = { fingertip: 0, bloodPressure: 0 }
  const appState = { currentState: 'active', addEventListener(_, listener) { appListener = listener; return { remove() { appListener = null } } } }
  const navigation = { route: { name: measurementRoute }, getState() { return { index: 0, routes: [this.route] } }, dispatch() {} }
  const runtime = {
    slots: [], effects: [], cursor: 0, dirty: true, focusCallback: null, focusCleanup: null, focused: true, value: null,
    render() {
      host = runtime; runtime.cursor = 0; runtime.dirty = false; runtime.value = useMeasurement()
      while (runtime.effects.length) runtime.effects.shift()()
      if (runtime.focused && runtime.focusCleanup == null && runtime.focusCallback) runtime.focusCleanup = runtime.focusCallback()
    },
  }
  function subscribe(kind, listener) {
    listeners[kind].add(listener); snapshotCallbacks[kind].push(listener)
    return () => { listeners[kind].delete(listener) }
  }
  const client = {
    async requestCameraPermission() { if (permissionWait) await permissionWait }, async openCamera() { preparations++ },
    async startFingertipCapture() { return `round-${++captures.fingertip}` },
    async startBloodPressureCapture() { return `round-${++captures.bloodPressure}` },
    async closeCamera() { closes++ },
    getFingertipSnapshot() { return snapshots.fingertip }, getBloodPressureSnapshot() { return snapshots.bloodPressure },
    subscribeFingertip(listener) { return subscribe('fingertip', listener) },
    subscribeBloodPressure(listener) { return subscribe('bloodPressure', listener) },
    subscribeFingertipPulse(listener) { pulseListener = listener; return () => { pulseListener = null } },
  }
  const load = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'react') return reactStub
    if (request === 'react-native') return { AppState: appState }
    if (request === '@/app/bootstrap') return { appServices: { auth: cloud.options.auth, measurements: { workflowOptions: cloud.options, getPlan: () => model } } }
    if (request === '@/app/measurement/useMeasurementAccess') return { useMeasurementAccess: () => async () => allowed }
    if (request === '@react-navigation/native') return {
      useNavigation: () => navigation, usePreventRemove() {},
      useFocusEffect(callback) { runtime.focusCallback = callback },
    }
    if (request === '@health-cv-app/acquisition') return { createAcquisitionClient: () => client }
    if (request === '@/app/measurement/fingertipConfig') return { FINGERTIP_DURATION_MILLIS: 30_000, prepareFingertipCameraConfig: async () => ({ cameraId: 'back', torchEnabled: false }) }
    if (request === '@/app/measurement/fingertipVoiceResources') return { fingertipVoiceResources: {} }
    if (request === '@/app/measurement/bloodPressureVoiceResources') return { bloodPressureVoiceResources: {} }
    if (request === '@/app/preferences') return { chestPlacementGuideSkipped: { get: () => false, set() {} } }
    if (request === '@/app/measurement/measurementVoicePlayer') return { createMeasurementVoicePlayer() {} }
    if (request === './fingertipVoice') return { createFingertipVoice: () => ({ dispose() {}, update() {}, setHelpVisible() {} }) }
    if (request === './bloodPressureVoice') return { createBloodPressureVoice: () => ({ dispose() {}, update() {}, setHelpVisible() {} }) }
    if (request === '@/app/navigation/acquisitionNavigationGuard') return { registerAcquisitionLeaveRequest(callback) { registeredLeave = callback; return () => { registeredLeave = null } } }
    if (request.startsWith('@/')) return load.call(this, path.resolve(__dirname, base, `${request.slice(2)}.js`), parent, isMain)
    return load.call(this, request, parent, isMain)
  }
  const hookPath = require.resolve(`${base}pages/measurement/${measurementRoute}/use${measurementRoute}.js`)
  const sessionPath = require.resolve(`${base}pages/measurement/ContactMeasurement/useContactMeasurementSession.js`)
  delete require.cache[hookPath]; delete require.cache[sessionPath]
  let useMeasurement
  try { useMeasurement = require(hookPath)[`use${measurementRoute}`] } finally { Module._load = load }
  async function flush() {
    for (let index = 0; index < 40; index++) { await Promise.resolve(); if (runtime.dirty) runtime.render() }
  }
  return {
    cloud, get page() { return runtime.value }, get preparations() { return preparations }, get closes() { return closes },
    get captures() { return { ...captures } }, get snapshotCallbacks() { return snapshotCallbacks[source] },
    get subscriptions() { return { fingertip: listeners.fingertip.size, bloodPressure: listeners.bloodPressure.size } },
    async mount() { runtime.render(); await flush(); runtime.value.onPreviewLayout(); await flush() },
    async publish(value, kind = source) { snapshots[kind] = value; for (const listener of [...listeners[kind]]) listener(value); await flush() },
    pulse(batch) { pulseListener?.(batch) }, async advance() { await flush() },
    async foreground(active) { appState.currentState = active ? 'active' : 'background'; appListener?.(appState.currentState); await flush() },
    async blur(route) { navigation.route = route; runtime.focused = false; runtime.focusCleanup?.(); runtime.focusCleanup = null; await flush() },
    async focus() { navigation.route = { name: measurementRoute }; runtime.focused = true; runtime.dirty = true; await flush() },
    async leave() { registeredLeave(() => {}); await flush() },
    async retry() { runtime.value.retry(); await flush(); runtime.value.onPreviewLayout(); await flush() },
    async unmount() {
      runtime.focused = false; runtime.focusCleanup?.(); runtime.focusCleanup = null
      for (const slot of runtime.slots) slot?.cleanup?.()
      runtime.dirty = false; await Promise.resolve()
    },
  }
}
const pulse = (captureId = 'round-1') => ({ captureId, sessionId: 'source', segmentId: 0, sequence: 0, timesMillis: [1000, 1033], values: [2, 4] })
test('指尖Hook详情保留真实history与回看、不prepare；重测和真正离页清理', async (context) => {
  const page = pageHarness(); context.after(() => page.unmount())
  await page.mount(); page.pulse(pulse()); const history = page.page.waveform
  assert.deepEqual(history.getSnapshot().points, [[1000, 2], [1033, 4]])
  await page.publish(completed()); assert.equal(page.page.result.expanded, true)
  const params = page.page.enterDetails(); await page.blur({ name: 'FingertipResults', params })
  assert.equal(page.page.visible, false); assert.equal(history.getSnapshot().points.length, 2)
  await page.focus(); assert.strictEqual(page.page.waveform, history); assert.equal(page.preparations, 1)
  assert.equal(page.cloud.calls.filter((value) => value === 'create').length, 1)
  await page.retry(); assert.equal(page.preparations, 2); assert.equal(history.getSnapshot().points.length, 0)
  assert.equal(page.page.snapshot, null)
  page.pulse(pulse('round-2')); const next = page.page.waveform
  await page.leave(); await page.blur({ name: 'Main' })
  assert.equal(next.getSnapshot().points.length, 0); assert.equal(page.page.result.phase, 'idle')
})
test('普通失焦即使详情同名仍清理history与报告，卸载迟到完成无效', async () => {
  const page = pageHarness(); await page.mount(); page.pulse(pulse()); const history = page.page.waveform
  await page.publish(completed()); await page.blur({ name: 'FingertipResults', params: { captureId: 'round-1', taskId: 42 } })
  assert.equal(history.getSnapshot().points.length, 0); assert.equal(page.page.result.phase, 'idle'); await page.unmount()
  const waiting = pageHarness(); await waiting.mount(); const late = waiting.snapshotCallbacks[0]
  await waiting.unmount(); late(completed()); assert.equal(waiting.page.enterDetails(), null)
})
test('血压Hook只订阅联合API，归零、stopping、单源与未释放不上传', async (context) => {
  const page = pageHarness('bloodPressure'); context.after(() => page.unmount()); await page.mount()
  assert.deepEqual(page.captures, { fingertip: 0, bloodPressure: 1 })
  assert.deepEqual(page.subscriptions, { fingertip: 0, bloodPressure: 1 })
  await page.publish(completed(), 'fingertip'); assert.equal(page.page.snapshot, null)
  for (const invalid of [{ phase: 'capturing' }, { phase: 'stopping' }, { resourcesReleased: false }, { accArtifact: null }]) {
    await page.publish(completed(invalid)); assert.equal(page.page.result.phase, 'idle'); assert.equal(page.cloud.calls.length, 0)
  }
  await page.publish(completed())
  assert.deepEqual(page.cloud.calls.slice(0, 4), ['create', 'upload:ppg', 'upload:acc', 'submit'])
  assert.equal(page.page.result.phase, 'available')
  page.page.closeResults(); await page.publish(completed()); assert.equal(page.page.result.expanded, false)
})
test('血压非正常终止、文件关闭失败与旧轮不取得报告资格', async (context) => {
  for (const patch of [{ phase: 'interrupted', endReason: 'coverage_lost' }, { phase: 'failed' }, { endReason: 'user_stopped' }, { endReason: null }, { errorCode: 'FILE_FINALIZE_FAILED' }, { errorCode: 'CLOSE_FAILED' }, { captureId: 'old-round' }]) {
    await context.test(JSON.stringify(patch), async (child) => {
      const page = pageHarness('bloodPressure'); child.after(() => page.unmount())
      await page.mount(); await page.publish(completed(patch))
      assert.equal(page.page.result.phase, 'idle'); assert.equal(page.page.enterDetails(), null); assert.equal(page.cloud.calls.length, 0)
    })
  }
})
test('血压详情返回保留覆盖与当前轮，不prepare不重建；重测隔离旧订阅', async (context) => {
  const page = pageHarness('bloodPressure'); context.after(() => page.unmount())
  await page.mount(); await page.publish(completed()); const snapshot = page.page.snapshot, late = page.snapshotCallbacks[0]
  const params = page.page.enterDetails(); await page.blur({ name: 'BloodPressureResults', params })
  assert.deepEqual(page.subscriptions, { fingertip: 0, bloodPressure: 0 })
  await page.focus(); assert.strictEqual(page.page.snapshot, snapshot); assert.equal(page.preparations, 1)
  assert.equal(page.cloud.calls.filter((value) => value === 'create').length, 1)
  await page.retry(); assert.equal(page.preparations, 2); assert.equal(page.page.snapshot, null)
  late(completed({ captureId: 'round-2' })); await page.publish(completed()); assert.equal(page.page.result.phase, 'idle')
  await page.publish(completed({ captureId: 'round-2' })); assert.equal(page.page.result.captureId, 'round-2')
})
test('血压详情必须显式匹配方式、captureId与taskId，普通失焦清空', async () => {
  for (const [enter, route] of [
    [false, { name: 'BloodPressureResults', params: { captureId: 'round-1', taskId: 42 } }],
    [true, { name: 'BloodPressureResults', params: { captureId: 'wrong', taskId: 42 } }],
    [true, { name: 'BloodPressureResults', params: { captureId: 'round-1', taskId: 43 } }],
    [true, { name: 'FingertipResults', params: { captureId: 'round-1', taskId: 42 } }],
  ]) {
    const page = pageHarness('bloodPressure'); await page.mount(); await page.publish(completed())
    if (enter) page.page.enterDetails()
    await page.blur(route); assert.equal(page.page.result.phase, 'idle')
    await page.focus(); assert.equal(page.preparations, 1); await page.unmount()
  }
})
test('血压离页撤销云端等待，旧联合完成与换号不能回填报告', async () => {
  for (const identity of [false, true]) {
    const page = pageHarness('bloodPressure'); await page.mount(); const late = page.snapshotCallbacks[0]
    page.cloud.setTaskStatus('RUNNING'); await page.publish(completed())
    if (identity) page.cloud.changeIdentity(); else await page.leave()
    late(completed()); await page.advance()
    assert.equal(page.page.result.phase, 'idle'); assert.equal(page.page.enterDetails(), null)
    await page.unmount()
  }
})

test('跳过准备直接挂载也不能绕过设备前二次门控，拒绝时没有相机或IMU副作用', async () => {
  for (const source of ['fingertip', 'bloodPressure']) {
    const page = pageHarness(source, { allowed: false })
    await page.mount()
    assert.equal(page.preparations, 0)
    assert.deepEqual(page.captures, { fingertip: 0, bloodPressure: 0 })
    assert.equal(page.cloud.calls.length, 0)
    await page.unmount()
  }
})

test('权限返回前换号使设备资格失效，不打开旧轮相机或上传到新账号', async () => {
  for (const source of ['fingertip', 'bloodPressure']) {
    let release
    const permissionWait = new Promise((resolve) => { release = resolve })
    const page = pageHarness(source, { permissionWait })
    await page.mount(); page.cloud.changeIdentity(); release(); await page.advance()
    assert.equal(page.preparations, 0)
    assert.deepEqual(page.captures, { fingertip: 0, bloodPressure: 0 })
    assert.equal(page.cloud.calls.length, 0)
    await page.unmount()
  }
})
