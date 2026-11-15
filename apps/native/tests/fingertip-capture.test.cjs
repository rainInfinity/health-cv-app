// 从消费者边界驱动异步准备、资源屏障及真实历史，不依赖源码文字或模拟曲线。

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { createFingertipCaptureController } = require('../src/pages/measurement/FingertipMeasurement/fingertipCapture.ts')
const { createFingertipWaveform } = require('../src/pages/measurement/FingertipMeasurement/fingertipWaveform.ts')
const { createFingertipDisplay, getFingertipPresentation } = require('../src/pages/measurement/FingertipMeasurement/fingertipPresentation.ts')
const { buildFingertipCameraConfig, prepareFingertipCameraConfig } = require('../src/app/measurement/fingertipConfig.ts')
const { createAcquisitionLeaveGuard } = require('../node_modules/.cache/native-test/app/navigation/acquisitionLeaveGuard.js')
const { createRPPGPreviewReadiness } = require('../../../packages/acquisition/src/react/RPPGPreview/previewReadiness.ts')

/** 控制真实异步边界的确定性输入，不按等待时长伪造采集状态。 */
function harness(overrides = {}) {
  const events = []
  const mounted = Promise.withResolvers()
  const opened = Promise.withResolvers()
  const started = Promise.withResolvers()
  let foreground = true
  let snapshot = null
  let snapshotListener = null
  let pulseListener = null
  let history = null
  let interrupted = 0
  const received = []
  const client = {
    async requestCameraPermission() { events.push('permission'); await overrides.permission?.promise },
    async openCamera(config) { events.push('open'); opened.resolve(); await overrides.open?.promise; if (overrides.openError) throw overrides.openError },
    async startFingertipCapture(config) { events.push(['start', config.durationMillis]); started.resolve(); await overrides.start?.promise; return overrides.captureId ?? 'round-1' },
    async closeCamera() { events.push('close'); await overrides.close?.promise; if (overrides.closeError?.()) throw { code: 'CAMERA_CLOSE_FAILED' } },
    getFingertipSnapshot() { return snapshot },
    subscribeFingertip(listener) { snapshotListener = listener; return () => { snapshotListener = null } },
    subscribeFingertipPulse(listener) { pulseListener = listener; return () => { pulseListener = null } },
  }
  const controller = createFingertipCaptureController({
    client,
    async prepareConfig() { events.push('query'); return { cameraId: 'back', torchEnabled: true } },
    durationMillis: 30_000,
    isForeground: () => foreground,
    mountPreview() { events.push('mount'); mounted.resolve() },
    onCapture(id) { events.push(['capture', id]); history = createFingertipWaveform(id) },
    onSnapshot(value) { received.push(value) },
    onPulse(batch) { history.append(batch) },
    onPreparationInterrupted() { interrupted += 1 },
  })
  return {
    controller, events, mounted: mounted.promise, opened: opened.promise, started: started.promise, received,
    get history() { return history },
    get interrupted() { return interrupted },
    get snapshotListener() { return snapshotListener },
    get pulseListener() { return pulseListener },
    foreground(active) { foreground = active; controller.setForeground(active) },
    publish(next) { snapshot = next; snapshotListener?.(next) },
    pulse(batch) { pulseListener?.(batch) },
  }
}

/** 批次是受控协议输入，值和采样时间都由测试显式提供。 */
function batch(overrides = {}) {
  return { captureId: 'round-1', sessionId: 'source-1', segmentId: 0, sequence: 0, timesMillis: [1_000, 1_033], values: [2, 4], ...overrides }
}

/** 只构造低频阶段事实，不使用 JS 计时推进产品。 */
function snapshot(overrides = {}) {
  return { captureId: 'round-1', phase: 'observing', coveragePercent: null, coverageState: 'unknown', coverageReady: false, remainingMillis: 30_000, resourcesReleased: false, ...overrides }
}

