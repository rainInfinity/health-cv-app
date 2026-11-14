// 直接驱动产品页使用的本地控制器，验证阶段、时钟、整轮曲线及销毁边界。

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createFingertipDisplay,
  getFingertipPresentation,
} = require('../node_modules/.cache/native-test/pages/measurement/FingertipMeasurement/fingertipDisplay.js');

/** 真实调度接口的确定性替身，不通过回调次数推进产品时钟。 */
function harness({ reducedMotion = false, active = true } = {}) {
  let now = 0;
  let nextId = 1;
  let notifications = 0;
  let runningTransitions = 0;
  let lastNotification;
  const pending = new Map();
  const cancelledCallbacks = [];
  const controller = createFingertipDisplay({
    now: () => now,
    schedule(callback, delay) {
      const id = nextId++;
      pending.set(id, { at: now + delay, callback });
      return id;
    },
    cancel(id) {
      if (pending.has(id)) cancelledCallbacks.push(pending.get(id).callback);
      pending.delete(id);
    },
    onChange(snapshot) {
      notifications += 1;
      lastNotification = snapshot;
    },
    onRunning() { runningTransitions += 1; },
    reducedMotion,
    active,
  });
  function earliest() {
    return [...pending.entries()].sort((left, right) => left[1].at - right[1].at)[0];
  }
  return {
    controller,
    pending,
    cancelledCallbacks,
    get notifications() { return notifications; },
    get lastNotification() { return lastNotification; },
    get runningTransitions() { return runningTransitions; },
    advance(duration) {
      const end = now + duration;
      let next = earliest();
      while (next && next[1].at <= end) {
        now = Math.max(now, next[1].at);
        pending.delete(next[0]);
        next[1].callback();
        next = earliest();
      }
      now = end;
    },
    jump(duration) { now += duration; },
    fireNext() {
      const next = earliest();
      assert.ok(next, '应有一个待执行的本地展示回调');
      pending.delete(next[0]);
      next[1].callback();
    },
  };
}

function points(snapshot) {
  return snapshot.wave.points.map((point) => [...point]);
}

test('布局之前始终等待；覆盖、满环停顿与完整三十秒互相独立', () => {
  const h = harness();
  h.advance(10_000);
  assert.equal(h.controller.getSnapshot().phase, 'ready');
  assert.equal(h.controller.getSnapshot().coverage, 0);
  assert.equal(h.controller.getSnapshot().wave.points.length, 0);
  assert.equal(h.pending.size, 0);
  h.controller.layoutReady();
  h.advance(1_200);
  assert.equal(h.controller.getSnapshot().coverage, 50);
  assert.equal(h.controller.getSnapshot().remainingMs, 30_000);
  h.advance(1_200);
  assert.equal(h.controller.getSnapshot().coverage, 100);
  assert.equal(h.controller.getSnapshot().phase, 'covering');
  assert.equal(h.controller.getSnapshot().remainingMs, 30_000);
  h.advance(350);
  assert.equal(h.controller.getSnapshot().phase, 'covering');
  h.advance(50);
  assert.equal(h.controller.getSnapshot().phase, 'running');
  assert.equal(h.controller.getSnapshot().remainingMs, 30_000);
  assert.equal(h.controller.getSnapshot().wave.points.length, 1);
  assert.equal(h.controller.getSnapshot().wave.points[0][0], 0);
  assert.equal(h.runningTransitions, 1);
  h.controller.layoutReady();
  h.advance(29_950);
  assert.equal(h.controller.getSnapshot().phase, 'running');
  assert.equal(h.controller.getSnapshot().remainingMs, 50);
  h.advance(50);
  const finished = h.controller.getSnapshot();
  assert.equal(finished.phase, 'completed');
  assert.equal(finished.coverage, 100);
  assert.equal(finished.remainingMs, 0);
  assert.equal(h.pending.size, 0);
  const frozen = points(finished);
  h.advance(60_000);
  assert.deepEqual(points(h.controller.getSnapshot()), frozen);
  assert.equal(h.runningTransitions, 1);
});

