// 验证共享原生事件驱动 React Query 的焦点、网络和监听清理。

const assert = require('node:assert/strict');
const test = require('node:test');
const { focusManager, onlineManager, QueryObserver } = require('@tanstack/react-query');
const { createAppStateEvents } = require('../node_modules/.cache/native-test/app/lifecycle/appStateEvents.js');
const { createAppQueryClient } = require('../node_modules/.cache/native-test/app/query/client.js');
const { installQueryLifecycle } = require('../node_modules/.cache/native-test/app/lifecycle/queryLifecycle.js');

function createFakeAppState(initialState) {
  let listener = null;
  let registrations = 0;
  let removals = 0;
  return {
    currentState: initialState,
    addEventListener(event, nextListener) {
      assert.equal(event, 'change');
      registrations += 1;
      listener = nextListener;
      return {
        remove() {
          removals += 1;
          listener = null;
        },
      };
    },
    emit(state) {
      listener?.(state);
    },
    get registrations() {
      return registrations;
    },
    get removals() {
      return removals;
    },
  };
}

function createFakeNetwork(initialState) {
  const listeners = new Set();
  return {
    subscribe(listener) {
      listeners.add(listener);
      listener(initialState);
      return () => listeners.delete(listener);
    },
    emit(state) {
      listeners.forEach((listener) => listener(state));
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

async function flushQueryUpdates() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

test('AppState与NetInfo只刷新启用且过期的活动查询，并共享和清理监听', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_700_000_000_000 });
  focusManager.setFocused(true);
  onlineManager.setOnline(true);

  const queryClient = createAppQueryClient();
  queryClient.mount();
  const nativeAppState = createFakeAppState('background');
  const appStateEvents = createAppStateEvents(nativeAppState);
  const network = createFakeNetwork({ isConnected: null, isInternetReachable: null });
  const observers = [];
  let localeRefreshes = 0;
  let stopLocale = () => {};
  let stopLifecycle = () => {};
  t.after(() => {
    for (const cleanup of observers) cleanup();
    stopLifecycle();
    stopLocale();
    queryClient.unmount();
    queryClient.clear();
    onlineManager.setOnline(true);
    focusManager.setFocused(true);
  });

  stopLocale = appStateEvents.subscribeToAppForeground(() => {
    localeRefreshes += 1;
  });
  stopLifecycle = installQueryLifecycle({
    currentAppState: nativeAppState.currentState,
    subscribeToAppState: appStateEvents.subscribeToAppState,
    subscribeToNetwork: (listener) => network.subscribe(listener),
  });
  assert.equal(focusManager.isFocused(), false);
  assert.equal(onlineManager.isOnline(), true);
  assert.equal(nativeAppState.registrations, 1);

  const calls = { stale: 0, fresh: 0, disabled: 0, unobserved: 0 };
  const staleOptions = {
    queryKey: ['lifecycle', 'active-stale'],
    staleTime: 1_000,
    queryFn: async () => ++calls.stale,
  };
  const freshOptions = {
    queryKey: ['lifecycle', 'active-fresh'],
    staleTime: 30_000,
    queryFn: async () => ++calls.fresh,
  };
  const disabledOptions = {
    queryKey: ['lifecycle', 'disabled'],
    enabled: false,
    queryFn: async () => ++calls.disabled,
  };
  const unobservedOptions = {
    queryKey: ['lifecycle', 'unobserved'],
    staleTime: 0,
    queryFn: async () => ++calls.unobserved,
  };
  const observe = async (options) => {
    const observer = new QueryObserver(queryClient, options);
    const unsubscribe = observer.subscribe(() => {});
    observers.push(() => {
      unsubscribe();
      observer.destroy();
    });
    await queryClient.fetchQuery(options);
  };

  await observe(staleOptions);
  await observe(freshOptions);
  const disabledObserver = new QueryObserver(queryClient, disabledOptions);
  const unsubscribeDisabled = disabledObserver.subscribe(() => {});
  observers.push(() => {
    unsubscribeDisabled();
    disabledObserver.destroy();
  });
  await queryClient.fetchQuery(unobservedOptions);
  assert.deepEqual(calls, { stale: 1, fresh: 1, disabled: 0, unobserved: 1 });

  t.mock.timers.tick(1_001);
  nativeAppState.emit('active');
  await flushQueryUpdates();
  assert.equal(focusManager.isFocused(), true);
  assert.equal(localeRefreshes, 1);
  assert.deepEqual(calls, { stale: 2, fresh: 1, disabled: 0, unobserved: 1 });

  nativeAppState.emit('background');
  assert.equal(focusManager.isFocused(), false);
  t.mock.timers.tick(1_001);
  network.emit({ isConnected: true, isInternetReachable: false });
  assert.equal(onlineManager.isOnline(), false);
  network.emit({ isConnected: null, isInternetReachable: null });
  assert.equal(onlineManager.isOnline(), false);
  network.emit({ isConnected: true, isInternetReachable: null });
  await flushQueryUpdates();
  assert.equal(onlineManager.isOnline(), true);
  assert.deepEqual(calls, { stale: 3, fresh: 1, disabled: 0, unobserved: 1 });

  stopLifecycle();
  assert.equal(network.listenerCount, 0);
  assert.equal(nativeAppState.removals, 0);
  stopLocale();
  assert.equal(nativeAppState.removals, 1);
});
