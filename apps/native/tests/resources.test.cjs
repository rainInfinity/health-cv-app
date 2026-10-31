// 验证服务端查询的认证门控、缓存隔离与资料写回。

const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const { QueryObserver } = require('@tanstack/react-query');
const { createAppQueryClient } = require('../node_modules/.cache/native-test/app/query/client.js');

const { createAuthScope } = require('../node_modules/.cache/native-test/app/auth/scope.js');
const { createAppQueries } = require('../node_modules/.cache/native-test/app/query/resources.js');
const {
  createServerQueryKeys,
  isScopedServerKey,
} = require('../node_modules/.cache/native-test/app/query/keys.js');
const {
  apiError,
  clearHarnessQueryClients,
  createHarness,
  deferred,
  tokens,
} = require('./helpers.cjs');
afterEach(clearHarnessQueryClients);

test('查询键按服务、渠道和会话代次隔离', () => {
  const scope = createAuthScope('https://service.example/', 'android-cn');
  const otherScope = createAuthScope('https://service.example', 'ios-cn');
  const current = createServerQueryKeys(scope, 4);
  const nextSession = createServerQueryKeys(scope, 5);
  const otherChannel = createServerQueryKeys(otherScope, 4);

  assert.notDeepEqual(current.profile, nextSession.profile);
  assert.notDeepEqual(current.profile, otherChannel.profile);
  assert.equal(isScopedServerKey(current.profile, scope, 4), true);
  assert.equal(isScopedServerKey(current.profile, scope, 5), false);
  assert.equal(isScopedServerKey(otherChannel.profile, scope, 4), false);
});

test('资料查询仅在会话已确认后启用，更新缓存使用完整响应', async () => {
  const harness = createHarness();
  const queries = createAppQueries(harness.client, harness.auth, harness.queryClient, harness.scope);
  assert.equal(queries.profile().enabled, false);

  await harness.credentials.write(tokens());
  await harness.auth.restore();
  const profileQuery = queries.profile();
  assert.equal(profileQuery.enabled, true);
  const profile = await harness.queryClient.fetchQuery(profileQuery);
  assert.deepEqual(profile, { name: '现有资料', heightCm: '170.00' });

  const mutationOptions = queries.updateProfile();
  const mutation = harness.queryClient.getMutationCache().build(harness.queryClient, mutationOptions);
  const updated = await mutation.execute({ profile: { name: '已修改' } });
  assert.deepEqual(updated, { name: '已修改', heightCm: '170.00' });
  assert.deepEqual(harness.queryClient.getQueryData(profileQuery.queryKey), updated);
  assert.equal(harness.queryClient.getDefaultOptions().queries.retry, false);
  assert.equal(harness.queryClient.getDefaultOptions().mutations.retry, false);
});

test('刷新令牌不改变资料查询作用域或复制资料到认证状态', async () => {
  let profileAttempts = 0;
  let refreshCount = 0;
  const harness = createHarness({
    client: {
      auth: {
        async refresh() {
          refreshCount += 1;
          return tokens('access-rotated', 'refresh-rotated');
        },
      },
      users: {
        async getProfile() {
          profileAttempts += 1;
          if (profileAttempts === 1) {
            throw apiError(401, 'INVALID_TOKEN');
          }
          return { name: '轮换后资料', heightCm: '170.00' };
        },
      },
    },
  });
  await harness.credentials.write(tokens());
  await harness.auth.restore();
  const startingGeneration = harness.auth.getSessionGeneration();
  const queries = createAppQueries(harness.client, harness.auth, harness.queryClient, harness.scope);
  const beforeRotation = queries.profile();

  assert.deepEqual(harness.auth.state.get(), {
    status: 'authenticated',
    userId: 17,
    username: 'test-user',
  });
  assert.deepEqual(
    await harness.queryClient.fetchQuery(beforeRotation),
    { name: '轮换后资料', heightCm: '170.00' },
  );

  const afterRotation = queries.profile();
  assert.deepEqual(afterRotation.queryKey, beforeRotation.queryKey);
  assert.equal(afterRotation.enabled, true);
  assert.equal(harness.auth.getSessionGeneration(), startingGeneration);
  assert.equal(refreshCount, 1);
  assert.equal(profileAttempts, 2);
  assert.deepEqual(harness.auth.state.get(), {
    status: 'authenticated',
    userId: 17,
    username: 'test-user',
  });
  assert.deepEqual(await harness.credentials.read(), tokens('access-rotated', 'refresh-rotated'));
});

