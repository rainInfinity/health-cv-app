// 验证服务端查询的认证门控、缓存隔离与资料写回。

const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const { QueryObserver, focusManager, onlineManager } = require('@tanstack/react-query');
const { createAppQueryClient } = require('../node_modules/.cache/native-test/app/query/client.js');

const { createAuthScope } = require('../node_modules/.cache/native-test/app/auth/scope.js');
const { createAppQueries } = require('../node_modules/.cache/native-test/app/query/resources.js');
const {
  parseSubmittedAt,
  beijingToday,
  formatBeijingDateTime,
} = require('../node_modules/.cache/native-test/shared/dateTime.js');
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

const historyFilter = { metric: 'heartRate', from: '2026-11-01', to: '2026-11-23' };

function measurement(taskId, metric = 'heartRate') {
  return {
    recordId: `${taskId}:${metric}`, taskId, metric,
    submittedAt: '2026-11-23 00:00:00',
    captureMethod: 'fingertip', captureMode: 'active', durationMs: 30001,
    readings: [{ code: 'hr', value: 79, unit: 'beats_per_minute' }],
    quality: { score: 88.5, threshold: 70 }, riskLevel: null,
    modelId: 7, versionId: 12, version: '1.0.0', algorithmKey: 'ppg.active.offline.hr_br.v1',
  };
}

function records(start, count) {
  return Array.from({ length: count }, (_, index) => measurement(start + index));
}

async function measurementHarness(measurements) {
  const harness = createHarness();
  harness.client.measurements = measurements;
  const queries = createAppQueries(harness.client, harness.auth, harness.queryClient, harness.scope);
  assert.equal(queries.latestMeasurements().enabled, false);
  assert.equal(queries.measurementHistory(historyFilter).enabled, false);
  await harness.credentials.write(tokens());
  await harness.auth.restore();
  return { ...harness, queries };
}

function observeQuery(t, harness, options) {
  const observer = new QueryObserver(harness.queryClient, options);
  const unsubscribe = observer.subscribe(() => {});
  t.after(() => {
    // 退出可能已从缓存移除查询；仍须释放观察者持有的旧查询回收计时器。
    const query = observer.getCurrentQuery();
    unsubscribe();
    observer.destroy();
    query.destroy();
  });
  return observer;
}

test('健康最新结果和历史保持30秒新鲜期、独立筛选身份与十分钟内存缓存', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_700_000_000_000 });
  let latestCalls = 0;
  let historyCalls = 0;
  const latest = {
    bloodPressure: null, heartRate: measurement(11), respirationRate: null,
    oxygenSaturation: null, diabetesRisk: null,
  };
  const harness = await measurementHarness({
    async latest() { latestCalls += 1; return latest; },
    async list(params) {
      historyCalls += 1;
      return { items: [], total: 0, offset: params.offset, limit: params.limit };
    },
  });
  const latestOptions = harness.queries.latestMeasurements();
  const historyOptions = harness.queries.measurementHistory(historyFilter);
  assert.equal(latestOptions.staleTime, 30_000);
  assert.equal(historyOptions.staleTime, 30_000);
  assert.equal(harness.queryClient.getDefaultOptions().queries.gcTime, 600_000);
  assert.notDeepEqual(historyOptions.queryKey, harness.queries.measurementHistory({
    ...historyFilter, metric: 'bloodPressure',
  }).queryKey);
  assert.notDeepEqual(historyOptions.queryKey, harness.queries.measurementHistory({
    ...historyFilter, to: '2026-11-22',
  }).queryKey);
  await harness.queryClient.fetchQuery(latestOptions);
  await harness.queryClient.fetchQuery(historyOptions);
  await harness.queryClient.fetchQuery(latestOptions);
  await harness.queryClient.fetchQuery(historyOptions);
  assert.equal(latestCalls, 1);
  assert.equal(historyCalls, 1);
  t.mock.timers.tick(30_000);
  await harness.queryClient.fetchQuery(latestOptions);
  await harness.queryClient.fetchQuery(historyOptions);
  assert.equal(latestCalls, 2);
  assert.equal(historyCalls, 2);
  assert.deepEqual(harness.queryClient.getQueryData(latestOptions.queryKey), latest);
  t.mock.timers.tick(599_999);
  assert.ok(harness.queryClient.getQueryData(historyOptions.queryKey));
  t.mock.timers.tick(1);
  assert.equal(harness.queryClient.getQueryData(historyOptions.queryKey), undefined);
  assert.equal(harness.queryClient.getQueryData(latestOptions.queryKey), undefined);
});