test('授权尚未返回即可安全离开，迟到授权和布局不能打开旧页面', async () => {
  const permission = Promise.withResolvers()
  const old = harness({ permission })
  const preparing = old.controller.prepare()
  const closing = old.controller.close()
  await closing
  assert.deepEqual(old.events, ['permission', 'close'])
  old.controller.dispose()
  permission.resolve()
  old.controller.previewReady()
  await preparing
  assert.deepEqual(old.events, ['permission', 'close'])

  const next = harness({ captureId: 'round-2' })
  const nextPreparing = next.controller.prepare()
  await next.mounted
  next.controller.previewReady()
  await nextPreparing
  assert.equal(next.events.filter((event) => event === 'open').length, 1)
  assert.equal(next.history.getSnapshot().points.length, 0)
  await next.controller.close()
})

test('离页取消布局门闩，不等待必须由将卸载页面完成的事件', async () => {
  const state = harness()
  const preparing = state.controller.prepare()
  await state.mounted
  await state.controller.close()
  await preparing
  state.controller.previewReady()
  assert.deepEqual(state.events, ['permission', 'query', 'mount', 'close'])
})

test('真实实例与正布局双信号到齐才可开相机，单独布局不会放行', async () => {
  const state = harness()
  const preparing = state.controller.prepare()
  await state.mounted
  const readiness = createRPPGPreviewReadiness(() => state.controller.previewReady())
  readiness.onLayout({ nativeEvent: { layout: { width: 280, height: 280 } }, persist() {} })
  assert.equal(state.events.includes('open'), false)
  readiness.onHybridReady()
  await preparing
  assert.deepEqual(state.events.slice(-3), ['open', ['start', 30_000], ['capture', 'round-1']])
  await state.controller.close()
})

test('授权弹窗暂时后台后有效入口可继续，但已建立轮次后台返回不重开', async () => {
  const permission = Promise.withResolvers()
  const state = harness({ permission })
  const preparing = state.controller.prepare()
  state.foreground(false)
  permission.resolve()
  state.foreground(true)
  await state.mounted
  state.controller.previewReady()
  await preparing
  assert.equal(state.interrupted, 0)
  state.foreground(false)
  state.publish(snapshot({ phase: 'interrupted', endReason: 'app_background', resourcesReleased: true, remainingMillis: 24_050 }))
  state.foreground(true)
  assert.equal(state.received.at(-1).remainingMillis, 24_050)
  assert.equal(state.events.filter((event) => event === 'open').length, 1)
  assert.equal(state.events.filter((event) => Array.isArray(event) && event[0] === 'start').length, 1)
  await state.controller.close()
})

test('打开命令在途时立即通知原生关闭意图，仍等命令和关闭双屏障才完成', async () => {
  const open = Promise.withResolvers()
  const close = Promise.withResolvers()
  const state = harness({ open, close })
  const preparing = state.controller.prepare()
  await state.mounted
  state.controller.previewReady()
  await state.opened
  const closing = state.controller.close()
  assert.strictEqual(state.controller.close(), closing)
  assert.equal(state.events.at(-1), 'close')
  let released = false
  void closing.then(() => { released = true })
  close.resolve()
  await Promise.resolve()
  assert.equal(released, false)
  open.resolve()
  await Promise.all([preparing, closing])
  assert.equal(released, true)
  assert.equal(state.events.some((event) => Array.isArray(event) && event[0] === 'start'), false)
})

test('开始在途时关闭不等启动确认才发命令，销毁后迟到结果不能恢复订阅或历史', async () => {
  const start = Promise.withResolvers()
  const state = harness({ start })
  const preparing = state.controller.prepare()
  await state.mounted
  state.controller.previewReady()
  await state.started
  const closing = state.controller.close()
  assert.equal(state.events.at(-1), 'close')
  state.controller.dispose()
  start.resolve()
  await Promise.all([preparing, closing])
  assert.equal(state.history, null)
  assert.equal(state.snapshotListener, null)
  assert.equal(state.pulseListener, null)
})

