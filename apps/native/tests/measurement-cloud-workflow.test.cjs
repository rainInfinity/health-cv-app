// 消费公开业务控制器，验证真实文件链、写入不确定性及会话边界。
const assert = require('node:assert/strict')
const { test } = require('node:test')
const base = '../node_modules/.cache/native-test/'
const { createCloudMeasurementWorkflow } = require(`${base}app/measurement/cloudWorkflow.js`)
const { findCloudMeasurementPlan } = require(`${base}app/measurement/cloudPlan.js`)
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const model = { modelId: 7, modelCode: 'ppg.active.offline.all', requiredInputs: ['ppg'], isExample: false, versionId: 8, version: 'catalog' }
const task = (status = 'SUCCEEDED') => ({ taskId: 42, modelId: 7, modelCode: model.modelCode, modelName: '统一场景', versionId: 9, version: 'fixed', status, isExample: false, createdAt: '2026-11-23 08:30:00', submittedAt: '2026-11-23 08:31:00', startedAt: null, finishedAt: null, measurement: null, qualityFailure: null, result: {
  outcome: 'ALL_SUCCEEDED', results: {
    hr_br: { algorithmKey: 'ppg.active.offline.hr_br.v1', status: 'SUCCEEDED', result: { hr: 72, br: 16, quality: { score: 88, threshold: 70 } }, failureCode: null, failureMessage: null, qualityFailure: null },
    spo2: { algorithmKey: 'ppg.active.offline.spo2.v1', status: 'SUCCEEDED', result: { spo2: 98, quality: { score: 82, threshold: 70 } }, failureCode: null, failureMessage: null, qualityFailure: null },
    diabetes: { algorithmKey: 'ppg.active.offline.diabetes.v1', status: 'SUCCEEDED', result: { prob: .55, risk_level: 0, quality: { score: 81, threshold: 70 } }, failureCode: null, failureMessage: null, qualityFailure: null },
  },
} })
const completed = (overrides = {}) => ({ captureId: 'capture-1', sessionId: 'ppg-1', phase: 'completed', endReason: 'duration_reached', errorCode: null, resourcesReleased: true, elapsedMillis: 30017, artifact: { sessionId: 'ppg-1', files: [{ kind: 'ppg', path: '/round/ppg.csv', sizeBytes: 100 }, { kind: 'frame', path: '/round/frame.csv', sizeBytes: 50 }] }, ...overrides })
function harness(overrides = {}) {
  let generation = 1
  let identityChanged = () => {}
  const calls = [], states = [], invalidations = [], timers = []
  const auth = {
    state: { subscribe(callback) { identityChanged = callback; return () => {} } },
    isAuthenticatedAt: (expected) => generation === expected,
    getSessionGeneration: () => generation,
    async runProtected(action, options, expected) { if (expected !== generation) throw Error('session'); return action(options) },
  }
  const client = { tasks: {
    async create(input) { calls.push(['create', input]); return task('DRAFT') },
    async uploadFile(id, input, options) { calls.push(['upload', id, input, options]); return { fileId: calls.length, logicalName: input.logicalName, sizeBytes: 100, uploadedAt: '2026-11-23 08:30:00', isSelected: true } },
    async submit(id, input) { calls.push(['submit', id, input]); return task('SUBMITTED') },
    async getById(id) { calls.push(['get', id]); return task() },
    async list() { calls.push(['list']); return { items: [], total: 0, offset: 0, limit: 20 } },
    ...overrides,
  } }
  const dependencies = { client, auth, invalidateMeasurements: (value) => invalidations.push(value), onChange: (value) => states.push(value), setTimeout(callback, delay) { const timer = { callback, delay, cancelled: false }; timers.push(timer); return timer }, clearTimeout(timer) { timer.cancelled = true } }
  const workflow = createCloudMeasurementWorkflow(dependencies)
  workflow.setVisible(true)
  workflow.begin('capture-1', 'fingertip', model, 1)
  return { workflow, dependencies, calls, states, invalidations, timers, changeIdentity() { generation++; identityChanged() } }
}

test('正常完整收尾仅创建一次，PPG直接URI上传，实际正式时长提交，固定版本来自创建回执', async () => {
  const h = harness()
  h.workflow.update(completed()); h.workflow.update(completed())
  await flush()
  assert.deepEqual(h.calls.map((call) => call[0]), ['create', 'upload', 'submit', 'get'])
  assert.deepEqual(h.calls[1][2], { logicalName: 'ppg', file: { uri: '/round/ppg.csv', name: 'ppg.csv', type: 'text/csv' } })
  assert.deepEqual(h.calls[2][2], { measurement: { captureMethod: 'fingertip', captureMode: 'active', durationMs: 30017 } })
  assert.equal(h.workflow.getSnapshot().fixedTask.versionId, 9)
  assert.equal(h.workflow.getSnapshot().receipts.length, 1)
  assert.equal(h.workflow.getSnapshot().phase, 'terminal')
  assert.deepEqual(h.invalidations, [1])
  h.workflow.dispose()
})

