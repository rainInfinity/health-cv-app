// 验证服务端缓存隔离、语言切换复用和刷新失败数据保留。

const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const { atom } = require('nanostores');
const { QueryObserver, onlineManager } = require('@tanstack/react-query');
const { createLocaleState } = require('../node_modules/.cache/native-test/app/i18n/localeState.js');
const { createAppQueries } = require('../node_modules/.cache/native-test/app/query/resources.js');
const {
  clearHarnessQueryClients,
  createHarness,
  tokens,
} = require('./helpers.cjs');

afterEach(clearHarnessQueryClients);

test('刷新失败保留已确认数据、错误和最后成功时间', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_700_000_000_000 });
  onlineManager.setOnline(true);
  let attempts = 0;
  const networkError = Object.assign(new Error('服务暂不可用'), { kind: 'network' });
  const harness = createHarness({
    client: {
      tasks: {
        async list() {
          attempts += 1;
          if (attempts === 1) {
            return { items: [{ taskId: 17 }], total: 1, offset: 0, limit: 20 };
          }
          throw networkError;
        },
      },
    },
  });
  let unsubscribe = () => {};
  let observer = null;
  t.after(() => {
    unsubscribe();
    observer?.destroy();
    harness.queryClient.clear();
    onlineManager.setOnline(true);
  });
  await harness.credentials.write(tokens());
  await harness.auth.restore();
  const queries = createAppQueries(harness.client, harness.auth, harness.queryClient, harness.scope);
  const options = queries.tasks({ offset: 0, limit: 20 });
  observer = new QueryObserver(harness.queryClient, options);
  unsubscribe = observer.subscribe(() => {});
  await harness.queryClient.fetchQuery(options);

  const success = observer.getCurrentResult();
  const confirmedData = success.data;
  const lastSuccessTime = success.dataUpdatedAt;
  assert.deepEqual(confirmedData, { items: [{ taskId: 17 }], total: 1, offset: 0, limit: 20 });

  t.mock.timers.tick(30_000);
  const refresh = await observer.refetch();
  assert.equal(refresh.status, 'error');
  assert.equal(refresh.error, networkError);
  assert.deepEqual(refresh.data, confirmedData);
  assert.equal(refresh.dataUpdatedAt, lastSuccessTime);
  assert.equal(attempts, 2);
});

test('分页缓存彼此隔离，同一页面切换语言后复用缓存', async () => {
  const requestedOffsets = [];
  const harness = createHarness({
    client: {
      tasks: {
        async list(query) {
          const offset = query?.offset ?? 0;
          requestedOffsets.push(offset);
          return { items: [{ offset }], total: 40, offset, limit: query?.limit ?? 20 };
        },
      },
    },
  });
  await harness.credentials.write(tokens());
  await harness.auth.restore();
  const queries = createAppQueries(harness.client, harness.auth, harness.queryClient, harness.scope);
  const preference = atom('zh-CN');
  const locale = createLocaleState(preference, () => []);
  const firstPage = queries.tasks({ offset: 0, limit: 20 });
  const secondPage = queries.tasks({ offset: 20, limit: 20 });

  assert.equal(locale.currentLocale.get(), 'zh-CN');
  await harness.queryClient.fetchQuery(firstPage);
  await harness.queryClient.fetchQuery(secondPage);
  assert.notDeepEqual(firstPage.queryKey, secondPage.queryKey);
  assert.deepEqual(harness.queryClient.getQueryData(firstPage.queryKey).items, [{ offset: 0 }]);
  assert.deepEqual(harness.queryClient.getQueryData(secondPage.queryKey).items, [{ offset: 20 }]);

  preference.set('en-US');
  assert.equal(locale.currentLocale.get(), 'en-US');
  const samePageAfterLanguageChange = queries.tasks({ offset: 0, limit: 20 });
  assert.deepEqual(samePageAfterLanguageChange.queryKey, firstPage.queryKey);
  await harness.queryClient.fetchQuery(samePageAfterLanguageChange);
  assert.deepEqual(requestedOffsets, [0, 20]);
});