test('关闭失败留页，明确再次请求成功后才交接导航，不重抛历史启动错误', async () => {
  let failClose = true
  const state = harness({ closeError: () => failClose, openError: { code: 'CAMERA_BUSY' } })
  const preparing = state.controller.prepare()
  await state.mounted
  state.controller.previewReady()
  await assert.rejects(preparing, (error) => error.code === 'CAMERA_BUSY')
  const actions = []
  const failures = []
  const guard = createAcquisitionLeaveGuard({
    async waitForCameraCommand() {}, getSessionGeneration: () => 1, isCameraActive: () => true,
    closeCamera: () => state.controller.close(), onReady: (action) => actions.push(action), onFailure: (error) => failures.push(error.code),
  })
  await guard.request('back')
  assert.deepEqual(actions, [])
  assert.deepEqual(failures, ['CAMERA_CLOSE_FAILED'])
  failClose = false
  await guard.request('back')
  assert.deepEqual(actions, ['back'])
  assert.equal(state.events.filter((event) => event === 'close').length, 2)
})

test('只订阅本轮真实批次，隐藏绘图仍接收全部历史，恢复后可回看末状态', async () => {
  const state = harness()
  const preparing = state.controller.prepare()
  await state.mounted
  state.controller.previewReady()
  await preparing
  const history = state.history
  let drawings = 0
  const detach = history.subscribe(() => { drawings += 1 })
  state.pulse(batch())
  detach()
  state.pulse(batch({ sequence: 1, timesMillis: [1_066, 1_099], values: [3, 1] }))
  state.pulse(batch({ sequence: 2, timesMillis: [1_132], values: [-2] }))
  assert.equal(drawings, 1)
  assert.deepEqual(history.getSnapshot().points, [[1_000, 2], [1_033, 4], [1_066, 3], [1_099, 1], [1_132, -2]])
  assert.equal(history.getSnapshot().latestTimeMs, 1_132)
  const unchanged = structuredClone(history.getSnapshot().points)
  state.pulse(batch({ captureId: 'old-round', sequence: 3, timesMillis: [1_165], values: [500] }))
  assert.deepEqual(history.getSnapshot().points, unchanged)
  const latePulse = state.pulseListener
  state.controller.dispose()
  latePulse(batch({ sequence: 3, timesMillis: [1_165], values: [500] }))
  assert.deepEqual(history.getSnapshot().points, unchanged)
})

test('会话、片段、批次及真实时间缺口断线，拒绝重复迟到与非有限样本，不补点', () => {
  const history = createFingertipWaveform('round-1')
  assert.equal(history.append(batch()), true)
  assert.equal(history.append(batch()), false)
  history.append(batch({ sequence: 2, timesMillis: [1_066], values: [3] }))
  history.append(batch({ sequence: 3, segmentId: 1, timesMillis: [1_099], values: [-2] }))
  history.append(batch({ sequence: 4, segmentId: 1, sessionId: 'source-2', timesMillis: [1_132], values: [-1] }))
  history.append(batch({ sequence: 5, segmentId: 1, sessionId: 'source-2', timesMillis: [1_500, 1_800], values: [1, 2] }))
  const beforeInvalid = structuredClone(history.getSnapshot().points)
  assert.equal(history.append(batch({ sequence: 6, timesMillis: [1_700], values: [0] })), false)
  assert.equal(history.append(batch({ sequence: 6, timesMillis: [1_900], values: [NaN] })), false)
  assert.equal(history.append(batch({ sequence: 6, timesMillis: [31_000], values: [1] })), false)
  assert.equal(history.append(batch({ captureId: 'round-2', sequence: 6, timesMillis: [1_900], values: [0] })), false)
  assert.deepEqual(history.getSnapshot().points, beforeInvalid)
  assert.equal(beforeInvalid.filter((point) => point[1] === null).length, 5)
  assert.deepEqual(beforeInvalid.filter((point) => point[1] !== null).map((point) => point[1]), [2, 4, 3, -2, -1, 1, 2])
  const { getPulseWindowRange } = require('../src/shared/components/PulseWaveHistory/pulseWaveWindow.ts')
  const axis = getPulseWindowRange(history.getSnapshot().points, 0)
  assert.ok(Math.abs((-4 - axis.minimum) / (axis.maximum - axis.minimum) - 0.1) < 1e-12)
  assert.ok(Math.abs((2 - axis.minimum) / (axis.maximum - axis.minimum) - 0.85) < 1e-12)
  history.dispose()
  assert.equal(history.append(batch({ sequence: 9 })), false)
  assert.deepEqual(history.getSnapshot().points, [])
})

