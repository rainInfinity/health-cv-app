// 验证离线写操作立即执行失败且网络恢复不重放。

const assert = require('node:assert/strict');
const test = require('node:test');
const { onlineManager } = require('@tanstack/react-query');
const { createAppQueryClient } = require('../node_modules/.cache/native-test/app/query/client.js');

test('离线 mutation 不暂停排队，失败后网络恢复不重放', async (t) => {
  const queryClient = createAppQueryClient();
  queryClient.mount();
  onlineManager.setOnline(true);
  t.after(() => {
    queryClient.unmount();
    queryClient.clear();
    onlineManager.setOnline(true);
  });

  onlineManager.setOnline(false);
  let attempts = 0;
  const networkError = Object.assign(new Error('网络不可用'), { kind: 'network' });
  const mutation = queryClient.getMutationCache().build(queryClient, {
    mutationKey: ['test', 'offline-write'],
    mutationFn: async () => {
      attempts += 1;
      throw networkError;
    },
  });
  const outcome = mutation.execute({}).then(
    () => ({ error: null }),
    (error) => ({ error }),
  );

  await new Promise((resolve) => setImmediate(resolve));
  const pausedWhileOffline = mutation.state.isPaused;
  const attemptsBeforeReconnect = attempts;
  onlineManager.setOnline(true);
  const result = await outcome;

  assert.equal(pausedWhileOffline, false);
  assert.equal(attemptsBeforeReconnect, 1);
  assert.equal(result.error, networkError);
  assert.equal(mutation.state.status, 'error');
  assert.equal(attempts, 1);
});
