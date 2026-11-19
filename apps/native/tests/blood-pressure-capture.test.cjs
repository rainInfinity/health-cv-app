// 驱动真实消费者命令边界与低频投影，不读源码接线、不生成产品采集样本。
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { createBloodPressureCaptureController } = require('../src/app/measurement/bloodPressureCapture.ts')
const { createBloodPressureDisplay } = require('../node_modules/.cache/native-test/pages/measurement/BloodPressureMeasurement/bloodPressurePresentation.js')
const { createBloodPressurePlacementReminder } = require('../src/pages/measurement/BloodPressureMeasurement/bloodPressurePlacementReminder.ts')
const { createAcquisitionLeaveGuard } = require('../node_modules/.cache/native-test/app/navigation/acquisitionLeaveGuard.js')

function snapshot(overrides = {}) {
  return { captureId: 'bp-1', phase: 'observing_finger', coveragePercent: null, coverageState: 'unknown', coverageReady: false, remainingMillis: 30_000, resourcesReleased: false, errorCode: null, endReason: null, ...overrides }
}

function harness(options = {}) {
  const events = []
  const mounted = Promise.withResolvers()
  const opened = Promise.withResolvers()
  const starting = Promise.withResolvers()
  const closing = Promise.withResolvers()
  let foreground = true
  let current = null
  let listener = null
  let interrupted = 0
  const received = []
  const client = {
    async requestCameraPermission() { events.push('permission'); await options.permission?.promise },
    async openCamera(config) { events.push(['open', config.cameraId]); opened.resolve(); await options.open?.promise; if (options.openError) throw options.openError },
    async startBloodPressureCapture(config) { events.push(['start', config.durationMillis]); starting.resolve(); await options.start?.promise; return 'bp-1' },
    getBloodPressureSnapshot() { return current },
    subscribeBloodPressure(callback) { listener = callback; return () => { listener = null } },
    async closeCamera() { events.push('close-group'); closing.resolve(); await options.close?.promise; if (options.closeError?.()) throw { code: 'GROUP_CLOSE_FAILED' } },
  }
  const controller = createBloodPressureCaptureController({
    client, durationMillis: 30_000,
    async prepareConfig() { events.push('config'); return { cameraId: 'rear', torchEnabled: false } },
    isForeground: () => foreground,
    mountPreview() { events.push('mount'); mounted.resolve() },
    onSnapshot(value) { received.push(value) },
    onPreparationInterrupted() { interrupted += 1 },
  })
  return {
    events, controller, received, mounted: mounted.promise, opened: opened.promise, starting: starting.promise, closing: closing.promise,
    get interrupted() { return interrupted },
    foreground(active) { foreground = active; controller.setForeground(active) },
    publish(value) { current = value; listener?.(value) },
  }
}

async function prepare(state) {
  const operation = state.controller.prepare()
  await state.mounted
  state.controller.previewReady()
  await operation
}

test('明确入口只准备一次，布局就绪前不打开相机且不调用指尖单源开始', async () => {
  const state = harness()
  const first = state.controller.prepare()
  assert.equal(first, state.controller.prepare())
  await state.mounted
  assert.deepEqual(state.events, ['permission', 'config', 'mount'])
  state.controller.previewReady()
  await first
  assert.deepEqual(state.events, ['permission', 'config', 'mount', ['open', 'rear'], ['start', 30_000]])
  state.publish(snapshot())
  state.publish(snapshot({ phase: 'awaiting_chest', coverageReady: true }))
  assert.equal(state.received.at(-1).phase, 'awaiting_chest')
  assert.equal(state.events.filter((event) => Array.isArray(event) && event[0] === 'start').length, 1)
  await state.controller.close()
  state.controller.dispose()
})

test('离页先解除权限或布局等待，迟到授权和布局不能启动旧轮', async () => {
  const permission = Promise.withResolvers()
  const state = harness({ permission })
  const operation = state.controller.prepare()
  await state.controller.close()
  permission.resolve()
  state.controller.previewReady()
  await operation
  assert.deepEqual(state.events, ['permission', 'close-group'])
  state.controller.dispose()

  const waiting = harness()
  const pending = waiting.controller.prepare()
  await waiting.mounted
  await waiting.controller.close()
  await pending
  waiting.controller.previewReady()
  assert.deepEqual(waiting.events, ['permission', 'config', 'mount', 'close-group'])
  waiting.controller.dispose()
})

test('系统授权短暂失活不取消仍有效的本轮入口', async () => {
  const permission = Promise.withResolvers()
  const state = harness({ permission })
  const operation = state.controller.prepare()
  state.foreground(false)
  permission.resolve()
  await Promise.resolve()
  state.foreground(true)
  await state.mounted
  state.controller.previewReady()
  await operation
  assert.equal(state.interrupted, 0)
  assert.equal(state.events.filter((event) => Array.isArray(event) && event[0] === 'start').length, 1)
  await state.controller.close()
  state.controller.dispose()
})

test('联合启动未确认时即发送整组关闭，关闭失败留页并可再次关闭', async () => {
  const start = Promise.withResolvers()
  let closeFails = true
  const state = harness({ start, closeError: () => closeFails })
  const preparing = state.controller.prepare()
  await state.mounted
  state.controller.previewReady()
  await state.starting
  let navigated = false
  const failures = []
  const guard = createAcquisitionLeaveGuard({
    waitForCameraCommand: async () => {}, getSessionGeneration: () => 1,
    isCameraActive: () => true, closeCamera: () => state.controller.close(),
    onReady() { navigated = true }, onFailure(error) { failures.push(error.code) },
  })
  const leaving = guard.request('back')
  await state.closing
  assert.equal(state.events.at(-1), 'close-group')
  assert.equal(navigated, false)
  start.resolve()
  await preparing
  await leaving
  assert.equal(navigated, false)
  assert.deepEqual(failures, ['GROUP_CLOSE_FAILED'])
  closeFails = false
  await guard.request('back')
  assert.equal(navigated, true)
  assert.equal(state.events.filter((event) => event === 'close-group').length, 2)
  guard.dispose()
  state.controller.dispose()
})