test('原生未知保持占位，部分覆盖等待不推进，正式阶段及资源释放才决定检测和完成', () => {
  assert.equal(getFingertipPresentation(null), 'ready')
  assert.equal(getFingertipPresentation(snapshot()), 'ready')
  const partial = snapshot({ coverageState: 'partial', coveragePercent: 52 })
  for (let repeat = 0; repeat < 20; repeat += 1) assert.equal(getFingertipPresentation(partial), 'partial')
  assert.equal(partial.remainingMillis, 30_000)
  assert.equal(getFingertipPresentation(snapshot({ coverageState: 'complete', coveragePercent: 100 })), 'covered')
  assert.equal(getFingertipPresentation(snapshot({ phase: 'starting', coverageReady: true })), 'covered')
  assert.equal(getFingertipPresentation(snapshot({ phase: 'capturing', remainingMillis: 29_950 })), 'running')
  assert.equal(getFingertipPresentation(snapshot({ phase: 'completed' })), 'stopping')
  assert.equal(getFingertipPresentation(snapshot({ phase: 'completed', resourcesReleased: true })), 'completed')
  assert.equal(getFingertipPresentation(snapshot({ phase: 'interrupted', resourcesReleased: true })), 'interrupted')
})

test('普通提示连续稳定300ms才切换；抖动和同分类新数值不会重启稳定等待', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  const statuses = []
  const display = createFingertipDisplay((value) => statuses.push(value))
  display.update(snapshot())
  display.update(snapshot({ coverageState: 'partial', coveragePercent: 40 }))
  context.mock.timers.tick(200)
  display.update(snapshot())
  context.mock.timers.tick(100)
  assert.equal(display.getSnapshot().presentation, 'ready')
  display.update(snapshot({ coverageState: 'partial', coveragePercent: 60 }))
  context.mock.timers.tick(200)
  display.update(snapshot({ coverageState: 'partial', coveragePercent: 70 }))
  context.mock.timers.tick(99)
  assert.equal(display.getSnapshot().presentation, 'ready')
  context.mock.timers.tick(1)
  assert.equal(display.getSnapshot().presentation, 'partial')
  assert.equal(statuses.at(-1).presentation, 'partial')
  display.dispose()
})

test('覆盖以250ms固定尾沿保留最新实际值，父页只接收稳定提示、阶段和整秒', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  const statuses = []
  const display = createFingertipDisplay((value) => statuses.push(value))
  display.update(snapshot({ coverageState: 'partial', coveragePercent: 10 }))
  for (const percent of [30, 50]) {
    context.mock.timers.tick(100)
    display.update(snapshot({ coverageState: 'partial', coveragePercent: percent }))
  }
  context.mock.timers.tick(49)
  display.update(snapshot({ coverageState: 'partial', coveragePercent: 75 }))
  assert.equal(display.getSnapshot().coveragePercent, 10)
  assert.equal(statuses.length, 1)
  context.mock.timers.tick(1)
  assert.equal(display.getSnapshot().coveragePercent, 75)
  context.mock.timers.tick(50)
  assert.equal(statuses.length, 2)
  display.update(snapshot({ coverageState: 'partial', coveragePercent: 100 }))
  context.mock.timers.tick(200)
  assert.equal(display.getSnapshot().coveragePercent, 99)
  display.update(snapshot({ coverageState: 'unknown', coveragePercent: null }))
  context.mock.timers.tick(250)
  assert.equal(display.getSnapshot().coveragePercent, null)
  display.update(snapshot({ phase: 'capturing', remainingMillis: 29_999 }))
  const count = statuses.length
  display.update(snapshot({ phase: 'capturing', remainingMillis: 29_500, coveragePercent: 80, coverageState: 'partial' }))
  assert.equal(statuses.length, count)
  display.update(snapshot({ phase: 'capturing', remainingMillis: 29_000 }))
  assert.equal(statuses.at(-1).remainingSeconds, 29)
  assert.equal(statuses.length, count + 1)
  display.dispose()
})

