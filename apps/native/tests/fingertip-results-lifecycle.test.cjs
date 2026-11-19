// 从实际页面 Hook 的消费者接口验证等待、导航与真实波形，不读取内部字段。
const assert = require('node:assert/strict')
const { test } = require('node:test')
const Module = require('node:module')
const path = require('node:path')
const base = '../node_modules/.cache/native-test/'
const { createFingertipResultsLifecycle } = require(`${base}pages/measurement/FingertipMeasurement/fingertipResultsLifecycle.js`)

/** 回调即使被取消也可手动交付，以覆盖已进入事件队列的迟到通知。 */
function clock() {
  let now = 0
  let nextId = 0
  const pending = new Map()
  const callbacks = []
  return {
    scheduler: {
      now: () => now,
      setTimeout(callback, delay) { const id = ++nextId; pending.set(id, { callback, at: now + delay }); callbacks.push(callback); return id },
      clearTimeout(id) { pending.delete(id) },
    },
    callbacks,
    advance(duration) {
      now += duration
      for (const [id, timer] of [...pending]) {
        if (timer.at <= now && pending.delete(id)) timer.callback()
      }
    },
  }
}

function completed(overrides = {}) {
  return {
    captureId: 'round-1', phase: 'completed', resourcesReleased: true, endReason: 'duration_reached', errorCode: null,
    remainingMillis: 0, coverageState: 'complete', coveragePercent: 98, coverageReady: true,
    ...overrides,
  }
}

function resultsHarness() {
  const time = clock()
  const received = []
  const lifecycle = createFingertipResultsLifecycle((value) => received.push(value), time.scheduler)
  lifecycle.setVisible(true)
  lifecycle.begin('round-1')
  return { time, lifecycle, received }
}

test('只有同轮正常目标完成且资源释放才开始等待，三秒前详情不可用', () => {
  for (const invalid of [
    { phase: 'capturing' }, { phase: 'stopping' }, { resourcesReleased: false },
    { phase: 'interrupted' }, { phase: 'failed' }, { errorCode: 'FILE_FINALIZE_FAILED' },
    { endReason: 'user_stopped' }, { endReason: null }, { captureId: 'old-round' },
  ]) {
    const { time, lifecycle } = resultsHarness()
    lifecycle.update(completed(invalid))
    time.advance(10_000)
    assert.equal(lifecycle.getSnapshot().phase, 'idle')
    assert.equal(lifecycle.enterDetails(), null)
  }
  const { time, lifecycle } = resultsHarness()
  lifecycle.update(completed({ resourcesReleased: false }))
  time.advance(10_000)
  lifecycle.update(completed())
  assert.equal(lifecycle.getSnapshot().phase, 'waiting')
  time.advance(2999)
  lifecycle.openResults()
  assert.equal(lifecycle.getSnapshot().expanded, false)
  assert.equal(lifecycle.enterDetails(), null)
  time.advance(1)
  assert.deepEqual(lifecycle.getSnapshot(), { phase: 'available', captureId: 'round-1', expanded: true })
  assert.equal(lifecycle.enterDetails(), 'round-1')
})

test('重复完成不重置，后台和本页不可见时间均不计入，取消的旧回调不能抢先展开', () => {
  const { time, lifecycle, received } = resultsHarness()
  lifecycle.update(completed())
  const oldCallback = time.callbacks[0]
  time.advance(1200)
  lifecycle.update(completed())
  lifecycle.setVisible(false)
  time.advance(40_000)
  oldCallback()
  assert.equal(lifecycle.getSnapshot().phase, 'waiting')
  lifecycle.setVisible(true)
  time.advance(1799)
  assert.equal(lifecycle.getSnapshot().phase, 'waiting')
  time.advance(1)
  lifecycle.closeResults()
  lifecycle.update(completed())
  assert.deepEqual(lifecycle.getSnapshot(), { phase: 'available', captureId: 'round-1', expanded: false })
  assert.equal(received.filter((value) => value.expanded).length, 1)
  lifecycle.openResults()
  assert.equal(lifecycle.getSnapshot().expanded, true)
})

test('离开、重测、失败和卸载同步撤销旧结果，迟到通知不能恢复新旧轮', () => {
  for (const cancel of ['cancel', 'dispose']) {
    const { time, lifecycle } = resultsHarness()
    lifecycle.update(completed())
    const callback = time.callbacks[0]
    lifecycle[cancel]()
    callback()
    lifecycle.update(completed())
    assert.equal(lifecycle.enterDetails(), null)
    assert.equal(lifecycle.getSnapshot().phase, 'idle')
  }
  const { time, lifecycle } = resultsHarness()
  lifecycle.update(completed())
  const callback = time.callbacks[0]
  lifecycle.cancel()
  lifecycle.begin('round-2')
  lifecycle.update(completed())
  callback()
  assert.equal(lifecycle.getSnapshot().phase, 'idle')
  lifecycle.update(completed({ captureId: 'round-2' }))
  time.advance(2999)
  assert.equal(lifecycle.getSnapshot().phase, 'waiting')
  time.advance(1)
  assert.equal(lifecycle.getSnapshot().captureId, 'round-2')
  lifecycle.update(completed({ captureId: 'round-2', errorCode: 'CLOSE_FAILED' }))
  assert.equal(lifecycle.getSnapshot().phase, 'idle')
})