test('退出清除旧会话缓存，迟到响应不能重新填入已删除的资料', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const profileStarted = deferred();
  const lateProfile = deferred();
  let profileSignal;
  const harness = createHarness({
    client: {
      users: {
        getProfile(options) {
          profileSignal = options.signal;
          profileStarted.resolve();
          return lateProfile.promise;
        },
      },
    },
  });
  await harness.credentials.write(tokens());
  await harness.auth.restore();
  const generation = harness.auth.getSessionGeneration();
  const queries = createAppQueries(harness.client, harness.auth, harness.queryClient, harness.scope);
  const profileQuery = queries.profile();
  const oldKey = profileQuery.queryKey;
  const otherScope = createAuthScope('https://another.example', 'android-cn');
  const otherKey = createServerQueryKeys(otherScope, generation).profile;
  const otherGenerationKey = createServerQueryKeys(harness.scope, generation + 1).profile;
  const preferenceKey = ['preferences', 'theme'];
  const currentMutationKey = createServerQueryKeys(harness.scope, generation).updateProfile;
  const preferenceMutationKey = ['preferences', 'theme'];
  harness.queryClient.setQueryData(oldKey, { name: '旧会话' });
  await harness.queryClient.invalidateQueries({ queryKey: oldKey, exact: true });
  harness.queryClient.setQueryData(otherKey, { name: '其他服务' });
  harness.queryClient.setQueryData(otherGenerationKey, { name: '其他代次' });
  harness.queryClient.setQueryData(preferenceKey, { theme: 'dark' });
  const mutationCache = harness.queryClient.getMutationCache();
  const currentMutation = mutationCache.build(harness.queryClient, {
    mutationKey: currentMutationKey,
    mutationFn: async () => null,
  });
  const preferenceMutation = mutationCache.build(harness.queryClient, {
    mutationKey: preferenceMutationKey,
    mutationFn: async () => null,
  });

  const query = harness.queryClient.fetchQuery(profileQuery);
  const queryOutcome = query.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await profileStarted.promise;
  await harness.auth.signOut();
  assert.equal(profileSignal.aborted, true);
  assert.equal(harness.queryClient.getQueryData(oldKey), undefined);
  assert.deepEqual(harness.queryClient.getQueryData(otherKey), { name: '其他服务' });
  assert.deepEqual(harness.queryClient.getQueryData(otherGenerationKey), { name: '其他代次' });
  assert.equal(mutationCache.getAll().includes(currentMutation), false);
  assert.equal(mutationCache.getAll().includes(preferenceMutation), true);
  assert.deepEqual(harness.queryClient.getQueryData(preferenceKey), { theme: 'dark' });

  lateProfile.resolve({ name: '迟到旧资料' });
  await queryOutcome;
  await Promise.resolve();
  assert.equal(harness.queryClient.getQueryData(oldKey), undefined);
});
test('退出后迟到的资料更新不能回填旧会话缓存', async () => {
  const updateStarted = deferred();
  const lateUpdate = deferred();
  const harness = createHarness({
    client: {
      users: {
        updateProfile() {
          updateStarted.resolve();
          return lateUpdate.promise;
        },
      },
    },
  });
  await harness.credentials.write(tokens());
  await harness.auth.restore();
  const queries = createAppQueries(harness.client, harness.auth, harness.queryClient, harness.scope);
  const profileQuery = queries.profile();
  harness.queryClient.setQueryData(profileQuery.queryKey, { name: '当前资料' });
  const mutationOptions = queries.updateProfile();
  const mutation = harness.queryClient.getMutationCache().build(harness.queryClient, mutationOptions);
  const mutationResult = mutation.execute({ profile: { name: '旧会话更新' } });

  await updateStarted.promise;
  await harness.auth.signOut();
  assert.equal(harness.queryClient.getQueryData(profileQuery.queryKey), undefined);

  lateUpdate.resolve({ name: '迟到的服务端资料', heightCm: '170.00' });
  await assert.rejects(mutationResult);
  assert.equal(harness.queryClient.getQueryData(profileQuery.queryKey), undefined);
});

test('资料、模型和任务列表新鲜期控制真实查询缓存复用', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_700_000_000_000 });
  let profileCalls = 0;
  let modelCalls = 0;
  let taskListCalls = 0;
  const harness = createHarness({
    client: {
      users: {
        async getProfile() {
          profileCalls += 1;
          return { name: `资料-${profileCalls}`, heightCm: '170.00' };
        },
      },
      models: {
        async list() {
          modelCalls += 1;
          return { items: [], total: 0, offset: 0, limit: 20 };
        },
      },
      tasks: {
        async list() {
          taskListCalls += 1;
          return { items: [], total: 0, offset: 0, limit: 20 };
        },
      },
    },
  });
  const observers = [];
  t.after(() => {
    for (const cleanup of observers) cleanup();
    harness.queryClient.clear();
  });
  await harness.credentials.write(tokens());
  await harness.auth.restore();
  const queries = createAppQueries(harness.client, harness.auth, harness.queryClient, harness.scope);
  const keepObserved = async (options) => {
    const observer = new QueryObserver(harness.queryClient, options);
    const unsubscribe = observer.subscribe(() => {});
    observers.push(() => {
      unsubscribe();
      observer.destroy();
    });
    await harness.queryClient.fetchQuery(options);
  };

  const profile = queries.profile();
  await keepObserved(profile);
  await harness.queryClient.fetchQuery(profile);
  assert.equal(profileCalls, 1);
  t.mock.timers.tick(60_000);
  await harness.queryClient.fetchQuery(profile);
  assert.equal(profileCalls, 2);

  const models = queries.models();
  await keepObserved(models);
  await harness.queryClient.fetchQuery(models);
  assert.equal(modelCalls, 1);
  t.mock.timers.tick(1_800_000);
  await harness.queryClient.fetchQuery(models);
  assert.equal(modelCalls, 2);

  const tasks = queries.tasks();
  await keepObserved(tasks);
  await harness.queryClient.fetchQuery(tasks);
  assert.equal(taskListCalls, 1);
  t.mock.timers.tick(30_000);
  await harness.queryClient.fetchQuery(tasks);
  assert.equal(taskListCalls, 2);
});

