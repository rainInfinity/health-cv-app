// 验证产品与开发页共用聚焦离页注册，深链必须等待命令及关闭屏障。

const assert = require('node:assert/strict');
const test = require('node:test');
const { createAcquisitionLeaveGuard } = require('../node_modules/.cache/native-test/app/navigation/acquisitionLeaveGuard.js');
const { registerRPPGLeaveRequest, requestRPPGLeave } = require('../node_modules/.cache/native-test/app/navigation/rppgNavigationGuard.js');

test('产品页交给开发页后，旧页取消注册不会移除当前所有者', () => {
  const requests = [];
  const unregisterProduct = registerRPPGLeaveRequest(() => requests.push('product'));
  const unregisterDev = registerRPPGLeaveRequest(() => requests.push('dev'));
  unregisterProduct();
  assert.equal(requestRPPGLeave(() => undefined), true);
  assert.deepEqual(requests, ['dev']);
  unregisterDev();
  assert.equal(requestRPPGLeave(() => undefined), false);
});

test('产品面部深链等待启动命令和关闭，失败留页且再次请求可重试', async () => {
  const command = Promise.withResolvers();
  const closeStarted = Promise.withResolvers();
  const close = Promise.withResolvers();
  let operation;
  let closeCount = 0;
  let continued = false;
  const failures = [];
  const guard = createAcquisitionLeaveGuard({
    waitForCameraCommand: () => command.promise,
    getSessionGeneration: () => 1,
    isCameraActive: () => true,
    closeCamera: async () => {
      closeCount += 1;
      closeStarted.resolve();
      if (closeCount === 1) await close.promise;
    },
    onReady: (action) => action(),
    onFailure: (error) => failures.push(error),
  });
  const unregister = registerRPPGLeaveRequest((action) => { operation = guard.request(action); });
  try {
    assert.equal(requestRPPGLeave(() => { continued = true; }), true);
    assert.equal(closeCount, 0);
    command.resolve();
    await closeStarted.promise;
    assert.equal(continued, false);
    close.reject(new Error('文件尚未排空'));
    await operation;
    assert.equal(continued, false);
    assert.equal(failures.length, 1);
    assert.equal(requestRPPGLeave(() => { continued = true; }), true);
    await operation;
    assert.equal(continued, true);
    assert.equal(closeCount, 2);
  } finally {
    unregister();
    guard.dispose();
  }
});