test('覆盖与检测均按精确暂停点继续，后台不计入任一阶段', () => {
  const h = harness();
  h.controller.layoutReady();
  h.advance(1_025);
  h.controller.setActive(false);
  const covered = h.controller.getSnapshot();
  assert.equal(covered.coverage, 42);
  assert.equal(h.pending.size, 0);
  const pausedNotifications = h.notifications;
  h.advance(120_000);
  assert.equal(h.notifications, pausedNotifications);
  assert.equal(h.controller.getSnapshot().coverage, 42);
  h.controller.setActive(true);
  const resumedNotifications = h.notifications;
  for (const callback of h.cancelledCallbacks) callback();
  assert.equal(h.notifications, resumedNotifications);
  assert.equal(h.pending.size, 1);
  h.advance(1_400);
  assert.equal(h.controller.getSnapshot().coverage, 100);
  assert.equal(h.controller.getSnapshot().remainingMs, 30_000);
  h.advance(400);
  assert.equal(h.controller.getSnapshot().phase, 'running');
  h.advance(1_234);
  h.controller.setActive(false);
  assert.equal(h.controller.getSnapshot().remainingMs, 28_766);
  const beforeBackground = points(h.controller.getSnapshot());
  h.advance(90_000);
  assert.equal(h.controller.getSnapshot().remainingMs, 28_766);
  assert.deepEqual(points(h.controller.getSnapshot()), beforeBackground);
  h.controller.setActive(true);
  h.advance(750);
  assert.equal(h.controller.getSnapshot().remainingMs, 28_016);
  assert.equal(h.runningTransitions, 1);
  h.controller.dispose();
  assert.equal(h.pending.size, 0);
});

test('回调延迟不会按次数减秒，也不会吞掉独立检测时长', () => {
  const h = harness();
  h.controller.layoutReady();
  h.jump(8_000);
  h.fireNext();
  assert.equal(h.controller.getSnapshot().phase, 'running');
  assert.equal(h.controller.getSnapshot().remainingMs, 30_000);
  h.jump(9_025);
  h.fireNext();
  const state = h.controller.getSnapshot();
  assert.equal(state.remainingMs, 20_975);
  assert.equal(state.wave.points.length, 271);
  const values = points(state);
  assert.equal(values[0][0], 0);
  assert.equal(values.at(-1)[0], 9_000);
  assert.ok(values.at(-1)[0] <= state.runningElapsedMs);
  assert.equal(h.runningTransitions, 1);
  h.controller.dispose();
});

test('曲线按三十赫兹保留零点到三十秒全轮，追加不改写旧点且完成后冻结', () => {
  const h = harness();
  h.controller.layoutReady();
  h.advance(2_800);
  const sharedPoints = h.controller.getSnapshot().wave.points;
  h.advance(9_000);
  const state = h.controller.getSnapshot();
  assert.equal(state.wave.points, sharedPoints);
  assert.equal(state.wave.points.length, 271);
  const history = points(state);
  assert.equal(history[0][0], 0);
  assert.equal(history.at(-1)[0], 9_000);
  for (let index = 0; index < history.length; index += 1) {
    assert.equal(history[index][0], index * 1_000 / 30);
  }
  const firstPoint = sharedPoints[0];
  h.advance(21_000);
  const completed = h.controller.getSnapshot();
  assert.equal(completed.phase, 'completed');
  assert.equal(completed.wave.points, sharedPoints);
  assert.equal(completed.wave.points[0], firstPoint);
  assert.equal(completed.wave.points.length, 901);
  assert.equal(points(completed).at(-1)[0], 30_000);
  assert.deepEqual(points(completed).slice(0, history.length), history);
  const frozen = points(completed);
  const revision = completed.wave.revision;
  h.controller.setReducedMotion(true);
  h.controller.setActive(false);
  h.advance(60_000);
  h.controller.setActive(true);
  assert.deepEqual(points(h.controller.getSnapshot()), frozen);
  assert.equal(h.controller.getSnapshot().wave.revision, revision);
});

test('减少动态效果仅降低刷新频率，仍追加同一真实时间轴的模拟历史', () => {
  const h = harness({ reducedMotion: true });
  h.controller.layoutReady();
  h.advance(2_800);
  const started = h.controller.getSnapshot();
  assert.equal(started.wave.points.length, 1);
  assert.equal(started.wave.points[0][0], 0);
  h.advance(10_000);
  const state = h.controller.getSnapshot();
  assert.equal(state.remainingMs, 20_000);
  assert.equal(state.wave.points.length, 301);
  assert.equal(state.wave.points.at(-1)[0], 10_000);
  const history = points(state);
  const revision = state.wave.revision;
  h.controller.setReducedMotion(false);
  assert.equal(h.controller.getSnapshot().wave.points, state.wave.points);
  assert.deepEqual(points(h.controller.getSnapshot()), history);
  assert.equal(h.controller.getSnapshot().wave.revision, revision);
  h.advance(20_000);
  const completed = h.controller.getSnapshot();
  assert.equal(completed.phase, 'completed');
  assert.equal(completed.wave.points.length, 901);
  assert.deepEqual(points(completed).slice(0, history.length), history);
  const normal = harness();
  normal.controller.layoutReady();
  normal.advance(32_800);
  assert.deepEqual(points(completed), points(normal.controller.getSnapshot()));
  assert.equal(h.pending.size, 0);
});