test('健康区间连续加载100条分页，末页完成前不发布部分记录', async () => {
  const secondStarted = deferred();
  const secondPage = deferred();
  const calls = [];
  const first = records(1, 100);
  const last = records(101, 2);
  const harness = await measurementHarness({
    async list(params) {
      calls.push({ ...params });
      if (params.offset === 0) return { items: first, total: 102, offset: 0, limit: 100 };
      secondStarted.resolve();
      return secondPage.promise;
    },
  });
  const options = harness.queries.measurementHistory(historyFilter);
  const loading = harness.queryClient.fetchQuery(options);
  await secondStarted.promise;
  assert.equal(harness.queryClient.getQueryData(options.queryKey), undefined);
  secondPage.resolve({ items: last, total: 102, offset: 100, limit: 100 });
  assert.deepEqual(await loading, { items: [...first, ...last], total: 102, complete: true, error: null });
  assert.deepEqual(calls, [
    { ...historyFilter, offset: 0, limit: 100 },
    { ...historyFilter, offset: 100, limit: 100 },
  ]);
  assert.equal(harness.queryClient.getQueryCache().getAll().filter(
    (query) => query.queryKey.includes('measurements'),
  ).length, 1);
});

test('后续页失败保留未完成事实但不发布部分列表，显式重取从第一页建立全新整段', async (t) => {
  const failure = new Error('第二页请求失败');
  let retry = false;
  const offsets = [];
  const oldFirst = records(1, 100);
  const newFirst = records(301, 100);
  const harness = await measurementHarness({
    async list({ offset, limit }) {
      offsets.push(offset);
      if (!retry && offset === 100) throw failure;
      return { items: offset === 0 ? (retry ? newFirst : oldFirst) : [measurement(401)], total: 101, offset, limit };
    },
  });
  const options = harness.queries.measurementHistory(historyFilter);
  const observer = observeQuery(t, harness, options);
  const incomplete = await harness.queryClient.fetchQuery(options);
  assert.deepEqual(incomplete, { items: [], total: 101, complete: false, error: failure });
  retry = true;
  const refreshed = await observer.refetch();
  assert.deepEqual(refreshed.data, { items: [...newFirst, measurement(401)], total: 101, complete: true, error: null });
  assert.deepEqual(offsets, [0, 100, 0, 100]);
});

test('刷新中后续页失败保留同会话旧完整快照并明确反馈错误，成功后整体替换', async (t) => {
  const failure = new Error('刷新失败');
  let stage = 'initial';
  const offsets = [];
  const harness = await measurementHarness({
    async list({ offset, limit }) {
      offsets.push(offset);
      if (stage === 'initial') return { items: [measurement(1)], total: 1, offset, limit };
      if (offset === 100 && stage === 'failure') throw failure;
      return { items: offset === 0 ? records(201, 100) : [measurement(301)], total: 101, offset, limit };
    },
  });
  const options = harness.queries.measurementHistory(historyFilter);
  const observer = observeQuery(t, harness, options);
  const original = await harness.queryClient.fetchQuery(options);
  stage = 'failure';
  assert.deepEqual((await observer.refetch()).data, { ...original, error: failure });
  stage = 'success';
  const replacement = (await observer.refetch()).data;
  assert.equal(replacement.complete, true);
  assert.equal(replacement.error, null);
  assert.deepEqual(replacement.items, records(201, 101));
  assert.deepEqual(offsets, [0, 0, 100, 0, 100]);
});

test('最新结果刷新失败保留旧成功值和查询错误，不伪装无记录', async (t) => {
  const failure = new Error('最新结果刷新失败');
  let fail = false;
  const latest = {
    bloodPressure: null, heartRate: measurement(9), respirationRate: null,
    oxygenSaturation: null, diabetesRisk: null,
  };
  const harness = await measurementHarness({
    async latest() { if (fail) throw failure; return latest; },
  });
  const options = harness.queries.latestMeasurements();
  const observer = observeQuery(t, harness, options);
  await harness.queryClient.fetchQuery(options);
  fail = true;
  const result = await observer.refetch();
  assert.deepEqual(result.data, latest);
  assert.equal(result.error, failure);
  assert.equal(result.isRefetchError, true);
});