test('详情交接必须明确且同轮，返回重新展开但不重等三秒', () => {
  const { time, lifecycle } = resultsHarness()
  lifecycle.update(completed())
  time.advance(3000)
  const route = { name: 'FingertipResults', params: { captureId: 'round-1' } }
  assert.equal(lifecycle.retainOnBlur(route), false)
  assert.equal(lifecycle.enterDetails(), 'round-1')
  assert.equal(lifecycle.retainOnBlur({ ...route, params: { captureId: 'other' } }), false)
  lifecycle.enterDetails()
  assert.equal(lifecycle.retainOnBlur({ name: 'Home' }), false)
  lifecycle.enterDetails()
  assert.equal(lifecycle.retainOnBlur(route), true)
  lifecycle.setVisible(false)
  lifecycle.closeResults()
  lifecycle.setVisible(true)
  lifecycle.resume()
  assert.deepEqual(lifecycle.getSnapshot(), { phase: 'available', captureId: 'round-1', expanded: true })
  assert.equal(time.callbacks.length, 1)
})

/** 最小 React／导航宿主替身：只调度公开 Hook 生命周期，不检查其私有 ref。 */
let host
const sameDeps = (a, b) => a != null && b != null && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
const reactStub = {
  useState(initial) {
    const owner = host
    const index = owner.cursor++
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
      const previous = host.slots[index]
      host.slots[index] = { deps, cleanup: previous?.cleanup }
      const owner = host
      owner.effects.push(() => { previous?.cleanup?.(); owner.slots[index].cleanup = create() })
    }
  },
}

function pageHarness() {
  const time = clock()
  let appListener
  let snapshotListener
  let pulseListener
  let currentSnapshot = null
  let captures = 0
  let preparations = 0
  let closes = 0
  let registeredLeave
  const appState = { currentState: 'active', addEventListener(_, listener) { appListener = listener; return { remove() { appListener = null } } } }
  const navigation = { route: { name: 'FingertipMeasurement' }, getState() { return { index: 0, routes: [this.route] } }, dispatch() {} }
  const runtime = {
    slots: [], effects: [], cursor: 0, dirty: true, focusCallback: null, focusCleanup: null, focused: true, value: null,
    render() {
      host = runtime
      runtime.cursor = 0
      runtime.dirty = false
      runtime.value = useFingertipMeasurement()
      while (runtime.effects.length) runtime.effects.shift()()
      if (runtime.focused && runtime.focusCleanup == null && runtime.focusCallback) runtime.focusCleanup = runtime.focusCallback()
    },
  }
  const client = {
    async requestCameraPermission() {},
    async openCamera() { preparations += 1 },
    async startFingertipCapture() { captures += 1; return `round-${captures}` },
    async closeCamera() { closes += 1 },
    getFingertipSnapshot() { return currentSnapshot },
    subscribeFingertip(listener) { snapshotListener = listener; return () => { snapshotListener = null } },
    subscribeFingertipPulse(listener) { pulseListener = listener; return () => { pulseListener = null } },
  }
  const load = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'react') return reactStub
    if (request === 'react-native') return { AppState: appState }
    if (request === '@react-navigation/native') return {
      useNavigation: () => navigation,
      usePreventRemove() {},
      useFocusEffect(callback) { runtime.focusCallback = callback },
    }
    if (request === '@health-cv-app/acquisition') return { createAcquisitionClient: () => client }
    if (request === '@/app/measurement/fingertipConfig') return { FINGERTIP_DURATION_MILLIS: 30_000, prepareFingertipCameraConfig: async () => ({ cameraId: 'back', torchEnabled: false }) }
    if (request === '@/app/measurement/fingertipVoiceResources') return { fingertipVoiceResources: {} }
    if (request === '@/app/measurement/measurementVoicePlayer') return { createMeasurementVoicePlayer() {} }
    if (request === './fingertipVoice') return { createFingertipVoice: () => ({ dispose() {}, update() {}, setHelpVisible() {} }) }
    if (request === './fingertipResultsLifecycle') return {
      createFingertipResultsLifecycle: (onChange) => createFingertipResultsLifecycle(onChange, time.scheduler),
    }
    if (request === '@/app/navigation/acquisitionNavigationGuard') return { registerAcquisitionLeaveRequest(callback) { registeredLeave = callback; return () => { registeredLeave = null } } }
    if (request.startsWith('@/')) return load.call(this, path.resolve(__dirname, base, `${request.slice(2)}.js`), parent, isMain)
    return load.call(this, request, parent, isMain)
  }
  const hookPath = require.resolve(`${base}pages/measurement/FingertipMeasurement/useFingertipMeasurement.js`)
  const sessionPath = require.resolve(`${base}pages/measurement/ContactMeasurement/useContactMeasurementSession.js`)
  delete require.cache[hookPath]
  delete require.cache[sessionPath]
  let useFingertipMeasurement
  try { ({ useFingertipMeasurement } = require(hookPath)) } finally { Module._load = load }

  async function flush() {
    for (let index = 0; index < 12; index += 1) {
      await Promise.resolve()
      if (runtime.dirty) runtime.render()
    }
  }
  return {
    time,
    get page() { return runtime.value },
    get preparations() { return preparations },
    get closes() { return closes },
    async mount() { runtime.render(); await flush(); runtime.value.onPreviewLayout(); await flush() },
    async publish(value) { currentSnapshot = value; snapshotListener?.(value); await flush() },
    pulse(batch) { pulseListener?.(batch) },
    async advance(duration) { time.advance(duration); await flush() },
    async foreground(active) { appState.currentState = active ? 'active' : 'background'; appListener?.(appState.currentState); await flush() },
    async blur(route) { navigation.route = route; runtime.focused = false; runtime.focusCleanup?.(); runtime.focusCleanup = null; await flush() },
    async focus() { navigation.route = { name: 'FingertipMeasurement' }; runtime.focused = true; runtime.dirty = true; await flush() },
    async leave() { registeredLeave(() => {}); await flush() },
    async retry() { runtime.value.retry(); await flush(); runtime.value.onPreviewLayout(); await flush() },
    async unmount() {
      runtime.focused = false
      runtime.focusCleanup?.()
      runtime.focusCleanup = null
      for (const slot of runtime.slots) slot?.cleanup?.()
      runtime.dirty = false
      await Promise.resolve()
    },
  }
}