test('开窗、收尾、完成和错误不等提示防抖，并立即冻结该阶段最新覆盖', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  const display = createFingertipDisplay(() => {})
  for (const [phase, presentation] of [['starting', 'covered'], ['capturing', 'running'], ['stopping', 'stopping'], ['completed', 'completed'], ['interrupted', 'interrupted'], ['failed', 'failed']]) {
    display.reset()
    display.update(snapshot({ coverageState: 'partial', coveragePercent: 40 }))
    context.mock.timers.tick(50)
    display.update(snapshot({ phase, resourcesReleased: phase === 'completed', coverageState: 'complete', coveragePercent: 100 }))
    assert.equal(display.getSnapshot().presentation, presentation)
    assert.equal(display.getSnapshot().coveragePercent, 100)
    context.mock.timers.tick(300)
    assert.equal(display.getSnapshot().presentation, presentation)
  }
  display.dispose()
})

test('取消、新轮和卸载撤销迟到提示，不把上一轮稳定等待带入未知覆盖', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  const display = createFingertipDisplay(() => {})
  display.update(snapshot({ coverageState: 'complete', coveragePercent: 100 }))
  context.mock.timers.tick(100)
  display.cancelPendingHints()
  display.update(snapshot({ coverageState: 'complete', coveragePercent: 100 }))
  context.mock.timers.tick(300)
  assert.equal(display.getSnapshot().presentation, 'ready')
  display.reset()
  display.update(snapshot({ coverageState: 'complete', coveragePercent: 100 }))
  context.mock.timers.tick(100)
  display.reset()
  display.update(snapshot({ captureId: 'round-2' }))
  context.mock.timers.tick(300)
  assert.equal(display.getSnapshot().presentation, 'ready')
  assert.equal(display.getSnapshot().coveragePercent, null)
  display.update(snapshot({ captureId: 'round-2', coverageState: 'partial', coveragePercent: 80 }))
  const frozen = display.getSnapshot()
  display.dispose()
  context.mock.timers.tick(300)
  assert.strictEqual(display.getSnapshot(), frozen)
})

test('指尖早期大异常离窗后按正常振幅留白；固定回看窗口不受后续极值影响', () => {
  const { getPulseWindowRange, selectPulseWindow } = require('../src/shared/components/PulseWaveHistory/pulseWaveWindow.ts')
  const history = createFingertipWaveform('round-1')
  history.append(batch({ timesMillis: [0, 40], values: [-1_000, 1_000] }))
  history.append(batch({ sequence: 1, timesMillis: [7_000, 7_040], values: [2, 8] }))
  const range = (start) => getPulseWindowRange(selectPulseWindow(history.getSnapshot().points, start, 200), start)
  const normal = range(1_040)
  assert.ok(Math.abs((-8 - normal.minimum) / (normal.maximum - normal.minimum) - 0.1) < 1e-12)
  assert.ok(Math.abs((-2 - normal.minimum) / (normal.maximum - normal.minimum) - 0.85) < 1e-12)
  const early = range(0)
  history.append(batch({ sequence: 2, timesMillis: [15_000, 15_040], values: [-99_000, 99_000] }))
  assert.deepEqual(range(1_040), normal)
  assert.deepEqual(range(0), early)
})