test('后台切换动态效果不追加未来采样、不改写历史，恢复后沿原采样序号继续', () => {
  const h = harness();
  h.controller.layoutReady();
  h.advance(2_800);
  h.advance(1_234);
  h.controller.setActive(false);
  const paused = h.controller.getSnapshot();
  const history = points(paused);
  const revision = paused.wave.revision;
  h.advance(60_000);
  h.controller.setReducedMotion(true);
  h.controller.setReducedMotion(false);
  assert.equal(h.controller.getSnapshot().remainingMs, paused.remainingMs);
  assert.equal(h.controller.getSnapshot().wave.points, paused.wave.points);
  assert.equal(h.controller.getSnapshot().wave.revision, revision);
  assert.deepEqual(points(h.controller.getSnapshot()), history);
  assert.ok(history.at(-1)[0] <= 1_234);
  assert.equal(h.pending.size, 0);
  h.controller.setActive(true);
  h.advance(1_000);
  const resumed = h.controller.getSnapshot();
  assert.equal(resumed.runningElapsedMs, 2_234);
  assert.deepEqual(points(resumed).slice(0, history.length), history);
  assert.equal(resumed.wave.points.length, 68);
  assert.equal(resumed.wave.points.at(-1)[0], 67 * 1_000 / 30);
  h.controller.dispose();
});

test('离开取消调度且迟到回调不更新；重新进入是零进度空曲线', () => {
  const previous = harness();
  previous.controller.layoutReady();
  previous.advance(7_800);
  previous.controller.dispose();
  previous.controller.dispose();
  assert.equal(previous.pending.size, 0);
  const notifications = previous.notifications;
  const oldState = previous.controller.getSnapshot();
  for (const callback of previous.cancelledCallbacks) callback();
  previous.controller.setActive(false);
  previous.controller.setActive(true);
  previous.controller.layoutReady();
  previous.advance(60_000);
  assert.equal(previous.notifications, notifications);
  assert.equal(previous.controller.getSnapshot().remainingMs, oldState.remainingMs);
  const fresh = harness({ active: false });
  assert.equal(fresh.controller.getSnapshot().phase, 'ready');
  assert.equal(fresh.controller.getSnapshot().coverage, 0);
  assert.equal(fresh.controller.getSnapshot().remainingMs, 30_000);
  assert.equal(fresh.controller.getSnapshot().wave.points.length, 0);
  fresh.controller.layoutReady();
  fresh.advance(60_000);
  assert.equal(fresh.controller.getSnapshot().coverage, 0);
  fresh.controller.setActive(true);
  fresh.advance(1_200);
  assert.equal(fresh.controller.getSnapshot().coverage, 50);
  assert.equal(fresh.controller.getSnapshot().remainingMs, 30_000);
  fresh.controller.dispose();
});

test('恰好到时的系统动态效果切换不能清空已完成曲线', () => {
  const h = harness();
  h.controller.layoutReady();
  h.advance(2_800);
  h.jump(30_000);
  h.controller.setReducedMotion(true);
  const state = h.controller.getSnapshot();
  assert.equal(state.phase, 'completed');
  assert.equal(state.remainingMs, 0);
  assert.equal(state.wave.points.length, 901);
  assert.equal(state.runningElapsedMs, 30_000);
  assert.equal(points(state).at(-1)[0], 30_000);
  assert.equal(h.pending.size, 0);
});

test('波形局部订阅复用页面快照，取消一个消费者不影响另一个消费者或采样', () => {
  const h = harness();
  h.controller.layoutReady();
  h.advance(2_800);
  let firstUpdates = 0;
  const secondTimes = [];
  const unsubscribeFirst = h.controller.subscribeWave((snapshot) => {
    assert.equal(snapshot, h.lastNotification);
    firstUpdates += 1;
  });
  const unsubscribeSecond = h.controller.subscribeWave((snapshot) => {
    assert.equal(snapshot, h.lastNotification);
    secondTimes.push(snapshot.runningElapsedMs);
  });

  h.advance(100);
  assert.equal(firstUpdates, 2);
  assert.deepEqual(secondTimes, [50, 100]);
  const pointsReference = h.controller.getSnapshot().wave.points;
  unsubscribeFirst();
  unsubscribeFirst();
  h.advance(100);
  assert.equal(firstUpdates, 2);
  assert.deepEqual(secondTimes, [50, 100, 150, 200]);
  assert.equal(h.controller.getSnapshot().wave.points, pointsReference);
  assert.equal(pointsReference.length, 7);

  unsubscribeSecond();
  h.advance(100);
  assert.deepEqual(secondTimes, [50, 100, 150, 200]);
  assert.equal(h.controller.getSnapshot().runningElapsedMs, 300);
  assert.equal(pointsReference.length, 10);
  h.controller.dispose();
});