function pulse(captureId = 'round-1') {
  return { captureId, sessionId: 'source', segmentId: 0, sequence: 0, timesMillis: [1000, 1033], values: [2, 4] }
}

test('页面详情往返保留原轮真实 history、暂停绘图且不 prepare，真正退出与重测清理', async () => {
  const page = pageHarness()
  await page.mount()
  page.pulse(pulse())
  const history = page.page.waveform
  assert.deepEqual(history.getSnapshot().points, [[1000, 2], [1033, 4]])
  await page.publish(completed())
  await page.advance(1200)
  await page.foreground(false)
  await page.advance(5000)
  assert.equal(page.page.result.phase, 'waiting')
  await page.foreground(true)
  await page.advance(1800)
  assert.equal(page.page.result.expanded, true)
  const captureId = page.page.enterDetails()
  await page.blur({ name: 'FingertipResults', params: { captureId } })
  assert.equal(page.page.visible, false)
  assert.deepEqual(history.getSnapshot().points, [[1000, 2], [1033, 4]])
  await page.focus()
  assert.strictEqual(page.page.waveform, history)
  assert.equal(page.page.result.expanded, true)
  assert.equal(page.preparations, 1)
  await page.retry()
  assert.equal(page.preparations, 2)
  assert.equal(history.getSnapshot().points.length, 0)
  assert.equal(page.page.waveform.getSnapshot().points.length, 0)
  assert.equal(page.page.result.phase, 'idle')
  assert.equal(page.page.snapshot, null)
  page.pulse(pulse('round-2'))
  const nextHistory = page.page.waveform
  await page.publish(completed({ captureId: 'round-2' }))
  await page.advance(1000)
  const late = page.time.callbacks.at(-1)
  await page.leave()
  late()
  assert.equal(page.page.result.phase, 'idle')
  await page.blur({ name: 'Main' })
  assert.equal(nextHistory.getSnapshot().points.length, 0)
  assert.ok(page.closes >= 2)
  await page.unmount()
})

test('普通失焦即使目标叫详情也不保留；卸载使迟到等待回调无效', async () => {
  const page = pageHarness()
  await page.mount()
  page.pulse(pulse())
  const history = page.page.waveform
  await page.publish(completed())
  await page.advance(3000)
  await page.blur({ name: 'FingertipResults', params: { captureId: 'round-1' } })
  assert.equal(history.getSnapshot().points.length, 0)
  assert.equal(page.page.result.phase, 'idle')
  await page.unmount()

  const waiting = pageHarness()
  await waiting.mount()
  await waiting.publish(completed())
  const callback = waiting.time.callbacks[0]
  await waiting.unmount()
  callback()
  assert.equal(waiting.page.enterDetails(), null)
})