/** 构造来自设备查询的明确能力，未支持与未知必须保持不同事实。 */
function cameraCapabilities(torchValue = true) {
  const mode = (modes) => ({ status: 'supported', modes, unknownModes: [], reason: null })
  const numeric = { status: 'supported', range: { minimum: -2, maximum: 2, step: null }, reason: null }
  return {
    cameraId: 'back', torch: { status: 'supported', value: torchValue, reason: null },
    exposureModes: mode(['auto']), whiteBalanceModes: mode(['auto']), focusModes: mode(['auto', 'off']),
    exposureCompensationIndex: numeric, exposureTimeNanos: numeric, iso: numeric, focusDistanceDiopters: numeric,
    aeLock: { status: 'supported', value: true, reason: null }, awbLock: { status: 'unsupported', value: false, reason: null },
  }
}
const cameraOptions = {
  cameraId: 'back', processing: { maxBlockCount: 64, maxRows: 8, maxColumns: 8 },
  options: [
    { resolution: { width: 1_280, height: 720 }, compatibility: 'supported', fpsRanges: [{ minimum: 15, maximum: 30 }] },
    { resolution: { width: 720, height: 720 }, compatibility: 'supported', fpsRanges: [{ minimum: 30, maximum: 30 }] },
  ],
}

test('能力驱动真实后摄配置，补光明确支持才开启；无补光仍可准备检测', async () => {
  const config = buildFingertipCameraConfig(cameraCapabilities(), cameraOptions)
  assert.deepEqual(config.targetResolution, { width: 720, height: 720 })
  assert.equal(config.targetFps, 30)
  assert.equal(config.torchEnabled, true)
  assert.deepEqual(config.processing.blocks, [1, 1])
  assert.equal(config.exposure.locked, true)
  assert.equal(config.whiteBalance.locked, false)
  assert.equal(config.focus.mode, 'auto')
  for (const torch of [
    { status: 'supported', value: false, reason: null },
    { status: 'unsupported', value: false, reason: null },
    { status: 'unknown', value: null, reason: null },
  ]) {
    const withoutTorch = buildFingertipCameraConfig({ ...cameraCapabilities(), torch }, cameraOptions)
    assert.equal(withoutTorch.cameraId, 'back')
    assert.equal(withoutTorch.torchEnabled, false)
    assert.deepEqual(withoutTorch.processing.blocks, [1, 1])
  }
  await assert.rejects(prepareFingertipCameraConfig({ async listCameras() { return [{ cameraId: 'front', facing: 'front' }] } }), (error) => error.code === 'FINGERTIP_BACK_CAMERA_UNAVAILABLE')
  const queries = []
  const prepared = await prepareFingertipCameraConfig({
    async listCameras() { return [{ cameraId: 'front', facing: 'front' }, { cameraId: 'back', facing: 'back' }] },
    async getCameraCapabilities(id) { assert.equal(id, 'back'); return cameraCapabilities() },
    async getSupportedCaptureOptions(id, request) { queries.push([id, request]); return cameraOptions },
  })
  assert.equal(prepared.cameraId, 'back')
  assert.deepEqual(queries.at(-1), ['back', { targetResolution: prepared.targetResolution, targetFps: prepared.targetFps }])
})

test('启动确认迟到也保存已接收的本轮真实尾批，其他轮次不进入历史', async () => {
  const start = Promise.withResolvers()
  const state = harness({ start })
  const preparing = state.controller.prepare()
  await state.mounted
  state.controller.previewReady()
  await state.started
  state.pulse(batch({ captureId: 'old-round' }))
  state.pulse(batch())
  state.pulse(batch({ sequence: 1, timesMillis: [1_066], values: [-1] }))
  start.resolve()
  await preparing
  assert.deepEqual(state.history.getSnapshot().points, [[1_000, 2], [1_033, 4], [1_066, -1]])
  await state.controller.close()
})

test('尚未前台时离开不发权限请求，布局等待期真正后台后不自动恢复准备', async () => {
  const first = harness()
  first.foreground(false)
  const waiting = first.controller.prepare()
  await first.controller.close()
  first.foreground(true)
  await waiting
  assert.deepEqual(first.events, ['close'])

  const state = harness()
  const preparing = state.controller.prepare()
  await state.mounted
  state.foreground(false)
  await preparing
  state.foreground(true)
  state.controller.previewReady()
  assert.equal(state.interrupted, 1)
  assert.equal(state.events.includes('open'), false)
  await state.controller.close()
})
