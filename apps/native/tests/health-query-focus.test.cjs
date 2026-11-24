// 验证首页缓存、手动刷新及历史聚焦读取；查询缓存和观察者使用真实实现。
const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const path = require('node:path');
const { QueryClient, onlineManager } = require('@tanstack/react-query');

/** 最小 React 调度只替代页面宿主，查询缓存与观察者使用真实实现。 */
function pageHarness(kind) {
  const slots = [];
  let cursor = 0;
  let effects = [];
  let dirty = false;
  let focused = true;
  let authenticated = true;
  let calls = 0;
  let failure = null;
  let taskDetail = { taskId: 42, status: 'SUCCEEDED', modelCode: 'unknown', submittedAt: null, isExample: false, result: {} };
  let gate = null;
  let historyData = null;
  let value;
  let filter = { metric: 'bloodPressure', from: '2026-11-17', to: '2026-11-23' };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 600000 } } });
  const requests = [];
  const options = (params) => ({
    queryKey: ['health', kind, params ?? null], enabled: authenticated, staleTime: 30000,
    queryFn: async () => { calls++; requests.push(params); if (gate) await gate; if (failure) throw failure; return kind === 'report' ? taskDetail : kind === 'history' && historyData ? historyData : { response: calls }; },
  });
  const services = { queryClient, auth: { getSessionGeneration: () => 1, isAuthenticatedAt: () => authenticated }, queries: { latestMeasurements: () => options(), measurementHistory: options, task: () => options(), invalidateMeasurements() {} } };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; dirty = true; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
    useMemo(create, deps) {
      const i = cursor++, previous = slots[i];
      if (!previous || previous.deps.length !== deps.length || !previous.deps.every((value, index) => Object.is(value, deps[index]))) slots[i] = { deps, value: create() };
      return slots[i].value;
    },
    useEffect(create, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (previous?.deps?.every((item, i) => Object.is(item, deps[i])) && previous.deps.length === deps.length) return;
      slots[index] = { deps, cleanup: previous?.cleanup };
      effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = create(); });
    },
  };
  const filename = path.resolve(__dirname, '../node_modules/.cache/native-test/pages', kind === 'latest' ? 'home/useLatestHealth.js' : kind === 'report' ? 'measurement/FingertipResults/useMeasurementReport.js' : 'history/useHistoryInterval.js');
  delete require.cache[filename];
  const load = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'react') return react;
    if (request === '@react-navigation/native') return { useIsFocused: () => focused };
    if (request === '@/app/auth/useAuthState') return { useAuthState: () => ({ status: authenticated ? 'authenticated' : 'anonymous' }) };
    if (request === '@/app/providers/AppProviders') return { useAppServices: () => services };
    if (request === 'react-native') return { AppState: { currentState: 'active' } };
    if (request === '@/app/lifecycle/foreground') return { subscribeToAppState: () => () => {} };
    if (request.startsWith('@/')) return load.call(this, path.resolve(__dirname, '../node_modules/.cache/native-test', request.slice(2)), parent, isMain);
    return load.call(this, request, parent, isMain);
  };
  let hook;
  try { hook = require(filename)[kind === 'latest' ? 'useLatestHealth' : kind === 'report' ? 'useMeasurementReport' : 'useHistoryInterval']; }
  finally { Module._load = load; }
  function render() {
    cursor = 0; dirty = false;
    value = kind === 'latest' ? hook() : kind === 'report' ? hook(42) : hook(filter, focused);
    const currentEffects = effects; effects = [];
    currentEffects.forEach((effect) => effect());
  }
  async function settle() {
    render();
    await new Promise(setImmediate);
    if (dirty) render();
  }
  return {
    get calls() { return calls; }, get value() { return value; }, requests,
    mount: settle,
    async remount() { for (const slot of slots) slot?.cleanup?.(); slots.length = 0; effects = []; await settle(); },
    async expire() { queryClient.setQueryData(options().queryKey, (data) => data, { updatedAt: 1 }); await settle(); },
    async refresh(wait = null) { gate = wait; value.refresh(); await settle(); },
    async focus(next) { focused = next; await settle(); },
    async authenticate(next) { authenticated = next; await settle(); },
    async selectMetric(metric) { filter = { ...filter, metric }; await settle(); },
    async fail(error) { failure = error; await settle(); },
    async task(next, wait = null) { taskDetail = next; gate = wait; value.refresh(); await settle(); },
    async interval(next, wait = null) { historyData = next; gate = wait; value.refresh(); await settle(); },
    async dispose() {
      for (const slot of slots) slot?.cleanup?.();
      await queryClient.cancelQueries();
      queryClient.clear();
    },
  };
}

test('首页首次无缓存读取，缓存过期后聚焦或重新进入仍不重取，手动刷新才更新', async (t) => {
  const page = pageHarness('latest');
  t.after(() => page.dispose());
  await page.mount();
  assert.equal(page.calls, 1);
  await page.expire();
  await page.focus(false);
  await page.focus(true);
  await page.remount();
  assert.equal(page.calls, 1);
  assert.equal(page.value.data.response, 1);
  await page.refresh();
  assert.equal(page.calls, 2);
  assert.equal(page.value.data.response, 2);
  await page.authenticate(false);
  await page.refresh();
  assert.equal(page.value.data, undefined);
  assert.equal(page.calls, 2);
});