test('total变化或重复recordId丢弃全轮，前台在线仅自动整段重读一次', async (t) => {
  focusManager.setFocused(true);
  onlineManager.setOnline(true);
  t.after(() => focusManager.setFocused(undefined));
  for (const change of ['total', 'duplicate']) {
    const offsets = [];
    let round = 0;
    const harness = await measurementHarness({
      async list({ offset, limit }) {
        offsets.push(offset);
        if (offset === 0) {
          round += 1;
          return { items: records(round * 1000, 100), total: 101, offset, limit };
        }
        return {
          items: [measurement(change === 'duplicate' ? round * 1000 : round * 1000 + 100)],
          total: change === 'total' ? 102 : 101, offset, limit,
        };
      },
    });
    const options = harness.queries.measurementHistory(historyFilter);
    const observer = observeQuery(t, harness, options);
    const stopped = await harness.queryClient.fetchQuery(options);
    assert.equal(stopped.complete, false);
    assert.equal(stopped.items.length, 0);
    assert.ok(stopped.error);
    assert.deepEqual(offsets, [0, 100, 0, 100]);
    // 自动生命周期不能重放持续变化的区间，显式刷新仍可开始新的有限轮次。
    const query = harness.queryClient.getQueryCache().find({ queryKey: options.queryKey });
    assert.equal(options.refetchOnWindowFocus(query), false);
    assert.equal(options.refetchOnReconnect(query), false);
    await observer.refetch();
    assert.deepEqual(offsets, [0, 100, 0, 100, 0, 100, 0, 100]);
  }
});

test('集合变化后的整段新读取不会混入此前第一页，后台不自动重读', async (t) => {
  focusManager.setFocused(true);
  onlineManager.setOnline(true);
  t.after(() => focusManager.setFocused(undefined));
  let round = 0;
  const offsets = [];
  const harness = await measurementHarness({
    async list({ offset, limit }) {
      offsets.push(offset);
      if (offset === 0) round += 1;
      if (round === 1) return { items: offset === 0 ? records(1, 100) : [measurement(101)], total: offset === 0 ? 101 : 102, offset, limit };
      return { items: [measurement(500)], total: 1, offset, limit };
    },
  });
  const options = harness.queries.measurementHistory(historyFilter);
  observeQuery(t, harness, options);
  const result = await harness.queryClient.fetchQuery(options);
  assert.deepEqual(result, { items: [measurement(500)], total: 1, complete: true, error: null });
  assert.deepEqual(offsets, [0, 100, 0]);

  focusManager.setFocused(false);
  const background = await measurementHarness({
    async list({ offset, limit }) {
      return { items: offset === 0 ? records(1, 100) : [measurement(1)], total: 101, offset, limit };
    },
  });
  const backgroundOptions = background.queries.measurementHistory(historyFilter);
  observeQuery(t, background, backgroundOptions);
  const incomplete = await background.queryClient.fetchQuery(backgroundOptions);
  assert.equal(incomplete.complete, false);
  assert.deepEqual(incomplete.items, []);
  assert.ok(incomplete.error);
});

test('换号取消旧会话后续页，迟到响应不能回填旧缓存或新账号', async (t) => {
  const secondStarted = deferred();
  const latePage = deferred();
  let oldSignal;
  let newSession = false;
  const harness = await measurementHarness({
    async list({ offset, limit }, { signal }) {
      if (newSession) return { items: [measurement(900)], total: 1, offset, limit };
      if (offset === 0) return { items: records(1, 100), total: 101, offset, limit };
      oldSignal = signal;
      secondStarted.resolve();
      return latePage.promise;
    },
  });
  const oldOptions = harness.queries.measurementHistory(historyFilter);
  const oldLoad = harness.queryClient.fetchQuery(oldOptions).catch((error) => error);
  const oldQuery = harness.queryClient.getQueryCache().find({ queryKey: oldOptions.queryKey, exact: true });
  t.after(async () => {
    // 被移出缓存的旧请求仍会完成 finally；等其微任务结束后释放孤立的回收计时器。
    await new Promise(setImmediate);
    oldQuery.destroy();
  });
  await secondStarted.promise;
  await harness.auth.signOut();
  newSession = true;
  await harness.auth.signIn({ username: 'new-account', password: 'new-password' });
  const newOptions = harness.queries.measurementHistory(historyFilter);
  assert.notDeepEqual(oldOptions.queryKey, newOptions.queryKey);
  const current = await harness.queryClient.fetchQuery(newOptions);
  latePage.resolve({ items: [measurement(101)], total: 101, offset: 100, limit: 100 });
  await oldLoad;
  await Promise.resolve();
  assert.equal(oldSignal.aborted, true);
  assert.equal(harness.queryClient.getQueryData(oldOptions.queryKey), undefined);
  assert.deepEqual(harness.queryClient.getQueryData(newOptions.queryKey), current);
  assert.deepEqual(current.items, [measurement(900)]);
});