test('任务详情按最新状态动态复用缓存并保留未知状态', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_700_000_000_000 });
  const statuses = new Map([
    [1, 'RUNNING'],
    [2, 'SUCCEEDED'],
    [3, 'FAILED'],
    [4, 'DRAFT'],
    [5, 'SUBMITTED'],
    [6, 'PROCESSING_V2'],
  ]);
  const calls = new Map();
  const harness = createHarness({
    client: {
      tasks: {
        async getById(taskId) {
          calls.set(taskId, (calls.get(taskId) ?? 0) + 1);
          return { taskId, status: statuses.get(taskId), qualityFailure: null };
        },
      },
    },
  });
  t.after(() => harness.queryClient.clear());
  await harness.credentials.write(tokens());
  await harness.auth.restore();
  const queries = createAppQueries(harness.client, harness.auth, harness.queryClient, harness.scope);

  for (const [taskId, status] of statuses) {
    const options = queries.task(taskId);
    await harness.queryClient.fetchQuery(options);
    assert.equal(harness.queryClient.getQueryData(options.queryKey).status, status);
    await harness.queryClient.fetchQuery(options);
    const terminal = status === 'SUCCEEDED' || status === 'FAILED';
    assert.equal(calls.get(taskId), terminal ? 1 : 2);
  }
  assert.equal(harness.queryClient.getQueryData(queries.task(6).queryKey).status, 'PROCESSING_V2');

  statuses.set(1, 'FAILED');
  const runningTask = queries.task(1);
  await harness.queryClient.fetchQuery(runningTask);
  assert.equal(calls.get(1), 3);
  await harness.queryClient.fetchQuery(runningTask);
  assert.equal(calls.get(1), 3);

  t.mock.timers.tick(299_999);
  await harness.queryClient.fetchQuery(runningTask);
  await harness.queryClient.fetchQuery(queries.task(2));
  await harness.queryClient.fetchQuery(queries.task(3));
  assert.equal(calls.get(1), 3);
  assert.equal(calls.get(2), 1);
  assert.equal(calls.get(3), 1);

  t.mock.timers.tick(1);
  await harness.queryClient.fetchQuery(runningTask);
  await harness.queryClient.fetchQuery(queries.task(2));
  await harness.queryClient.fetchQuery(queries.task(3));
  assert.equal(calls.get(1), 4);
  assert.equal(calls.get(2), 2);
  assert.equal(calls.get(3), 2);
});

test('无观察者缓存十分钟后回收，期限前重新观察会取消回收', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_700_000_000_000 });
  const queryClient = createAppQueryClient();
  let cleanupObserver = () => {};
  t.after(() => {
    cleanupObserver();
    queryClient.clear();
  });

  const expiredKey = ['test', 'unobserved-expiry'];
  await queryClient.fetchQuery({
    queryKey: expiredKey,
    queryFn: async () => ({ value: '到期删除' }),
  });
  assert.ok(queryClient.getQueryCache().find({ queryKey: expiredKey }));
  t.mock.timers.tick(599_999);
  assert.ok(queryClient.getQueryCache().find({ queryKey: expiredKey }));
  t.mock.timers.tick(1);
  assert.equal(queryClient.getQueryCache().find({ queryKey: expiredKey }), undefined);

  const observedKey = ['test', 'reobserved-before-expiry'];
  const observedOptions = {
    queryKey: observedKey,
    queryFn: async () => ({ value: '重新观察' }),
  };
  await queryClient.fetchQuery(observedOptions);
  t.mock.timers.tick(599_999);
  const observer = new QueryObserver(queryClient, observedOptions);
  const unsubscribe = observer.subscribe(() => {});
  cleanupObserver = () => {
    unsubscribe();
    observer.destroy();
  };
  await queryClient.fetchQuery(observedOptions);
  t.mock.timers.tick(1);
  assert.ok(queryClient.getQueryCache().find({ queryKey: observedKey }));
});