test('相机忙的历史启动错误不冒充本次关闭失败，不触及其他所有者', async () => {
  const state = harness({ openError: { code: 'CAMERA_BUSY' } })
  const operation = state.controller.prepare()
  await state.mounted
  state.controller.previewReady()
  await assert.rejects(operation, (error) => error.code === 'CAMERA_BUSY')
  await state.controller.close()
  assert.equal(state.events.at(-1), 'close-group')
  assert.equal(state.events.some((event) => Array.isArray(event) && event[0] === 'start'), false)
  state.controller.dispose()
})

test('订阅只接受同轮事实，后台恢复刷新终态但不再次开始', async () => {
  const state = harness()
  await prepare(state)
  state.publish(snapshot({ captureId: 'unrelated', phase: 'capturing' }))
  assert.deepEqual(state.received, [])
  state.foreground(false)
  state.publish(snapshot({ phase: 'interrupted', endReason: 'APP_BACKGROUND', remainingMillis: 12_400 }))
  state.foreground(true)
  assert.equal(state.received.at(-1).remainingMillis, 12_400)
  assert.equal(state.events.filter((event) => Array.isArray(event) && event[0] === 'start').length, 1)
  state.controller.dispose()
  state.publish(snapshot({ phase: 'capturing' }))
  assert.equal(state.received.at(-1).phase, 'interrupted')
  await state.controller.close()
})

test('覆盖节流与提示防抖不延迟贴胸阶段，准备保留三十秒且 IMU 更新不重绘父页', (context) => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 })
  const statuses = []
  const display = createBloodPressureDisplay((value) => statuses.push(value))
  display.update(snapshot({ coverageState: 'partial', coveragePercent: 100 }))
  assert.equal(display.getSnapshot().coveragePercent, 99)
  context.mock.timers.tick(300)
  assert.equal(display.getSnapshot().presentation, 'partial')
  display.update(snapshot({ phase: 'awaiting_chest', coverageState: 'complete', coveragePercent: 100, coverageReady: true }))
  assert.equal(statuses.at(-1).phase, 'awaiting_chest')
  assert.equal(statuses.at(-1).remainingSeconds, 30)
  const count = statuses.length
  display.update(snapshot({ phase: 'awaiting_chest', coverageState: 'complete', coveragePercent: 100, coverageReady: true, tiltDegrees: 32, stable: false, scgCandidate: true }))
  assert.equal(statuses.length, count)
  display.update(snapshot({ phase: 'capturing', remainingMillis: 28_150 }))
  assert.equal(statuses.at(-1).presentation, 'running')
  assert.equal(statuses.at(-1).remainingSeconds, 29)
  display.update(snapshot({ phase: 'completed', remainingMillis: 0, resourcesReleased: false }))
  assert.equal(statuses.at(-1).presentation, 'stopping')
  display.update(snapshot({ phase: 'completed', remainingMillis: 0, resourcesReleased: true }))
  assert.equal(statuses.at(-1).presentation, 'completed')
  display.dispose()
})

test('放置指导仅从第一阶段真实观测计时，贴胸准备撤销旧回调且已展示提醒不重复', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const visibility = []
  const reminder = createBloodPressurePlacementReminder((value) => visibility.push(value))
  context.mock.timers.tick(30_000)
  assert.deepEqual(visibility, [])
  reminder.update(snapshot())
  context.mock.timers.tick(9_000)
  reminder.update(snapshot({ phase: 'awaiting_chest' }))
  context.mock.timers.tick(60_000)
  reminder.update(snapshot({ phase: 'starting' }))
  context.mock.timers.tick(60_000)
  assert.deepEqual(visibility, [])
  reminder.update(snapshot())
  context.mock.timers.tick(9_999)
  assert.deepEqual(visibility, [])
  context.mock.timers.tick(1)
  assert.deepEqual(visibility, [true])
  reminder.update(snapshot({ phase: 'awaiting_chest' }))
  assert.deepEqual(visibility, [true, false])
  reminder.update(snapshot())
  context.mock.timers.tick(30_000)
  assert.deepEqual(visibility, [true, false])
  reminder.dispose()
})

test('指导确认不开始采集，终止和重试撤销旧轮计时，新轮独立等待', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const visibility = []
  const reminder = createBloodPressurePlacementReminder((value) => visibility.push(value))
  reminder.update(snapshot())
  context.mock.timers.tick(10_000)
  reminder.dismiss()
  reminder.update(snapshot())
  context.mock.timers.tick(30_000)
  assert.deepEqual(visibility, [true, false])
  reminder.reset()
  reminder.update(snapshot({ captureId: 'bp-2' }))
  context.mock.timers.tick(9_999)
  reminder.update(snapshot({ captureId: 'bp-2', phase: 'failed' }))
  context.mock.timers.tick(60_000)
  assert.deepEqual(visibility, [true, false])
  reminder.update(snapshot({ captureId: 'bp-3' }))
  context.mock.timers.tick(10_000)
  assert.deepEqual(visibility, [true, false, true])
  reminder.reset()
  reminder.dispose()
  context.mock.timers.tick(30_000)
  assert.deepEqual(visibility, [true, false, true, false])
})