test('切换历史筛选取消旧轮，旧后续页不能回填当前筛选', async (t) => {
  const secondStarted = deferred();
  const latePage = deferred();
  let oldSignal;
  const harness = await measurementHarness({
    async list({ metric, offset, limit }, { signal }) {
      if (metric === 'bloodPressure') return { items: [measurement(800, metric)], total: 1, offset, limit };
      if (offset === 0) return { items: records(1, 100), total: 101, offset, limit };
      oldSignal = signal;
      secondStarted.resolve();
      return latePage.promise;
    },
  });
  const oldOptions = harness.queries.measurementHistory(historyFilter);
  const observer = observeQuery(t, harness, oldOptions);
  const oldLoad = harness.queryClient.fetchQuery(oldOptions).catch((error) => error);
  await secondStarted.promise;
  const newOptions = harness.queries.measurementHistory({ ...historyFilter, metric: 'bloodPressure' });
  observer.setOptions(newOptions);
  const current = await harness.queryClient.fetchQuery(newOptions);
  latePage.resolve({ items: [measurement(101)], total: 101, offset: 100, limit: 100 });
  await oldLoad;
  await Promise.resolve();
  assert.equal(oldSignal.aborted, true);
  assert.deepEqual(harness.queryClient.getQueryData(newOptions.queryKey), current);
  assert.deepEqual(current.items, [measurement(800, 'bloodPressure')]);
  assert.notEqual(harness.queryClient.getQueryData(oldOptions.queryKey)?.complete, true);
});

test('新有效记录刷新未展示的最新结果缓存，不依赖返回首页或聚焦', async (t) => {
  let taskId = 1;
  let calls = 0;
  const harness = await measurementHarness({
    async latest() {
      calls += 1;
      return { bloodPressure: null, heartRate: measurement(taskId), respirationRate: null, oxygenSaturation: null, diabetesRisk: null };
    },
  });
  const options = harness.queries.latestMeasurements();
  await harness.queryClient.fetchQuery(options);
  assert.equal(harness.queryClient.getQueryData(options.queryKey).heartRate.taskId, 1);
  taskId = 700;
  await harness.queries.invalidateMeasurements();
  assert.equal(calls, 2);
  assert.equal(harness.queryClient.getQueryData(options.queryKey).heartRate.taskId, 700);
});

test('有效任务失效会取消在途旧页并从第一页重读，旧代次失效不影响新会话', async (t) => {
  const secondStarted = deferred();
  const latePage = deferred();
  const offsets = [];
  let refreshed = false;
  let oldSignal;
  const harness = await measurementHarness({
    async list({ offset, limit }, { signal }) {
      offsets.push(offset);
      if (refreshed) return { items: [measurement(700)], total: 1, offset, limit };
      if (offset === 0) return { items: records(1, 100), total: 101, offset, limit };
      oldSignal = signal;
      secondStarted.resolve();
      return latePage.promise;
    },
    async latest() {
      return { bloodPressure: null, heartRate: measurement(refreshed ? 700 : 1), respirationRate: null, oxygenSaturation: null, diabetesRisk: null };
    },
  });
  const generation = harness.auth.getSessionGeneration();
  const options = harness.queries.measurementHistory(historyFilter);
  observeQuery(t, harness, options);
  const latestOptions = harness.queries.latestMeasurements();
  observeQuery(t, harness, latestOptions);
  await harness.queryClient.fetchQuery(latestOptions);
  const oldLoad = harness.queryClient.fetchQuery(options).catch((error) => error);
  await secondStarted.promise;
  refreshed = true;
  await harness.queries.invalidateMeasurements(generation);
  assert.equal(oldSignal.aborted, true);
  assert.deepEqual(harness.queryClient.getQueryData(options.queryKey), {
    items: [measurement(700)], total: 1, complete: true, error: null,
  });
  assert.equal(harness.queryClient.getQueryData(latestOptions.queryKey).heartRate.taskId, 700);
  latePage.resolve({ items: [measurement(101)], total: 101, offset: 100, limit: 100 });
  await oldLoad;
  await Promise.resolve();
  assert.deepEqual(offsets, [0, 100, 0]);
  assert.equal(harness.queryClient.getQueryData(options.queryKey).items[0].taskId, 700);
  await harness.auth.signOut();
  await harness.auth.signIn({ username: 'another-account', password: 'another-password' });
  const newOptions = harness.queries.measurementHistory(historyFilter);
  const current = await harness.queryClient.fetchQuery(newOptions);
  const calls = offsets.length;
  await harness.queries.invalidateMeasurements(generation);
  assert.equal(offsets.length, calls);
  assert.deepEqual(harness.queryClient.getQueryData(newOptions.queryKey), current);
});

