// 验证开屏时长、冷启动目标和设备引导完成失败边界。

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  recordOnboardingCompletion,
  resolveStartupDestination,
  STARTUP_VISIBLE_DURATION_MS,
  StartupDelay,
} = require('../node_modules/.cache/native-test/app/startup/startupFlow.js');

class FakeScheduler {
  time = 0;
  nextId = 0;
  timers = new Map();

  now() {
    return this.time;
  }

  setTimeout(callback, delayMs) {
    const id = ++this.nextId;
    this.timers.set(id, { callback, deadline: this.time + delayMs });
    return id;
  }

  clearTimeout(id) {
    this.timers.delete(id);
  }

  advanceBy(durationMs) {
    this.time += durationMs;
    while (true) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.deadline <= this.time)
        .sort((left, right) => left[1].deadline - right[1].deadline)[0];
      if (due == null) return;
      this.timers.delete(due[0]);
      due[1].callback();
    }
  }
}

test('冷启动被动深链优先于引导且不改变引导完成标记', () => {
  assert.equal(resolveStartupDestination('healthcvapp://passive-capture', false), 'passive-capture');
  assert.equal(resolveStartupDestination('HEALTHCVAPP://PASSIVE-CAPTURE?source=system', true), 'passive-capture');
  assert.equal(resolveStartupDestination('healthcvapp://passive-captures', false), 'onboarding');
  assert.equal(resolveStartupDestination(null, false), 'onboarding');
  assert.equal(resolveStartupDestination(null, true), 'product');
});

test('引导完成只在存储成功时回报完成，失败保持可浏览', () => {
  let persisted = false;
  assert.equal(recordOnboardingCompletion(() => { persisted = true; }), true);
  assert.equal(persisted, true);
  assert.equal(recordOnboardingCompletion(() => { throw new Error('storage unavailable'); }), false);
});

test('开屏只累计前台可见时间并在恢复后单次完成', () => {
  const scheduler = new FakeScheduler();
  let completions = 0;
  const delay = new StartupDelay(() => { completions += 1; }, STARTUP_VISIBLE_DURATION_MS, scheduler);

  delay.start(false);
  scheduler.advanceBy(5000);
  assert.equal(completions, 0);
  assert.equal(scheduler.timers.size, 0);

  delay.setForeground(true);
  scheduler.advanceBy(500);
  const staleCallback = [...scheduler.timers.values()][0].callback;
  delay.setForeground(false);
  staleCallback();
  scheduler.advanceBy(5000);
  assert.equal(completions, 0);

  delay.setForeground(true);
  scheduler.advanceBy(STARTUP_VISIBLE_DURATION_MS - 500);
  assert.equal(completions, 1);
  delay.setForeground(false);
  delay.setForeground(true);
  delay.start(true);
  assert.equal(completions, 1);
  assert.equal(scheduler.timers.size, 0);
});

test('卸载开屏会取消计时并忽略迟到回调', () => {
  const scheduler = new FakeScheduler();
  let completions = 0;
  const delay = new StartupDelay(() => { completions += 1; }, 100, scheduler);
  delay.start();
  const staleCallback = [...scheduler.timers.values()][0].callback;
  delay.dispose();
  staleCallback();
  scheduler.advanceBy(100);
  assert.equal(completions, 0);
  assert.equal(scheduler.timers.size, 0);
});