test('联合场景必须同轮PPG与ACC完成，依序上传而不上传frame或gyro', async () => {
  const h = harness()
  h.workflow.begin('capture-1', 'chest', { ...model, modelCode: 'ppg_acc.active.offline.all', requiredInputs: ['ppg', 'acc'] }, 1)
  h.workflow.update(completed({ accSessionId: 'acc-1', accArtifact: null })); await flush()
  assert.equal(h.calls.length, 0)
  h.workflow.update(completed({ accSessionId: 'acc-1', accArtifact: { kind: 'accelerometer', sessionId: 'wrong', path: '/round/acc.csv', sizeBytes: 10 } })); await flush()
  assert.equal(h.calls.length, 0)
  h.workflow.update(completed({ accSessionId: 'acc-1', accArtifact: { kind: 'accelerometer', sessionId: 'acc-1', path: '/round/acc.csv', sizeBytes: 10 } })); await flush()
  assert.deepEqual(h.calls.filter((call) => call[0] === 'upload').map((call) => call[2].logicalName), ['ppg', 'acc'])
  assert.equal(h.calls.find((call) => call[0] === 'submit')[2].measurement.captureMethod, 'fingertip_chest')
  h.workflow.dispose()
})

test('归零、失败、单文件、历史产物或未释放均不触发任何云端写入', async () => {
  for (const patch of [ { phase: 'stopping' }, { resourcesReleased: false }, { errorCode: 'FILE_FAILED' }, { endReason: 'coverage_lost' }, { elapsedMillis: 0 }, { artifact: null }, { artifact: { sessionId: 'old', files: completed().artifact.files } }, { artifact: { sessionId: 'ppg-1', files: [completed().artifact.files[0]] } } ]) {
    const h = harness(); h.workflow.update(completed(patch)); await flush(); assert.equal(h.calls.length, 0); h.workflow.dispose()
  }
})

test('提交超时先查询已知任务，已接受不重放提交', async () => {
  let submits = 0
  const h = harness({ async submit() { submits++; throw Error('timeout') } })
  h.workflow.update(completed()); await flush()
  assert.equal(submits, 1)
  assert.equal(h.workflow.getSnapshot().taskId, 42)
  assert.equal(h.workflow.getSnapshot().phase, 'terminal')
  assert.equal(h.calls.filter((call) => call[0] === 'create').length, 1)
  h.workflow.dispose()
})

test('创建和上传不确定不自动重放，已知草稿重新查询也不提交', async () => {
  let creates = 0
  const a = harness({ async create() { creates++; throw Error('timeout') } })
  a.workflow.update(completed()); a.workflow.update(completed()); await flush()
  assert.equal(creates, 1); assert.equal(a.workflow.getSnapshot().failure, 'creation'); assert.equal(a.calls.some((call) => call[0] === 'list'), false); a.workflow.dispose()
  let uploads = 0
  const b = harness({ async uploadFile() { uploads++; throw Error('timeout') }, async getById() { return task('DRAFT') } })
  b.workflow.update(completed()); await flush(); await b.workflow.requery()
  assert.equal(uploads, 1); assert.equal(b.calls.filter((call) => call[0] === 'submit').length, 0); assert.equal(b.workflow.getSnapshot().phase, 'error'); b.workflow.dispose()
})

test('上传失败后恢复前台保留任务创建失败，不查询详情或重放写入', async () => {
  let uploads = 0, reads = 0
  const h = harness({
    async uploadFile() { uploads++; throw Error('timeout') },
    async getById() { reads++; throw Error('offline') },
  })
  h.workflow.update(completed()); await flush()
  const failed = h.workflow.getSnapshot()
  assert.equal(failed.taskId, 42)
  assert.equal(failed.phase, 'error')
  assert.equal(failed.failure, 'creation')
  h.workflow.setVisible(false); h.workflow.setVisible(true); await flush()
  assert.equal(h.workflow.getSnapshot().phase, 'error')
  assert.equal(h.workflow.getSnapshot().failure, 'creation')
  assert.equal(reads, 0)
  assert.equal(uploads, 1)
  assert.deepEqual(h.calls.map(([name]) => name), ['create'])
  h.workflow.dispose()
})