test('submittedAt严格按北京时间解析，跨日和不同设备时区保持中文24小时输出', () => {
  const originalZone = process.env.TZ;
  try {
    for (const zone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
      process.env.TZ = zone;
      const submittedAt = '2026-11-23 00:00:00';
      const millis = parseSubmittedAt(submittedAt);
      assert.equal(millis, Date.parse('2026-11-22T16:00:00Z'));
      assert.equal(formatBeijingDateTime(millis, 'fullDateTime'), '2026年11月23日 00:00');
      assert.equal(beijingToday(Date.parse('2026-11-22T15:59:59Z')), '2026-11-22');
      assert.equal(beijingToday(Date.parse('2026-11-22T16:00:00Z')), '2026-11-23');
      assert.equal(beijingToday(millis - 6 * 24 * 60 * 60 * 1000), '2026-11-17');
      assert.equal(submittedAt, '2026-11-23 00:00:00');
    }
    assert.equal(formatBeijingDateTime(parseSubmittedAt('2024-02-29 23:59:59')), '2月29日 23:59');
    for (const invalid of [
      '2026-02-29 00:00:00', '2026-11-31 00:00:00', '2026-13-01 00:00:00',
      '2026-11-23 24:00:00', '2026-11-23 00:60:00', '2026-11-23 00:00:60',
      '2026-11-23', '2026-11-23T00:00:00Z', '2026-11-23 00:00:00\n',
    ]) assert.equal(Number.isNaN(parseSubmittedAt(invalid)), true);
  } finally {
    if (originalZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalZone;
  }
});

test('首次健康区间请求失败不是正常无记录，显式重取成功后才成为完整空区间', async (t) => {
  const failure = apiError(422, 'INVALID_INPUT');
  let fail = true;
  let calls = 0;
  const harness = await measurementHarness({
    async list({ offset, limit }) {
      calls += 1;
      if (fail) throw failure;
      return { items: [], total: 0, offset, limit };
    },
  });
  const options = harness.queries.measurementHistory(historyFilter);
  const observer = observeQuery(t, harness, options);
  assert.deepEqual(await harness.queryClient.fetchQuery(options), {
    items: [], total: 0, complete: false, error: failure,
  });
  assert.equal(calls, 1);
  fail = false;
  assert.deepEqual((await observer.refetch()).data, {
    items: [], total: 0, complete: true, error: null,
  });
  assert.equal(calls, 2);
});

test('已知新有效结果使旧轮重读，刷新失败仍保留同区间上次完整内容及错误', async (t) => {
  const failure = new Error('新一轮请求失败');
  let fail = false;
  const harness = await measurementHarness({
    async list({ offset, limit }) {
      if (fail) throw failure;
      return { items: [measurement(99)], total: 1, offset, limit };
    },
  });
  const options = harness.queries.measurementHistory(historyFilter);
  observeQuery(t, harness, options);
  await harness.queryClient.fetchQuery(options);
  fail = true;
  await harness.queries.invalidateMeasurements();
  assert.deepEqual(harness.queryClient.getQueryData(options.queryKey), {
    items: [measurement(99)], total: 1, complete: true, error: failure,
  });
});
