// 从公共客户端驱动控制结果、订阅生命周期及异步屏障，不检查源码接线或模拟原生算法。
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

const clientPath = path.resolve(__dirname, '../../../packages/acquisition/src/ppg/client.ts')
const clientCode = ts.transpileModule(readFileSync(clientPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: clientPath,
}).outputText

/** 只替换平台边界；实际执行生产客户端和配置校验器，不启动设备。 */
function loadClient(native) {
  let permissionRequests = 0
  const module = { exports: {} }
  const load = (name) => {
    if (name === 'react-native-nitro-modules') {
      return { NitroModules: { createHybridObject: () => native } }
    }
    if (name === 'react-native') {
      return {
        Platform: { OS: 'android' },
        PermissionsAndroid: {
          PERMISSIONS: { CAMERA: 'camera' }, RESULTS: { GRANTED: 'granted' },
          request: async () => { permissionRequests += 1; return 'granted' },
        },
      }
    }
    if (name === './CameraConfigValidator') {
      return require('../../../packages/acquisition/src/ppg/CameraConfigValidator.ts')
    }
    throw new Error(`测试未声明的依赖：${name}`)
  }
  vm.runInThisContext(`(function(require, module, exports) {${clientCode}\n})`, { filename: clientPath })(load, module, module.exports)
  return { ...module.exports, permissionRequests: () => permissionRequests }
}

/** 可手动完成的边界用于证明客户端确实等待原生屏障。 */
function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

function nativeBoundary(overrides = {}) {
  let deviceCommands = 0
  const listeners = new Map()
  let listenerId = 0
  return {
    native: {
      getBloodPressureSnapshot: () => null,
      addBloodPressureListener: (listener) => {
        const id = ++listenerId
        listeners.set(id, listener)
        listener(null)
        return id
      },
      removeBloodPressureListener: (id) => listeners.delete(id),
      openCamera: async () => { deviceCommands += 1; return { errorCode: null, errorMessage: null } },
      startCapture: async () => { deviceCommands += 1; return { errorCode: null, errorMessage: null } },
      startFingertipCapture: async () => { deviceCommands += 1; return { captureId: 'finger', errorCode: null, errorMessage: null } },
      startBloodPressureCapture: async () => { deviceCommands += 1; return { captureId: 'blood', errorCode: null, errorMessage: null } },
      stopBloodPressureCapture: async () => { deviceCommands += 1; return { errorCode: null, errorMessage: null } },
      closeCamera: async () => { deviceCommands += 1; return { errorCode: null, errorMessage: null } },
      ...overrides,
    },
    listeners,
    deviceCommands: () => deviceCommands,
  }
}

test('创建、空快照读取和订阅解除均不请求权限或执行设备控制', () => {
  const boundary = nativeBoundary()
  const api = loadClient(boundary.native)
  const client = api.createAcquisitionClient()
  assert.equal(client.getBloodPressureSnapshot(), null)
  const observed = []
  const unsubscribe = client.subscribeBloodPressure((snapshot) => observed.push(snapshot))
  assert.deepEqual(observed, [null])
  assert.equal(boundary.listeners.size, 1)
  unsubscribe()
  assert.equal(boundary.listeners.size, 0)
  assert.equal(boundary.deviceCommands(), 0)
  assert.equal(api.permissionRequests(), 0)
})

test('真实控制失败先于缺失身份错误，消费者保留原生错误码和根因', async () => {
  const boundary = nativeBoundary({
    startBloodPressureCapture: async () => ({ captureId: null, errorCode: 'SENSOR_BUSY', errorMessage: '加速度计由独立会话占用。' }),
  })
  const api = loadClient(boundary.native)
  const client = api.createAcquisitionClient()
  await assert.rejects(client.startBloodPressureCapture({ durationMillis: 30_000 }), (error) => {
    assert.ok(error instanceof api.AcquisitionError)
    assert.equal(error.code, 'SENSOR_BUSY')
    assert.equal(error.message, '加速度计由独立会话占用。')
    return true
  })
})

test('原生拒绝与取消不改写成通用启动失败或自动重试', async () => {
  const cause = new Error('原生命令已取消')
  let attempts = 0
  const boundary = nativeBoundary({ startBloodPressureCapture: async () => { attempts += 1; throw cause } })
  const api = loadClient(boundary.native)
  await assert.rejects(api.createAcquisitionClient().startBloodPressureCapture({ durationMillis: 30_000 }), (error) => error === cause)
  assert.equal(attempts, 1)
})

test('无原生错误但未给出轮次身份不能视为启动成功', async () => {
  const boundary = nativeBoundary({ startBloodPressureCapture: async () => ({ captureId: null, errorCode: null, errorMessage: null }) })
  const api = loadClient(boundary.native)
  await assert.rejects(api.createAcquisitionClient().startBloodPressureCapture({ durationMillis: 30_000 }), { code: 'MISSING_CAPTURE_ID' })
})

test('停止等待确切轮次的原生屏障，失败保留根因且不擅自关闭其他资源', async () => {
  const barrier = deferred()
  const calls = []
  const boundary = nativeBoundary({ stopBloodPressureCapture: (id) => { calls.push(id); return barrier.promise } })
  const api = loadClient(boundary.native)
  const client = api.createAcquisitionClient()
  let finished = false
  const stopping = client.stopBloodPressureCapture('blood-previous').finally(() => { finished = true })
  await Promise.resolve()
  assert.equal(finished, false)
  assert.deepEqual(calls, ['blood-previous'])
  barrier.resolve({ errorCode: 'SENSOR_OUTPUT_FAILED', errorMessage: '本轮 ACC 定稿失败。' })
  await assert.rejects(stopping, { code: 'SENSOR_OUTPUT_FAILED', message: '本轮 ACC 定稿失败。' })
  assert.equal(boundary.deviceCommands(), 0)
})

test('解除订阅不取消已发启动；close 失败可由调用方显式重试并等待释放', async () => {
  const starting = deferred()
  const closing = deferred()
  let closeAttempts = 0
  const boundary = nativeBoundary({
    startBloodPressureCapture: () => starting.promise,
    closeCamera: () => ++closeAttempts === 1
      ? Promise.resolve({ errorCode: 'CAMERA_RELEASE_FAILED', errorMessage: '解绑失败。' })
      : closing.promise,
  })
  const api = loadClient(boundary.native)
  const client = api.createAcquisitionClient()
  const unsubscribe = client.subscribeBloodPressure(() => {})
  const start = client.startBloodPressureCapture({ durationMillis: 30_000 })
  unsubscribe()
  starting.resolve({ captureId: 'blood-current', errorCode: null, errorMessage: null })
  assert.equal(await start, 'blood-current')
  await assert.rejects(client.closeCamera(), { code: 'CAMERA_RELEASE_FAILED', message: '解绑失败。' })
  assert.equal(closeAttempts, 1)
  let released = false
  const retry = client.closeCamera().then(() => { released = true })
  await Promise.resolve()
  assert.equal(released, false)
  closing.resolve({ errorCode: null, errorMessage: null })
  await retry
  assert.equal(released, true)
  assert.equal(closeAttempts, 2)
})