test('隐藏波形取消消费但保留完整历史，恢复订阅后收到完成末帧并保持冻结', () => {
  const h = harness();
  h.controller.layoutReady();
  h.advance(2_800);
  let rendered = h.controller.getSnapshot();
  let updates = 0;
  let unsubscribe = h.controller.subscribeWave((snapshot) => {
    rendered = snapshot;
    updates += 1;
  });
  h.advance(1_000);
  assert.equal(rendered.runningElapsedMs, 1_000);
  unsubscribe();
  const hiddenUpdates = updates;
  h.advance(28_950);
  assert.equal(updates, hiddenUpdates);
  assert.equal(rendered.runningElapsedMs, 1_000);

  rendered = h.controller.getSnapshot();
  assert.equal(rendered.runningElapsedMs, 29_950);
  assert.equal(rendered.wave.points.length, 899);
  unsubscribe = h.controller.subscribeWave((snapshot) => {
    rendered = snapshot;
    updates += 1;
  });
  h.advance(50);
  assert.equal(updates, hiddenUpdates + 1);
  assert.equal(rendered, h.lastNotification);
  assert.equal(rendered.phase, 'completed');
  assert.equal(rendered.runningElapsedMs, 30_000);
  assert.equal(rendered.remainingMs, 0);
  assert.equal(rendered.wave.points.length, 901);
  assert.equal(rendered.wave.points.at(-1)[0], 30_000);
  const finalFrame = rendered;
  h.advance(60_000);
  assert.equal(rendered, finalFrame);
  assert.equal(updates, hiddenUpdates + 1);
  unsubscribe();
  h.controller.dispose();
});

test('销毁释放波形订阅，迟到回调与旧实例不能更新重进后的消费者', () => {
  const previous = harness();
  let oldUpdates = 0;
  const unsubscribe = previous.controller.subscribeWave(() => { oldUpdates += 1; });
  previous.controller.layoutReady();
  previous.advance(2_850);
  previous.controller.dispose();
  const stoppedUpdates = oldUpdates;
  previous.controller.subscribeWave(() => { oldUpdates += 1; });
  for (const callback of previous.cancelledCallbacks) callback();
  previous.controller.setActive(false);
  previous.controller.setActive(true);
  assert.equal(oldUpdates, stoppedUpdates);
  unsubscribe();

  const fresh = harness();
  let freshFrame = fresh.controller.getSnapshot();
  const unsubscribeFresh = fresh.controller.subscribeWave((snapshot) => { freshFrame = snapshot; });
  assert.equal(freshFrame.wave.points.length, 0);
  fresh.controller.layoutReady();
  fresh.advance(2_800);
  assert.equal(freshFrame.phase, 'running');
  assert.equal(freshFrame.runningElapsedMs, 0);
  assert.equal(freshFrame.wave.points.length, 1);
  assert.notEqual(freshFrame.wave.points, previous.controller.getSnapshot().wave.points);
  assert.equal(oldUpdates, stoppedUpdates);
  unsubscribeFresh();
  fresh.controller.dispose();
});

test('覆盖提示以实际绘制进度为准，满环前不能进入准备开始', () => {
  assert.equal(getFingertipPresentation('covering', 0), 'ready');
  assert.equal(getFingertipPresentation('covering', 0.99), 'ready');
  assert.equal(getFingertipPresentation('covering', 1), 'partial');
  assert.equal(getFingertipPresentation('covering', 99.999), 'partial');
  assert.equal(getFingertipPresentation('covering', 100), 'covered');
});

test('离开覆盖阶段后，旧动画值不能覆盖等待、检测或完成提示', () => {
  assert.equal(getFingertipPresentation('ready', 100), 'ready');
  assert.equal(getFingertipPresentation('running', 98), 'running');
  assert.equal(getFingertipPresentation('completed', 0), 'completed');
});
