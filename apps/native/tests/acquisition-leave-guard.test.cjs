// 验证主动相机离页期间的关闭合并、失败保留与迟到结果隔离。

const assert = require('node:assert/strict');
const test = require('node:test');
const { createAcquisitionLeaveGuard } = require('../node_modules/.cache/native-test/app/navigation/acquisitionLeaveGuard.js');

function deferred() {
  return Promise.withResolvers();
}

function createGuard(overrides = {}) {
  const state = {
    generation: 1,
    active: true,
    closeCalls: 0,
    ready: [],
    failures: [],
  };
  const guard = createAcquisitionLeaveGuard({
    waitForCameraCommand: async () => {},
    getSessionGeneration: () => state.generation,
    isCameraActive: () => state.active,
    async closeCamera() {
      state.closeCalls += 1;
      state.active = false;
    },
    onReady: (action) => state.ready.push(action),
    onFailure: (error) => state.failures.push(error),
    ...overrides(state),
  });
  return { guard, state };
}

test('并发离页请求共用一次关闭并只执行最新导航意图', async () => {
  const closing = deferred();
  const closeStarted = deferred();
  const { guard, state } = createGuard(() => ({
    async closeCamera() {
      state.closeCalls += 1;
      closeStarted.resolve();
      await closing.promise;
      state.active = false;
    },
  }));

  const first = guard.request('back');
  const repeated = guard.request('passive-deep-link');
  assert.strictEqual(repeated, first);
  await closeStarted.promise;
  assert.equal(state.closeCalls, 1);
  assert.deepEqual(state.ready, []);

  closing.resolve();
  await first;
  assert.deepEqual(state.ready, ['passive-deep-link']);
  assert.deepEqual(state.failures, []);
});
test('深链继续动作等待主动相机完成收尾后才执行', async () => {
  const closing = deferred();
  const closeStarted = deferred();
  let continued = false;
  const { guard, state } = createGuard((current) => ({
    async closeCamera() {
      current.closeCalls += 1;
      closeStarted.resolve();
      await closing.promise;
      current.active = false;
    },
    onReady(action) {
      if (typeof action === 'function') action();
      else current.ready.push(action);
    },
  }));

  const leave = guard.request(() => {
    continued = true;
  });
  await closeStarted.promise;
  assert.equal(continued, false);

  closing.resolve();
  await leave;
  assert.equal(continued, true);
  assert.equal(state.active, false);
  assert.equal(state.closeCalls, 1);
  assert.deepEqual(state.failures, []);
});


test('关闭失败不放行导航，新的明确请求可以重试', async () => {
  const closeError = new Error('camera close failed');
  const { guard, state } = createGuard((current) => ({
    async closeCamera() {
      current.closeCalls += 1;
      if (current.closeCalls === 1) throw closeError;
      current.active = false;
    },
  }));

  await guard.request('back');
  assert.deepEqual(state.ready, []);
  assert.deepEqual(state.failures, [closeError]);

  await guard.request('retry-back');
  assert.deepEqual(state.ready, ['retry-back']);
  assert.deepEqual(state.failures, [closeError]);
  assert.equal(state.closeCalls, 2);
});

test('等待旧相机命令时会话代次变化后不关闭新会话', async () => {
  const command = deferred();
  const waitStarted = deferred();
  const { guard, state } = createGuard((current) => ({
    waitForCameraCommand() {
      waitStarted.resolve();
      return command.promise;
    },
  }));

  const leave = guard.request('passive-deep-link');
  await waitStarted.promise;
  state.generation += 1;
  state.active = true;
  command.resolve();
  await leave;

  assert.equal(state.closeCalls, 0);
  assert.deepEqual(state.ready, []);
  assert.equal(state.failures.length, 1);
});

test('组件卸载后迟到的关闭结果不执行旧导航', async () => {
  const closing = deferred();
  const closeStarted = deferred();
  const { guard, state } = createGuard(() => ({
    async closeCamera() {
      state.closeCalls += 1;
      closeStarted.resolve();
      await closing.promise;
      state.active = false;
    },
  }));

  const leave = guard.request('stale-back');
  await closeStarted.promise;
  guard.dispose();
  closing.resolve();
  await leave;

  assert.deepEqual(state.ready, []);
  assert.deepEqual(state.failures, []);
});