test('上传途中离页或换号取消本地请求，迟到回执不能继续提交或回填', async () => {
  for (const change of ['cancel', 'identity']) {
    const wait = deferred(); let uploadSignal
    const h = harness({ uploadFile(id, input, options) { uploadSignal = options.signal; return wait.promise } })
    h.workflow.update(completed()); await flush()
    if (change === 'cancel') h.workflow.cancel(); else h.changeIdentity()
    assert.equal(uploadSignal.aborted, true)
    wait.resolve({ fileId: 8, logicalName: 'ppg', sizeBytes: 10, isSelected: true }); await flush()
    assert.equal(h.workflow.getSnapshot().phase, 'idle'); assert.equal(h.calls.filter((call) => call[0] === 'submit').length, 0); assert.deepEqual(h.invalidations, []); h.workflow.dispose()
  }
})

test('后台暂停后续写动作，恢复先查询，不补传不重放写入', async () => {
  const wait = deferred()
  const h = harness({ uploadFile() { return wait.promise }, async getById() { return task('DRAFT') } })
  h.workflow.update(completed()); await flush(); h.workflow.setVisible(false)
  h.workflow.setVisible(true)
  wait.resolve({ fileId: 8, logicalName: 'ppg', sizeBytes: 10, isSelected: true }); await flush()
  assert.equal(h.calls.filter((call) => call[0] === 'submit').length, 0)
  assert.equal(h.workflow.getSnapshot().task.status, 'DRAFT')
  h.workflow.dispose()
})

test('仅可见SUBMITTED/RUNNING非重叠两秒查询，失败停循环且保留最后状态', async () => {
  const next = deferred(); let gets = 0
  const h = harness({ getById() { gets++; return gets === 1 ? Promise.resolve(task('RUNNING')) : next.promise } })
  h.workflow.update(completed()); await flush()
  assert.equal(h.timers.length, 1); assert.equal(h.timers[0].delay, 2000)
  h.timers[0].callback(); await flush(); await h.workflow.requery(); assert.equal(gets, 2)
  next.reject(Error('offline')); await flush()
  assert.equal(h.workflow.getSnapshot().phase, 'error'); assert.equal(h.workflow.getSnapshot().task.status, 'RUNNING'); assert.equal(h.timers.length, 1)
  h.workflow.setVisible(false); await h.workflow.requery(); assert.equal(gets, 2)
  h.workflow.dispose()
})

test('任务失败或ALL_FAILED不会失效健康记录而覆盖此前有效结果', async () => {
  const h = harness({ async getById() { return task('FAILED') } })
  h.workflow.update(completed()); await flush(); assert.deepEqual(h.invalidations, []); h.workflow.dispose()
})

test('显式场景遍历目录分页，只接受精确编码、非示例及正确输入', async () => {
  const offsets = []
  const auth = { runProtected: (action, options) => action(options) }
  const client = { models: { async list({ offset }) { offsets.push(offset); return offset === 0 ? { items: [{ ...model, modelCode: 'ppg.active.offline.hr_br' }], offset: 0, limit: 1, total: 2 } : { items: [model], offset: 1, limit: 1, total: 2 } } } }
  assert.equal((await findCloudMeasurementPlan(client, auth, 'fingertip', 1)).modelId, 7)
  assert.deepEqual(offsets, [0, 1])
  for (const invalid of [{ ...model, isExample: true }, { ...model, requiredInputs: ['ppg', 'acc'] }, { ...model, modelCode: 'ppg.active.offline.hr_br' }]) {
    await assert.rejects(findCloudMeasurementPlan({ models: { list: async () => ({ items: [invalid], offset: 0, limit: 100, total: 1 }) } }, auth, 'fingertip', 1))
  }
})

test('提交未知且草稿归任务创建失败，查询失败和不支持载荷归结果获取失败且仅重查原任务', async () => {
  for (const scenario of ['draft', 'query', 'payload']) {
    let reads = 0
    const h = harness({
      async submit() { throw Error('timeout') },
      async getById(id) {
        assert.equal(id, 42)
        reads++
        if (scenario === 'query' && reads === 1) throw Error('offline')
        return scenario === 'draft' ? task('DRAFT') : scenario === 'payload' && reads === 1 ? { ...task(), result: {} } : task()
      },
    })
    h.workflow.update(completed()); await flush()
    assert.equal(h.workflow.getSnapshot().failure, scenario === 'draft' ? 'creation' : 'query')
    assert.deepEqual(h.invalidations, [])
    const writes = h.calls.filter(([name]) => name !== 'get')
    if (scenario !== 'draft') {
      await h.workflow.requery()
      assert.equal(h.workflow.getSnapshot().phase, 'terminal')
      assert.deepEqual(h.calls.filter(([name]) => name !== 'get'), writes)
      assert.equal(reads, 2)
    }
    h.workflow.dispose()
  }
})

module.exports = { harness, completed, flush, model, task }