test('历史首次进入及30秒内再次返回均重新读取，同页重绘不重复请求', async (t) => {
  const page = pageHarness('history');
  t.after(() => page.dispose());
  await page.mount();
  await page.mount();
  assert.equal(page.calls, 1);
  await page.focus(false);
  await page.focus(true);
  assert.equal(page.calls, 2);
  assert.equal(page.value.data.response, 2);
  await page.authenticate(false);
  assert.equal(page.value.data, undefined);
  await page.focus(false);
  await page.focus(true);
  assert.equal(page.calls, 2);
});

test('首页刷新尚未结束时重复下拉复用同一请求', async (t) => {
  const page = pageHarness('latest');
  t.after(() => page.dispose());
  await page.mount();
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  await page.refresh(pending);
  assert.equal(page.value.mode, 'refreshing');
  assert.equal(page.value.fetching, true);
  await page.refresh(pending);
  assert.equal(page.calls, 2);
  release();
  await page.mount();
  assert.equal(page.value.data.response, 2);
  assert.equal(page.value.mode, 'ready');
});

test('首页首次请求失败后重新进入不自动重试，手动刷新可以恢复', async (t) => {
  const page = pageHarness('latest');
  t.after(() => page.dispose());
  const failure = new Error('offline');
  await page.fail(failure);
  await page.remount();
  assert.equal(page.calls, 1);
  assert.strictEqual(page.value.error, failure);
  await page.fail(null);
  await page.refresh();
  assert.equal(page.calls, 2);
  assert.equal(page.value.data.response, 2);
});

test('历史切换指标立即读取新筛选，返回旧筛选也重读，不沿用新鲜旧值', async (t) => {
  const page = pageHarness('history');
  t.after(() => page.dispose());
  await page.mount();
  await page.selectMetric('heartRate');
  await page.selectMetric('bloodPressure');
  assert.deepEqual(page.requests.map((request) => request.metric), ['bloodPressure', 'heartRate', 'bloodPressure']);
  assert.equal(page.value.data.response, 3);
});

test('首页刷新失败隐藏缓存旧读数并保留错误，后续成功才能恢复', async (t) => {
  const page = pageHarness('latest');
  t.after(() => page.dispose());
  await page.mount();
  const failure = new Error('offline');
  await page.fail(failure);
  await page.refresh();
  assert.equal(page.value.data, undefined);
  assert.strictEqual(page.value.error, failure);
  assert.equal(page.value.hasPrevious, true);
  assert.equal(page.value.mode, 'ready');
  await page.fail(null);
  await page.refresh();
  assert.equal(page.value.data.response, 3);
  assert.equal(page.value.error, null);
});

test('不支持报告或草稿可重新获取原任务，等待期间不继续显示获取失败', async (t) => {
  const page = pageHarness('report');
  t.after(() => page.dispose());
  await page.mount();
  assert.equal(page.value.error, true);
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  await page.task({ taskId: 42, status: 'DRAFT', submittedAt: null }, wait);
  assert.equal(page.value.loading, true);
  assert.equal(page.value.error, false);
  release(); await page.mount();
  assert.equal(page.value.error, true);
  await page.task({ taskId: 42, status: 'SUCCEEDED', submittedAt: '2026-11-23 08:30:00', modelCode: 'ppg.active.offline.hr', isExample: false, result: { hr: 78, quality: { score: 88, threshold: 70 } } });
  assert.equal(page.value.error, false);
  assert.equal(page.value.report.metrics.heartRate.readings[0].value, 78);
  assert.equal(page.calls, 3);
});

test('历史刷新统一加载，任一页失败隐藏旧完整区间，重新获取成功后才恢复', async (t) => {
  const page = pageHarness('history');
  t.after(() => page.dispose());
  await page.mount();
  const complete = { items: [{ recordId: '42:bloodPressure' }], complete: true, error: null, total: 1 };
  await page.interval(complete);
  assert.deepEqual(page.value.data.items, complete.items);
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const failure = new Error('第二页读取失败');
  await page.interval({ ...complete, error: failure }, pending);
  assert.equal(page.value.fetching, true);
  assert.equal(page.value.data, undefined);
  release(); await page.mount();
  assert.equal(page.value.fetching, false);
  assert.equal(page.value.data, undefined);
  assert.strictEqual(page.value.error, failure);
  await page.interval(complete);
  assert.deepEqual(page.value.data.items, complete.items);
  assert.equal(page.value.error, null);
  assert.ok(page.requests.every((request) => request.metric === 'bloodPressure' && request.from === '2026-11-17' && request.to === '2026-11-23'));
});

test('历史已有完整缓存时断网重挂观察者保持加载，不发布旧区间', async () => {
  const page = pageHarness('history');
  const wasOnline = onlineManager.isOnline();
  try {
    await page.mount();
    const complete = { items: [{ recordId: '42:bloodPressure' }], complete: true, error: null, total: 1 };
    await page.interval(complete);
    assert.deepEqual(page.value.data, complete);
    const calls = page.calls;

    onlineManager.setOnline(false);
    await page.remount();

    assert.equal(page.calls, calls);
    assert.equal(page.value.fetching, true);
    assert.equal(page.value.data, undefined);
    assert.equal(page.value.error, null);
  } finally {
    try { await page.dispose(); }
    finally { onlineManager.setOnline(wasOnline); }
  }
});
