// 消费共用入口Hook，只有身份与目录通过才允许导航或启动。
const assert = require('node:assert/strict')
const { test } = require('node:test')
const Module = require('node:module')
const base = '../node_modules/.cache/native-test/'
function harness({ status = 'authenticated', modelFails = false } = {}) {
  let generation = 1, identity = { status, userId: 7, username: 'member' }, cleanup
  const calls = [], notices = []
  const auth = { state: { get: () => identity }, getSessionGeneration: () => generation, isAuthenticatedAt: (value) => identity.status === 'authenticated' && generation === value }
  const services = { auth, measurements: { async prepare(method) { calls.push(['model', method]); if (modelFails) throw Error('missing-model') } } }
  const load = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'react') return { useCallback: (fn) => fn, useRef: (value) => ({ current: value }) }
    if (request === '@react-navigation/native') return { useNavigation: () => ({ navigate: (name) => calls.push(['navigate', name]) }), useFocusEffect(callback) { cleanup = callback() } }
    if (request === '../bootstrap') return { appServices: services }
    if (request === '@/shared/components/FeedbackHost') return { useFeedback: () => ({ showToast(value) { notices.push(value) } }) }
    return load.call(this, request, parent, isMain)
  }
  const location = require.resolve(`${base}app/measurement/useMeasurementAccess.js`)
  delete require.cache[location]
  let check
  try { check = require(location).useMeasurementAccess() } finally { Module._load = load }
  return { check, calls, notices, blur() { cleanup() }, changeAccount(userId) { generation++; identity = { status: 'authenticated', userId, username: 'other' } } }
}

test('未登录、恢复中与不可确认均不访问目录、不启动；仅游客进入现有登录', async () => {
  for (const status of ['anonymous', 'restoring', 'unavailable']) {
    const h = harness({ status })
    assert.equal(await h.check('fingertip'), false)
    assert.equal(h.calls.filter((call) => call[0] === 'model').length, 0)
    assert.deepEqual(h.calls.filter((call) => call[0] === 'navigate'), status === 'anonymous' ? [['navigate', 'Login']] : [])
  }
})

test('已登录账号首次开始直接检查统一目录，两种接触方式都不增加确认步骤', async () => {
  const h = harness()
  assert.equal(await h.check('fingertip'), true)
  assert.equal(await h.check('chest'), true)
  assert.deepEqual(h.calls, [['model', 'fingertip'], ['model', 'chest']])
})

test('目录准备期间换号或离页不能继续本次开始', async () => {
  const h = harness()
  const changing = h.check('chest'); h.changeAccount(9)
  assert.equal(await changing, false)
  assert.deepEqual(h.calls, [['model', 'chest']])
  const leave = harness(); const pending = leave.check('fingertip'); leave.blur()
  assert.equal(await pending, false)
  assert.deepEqual(leave.calls, [['model', 'fingertip']])
})

test('准备跳过不能替代云端门控，缺场景不放行；面部本地路径不查询或上传', async () => {
  const h = harness({ modelFails: true })
  assert.equal(await h.check('fingertip'), false)
  assert.deepEqual(h.calls, [['model', 'fingertip']])
  assert.equal(await h.check('face'), true)
  assert.equal(h.calls.length, 1)
})
