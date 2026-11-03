// 验证替换提示只有一个有效计时器，加载态不会自动过期。

const assert = require('node:assert/strict');
const test = require('node:test');

const { SingleToastLifecycle } = require('../node_modules/.cache/native-test/shared/components/FeedbackHost/toastLifecycle.js');

class FakeTimerScheduler {
  nextId = 0;
  active = new Map();
  callbacks = new Map();

  setTimeout(callback, delayMs) {
    const id = ++this.nextId;
    this.active.set(id, delayMs);
    this.callbacks.set(id, callback);
    return id;
  }

  clearTimeout(id) {
    this.active.delete(id);
  }

  fire(id) {
    this.active.delete(id);
    this.callbacks.get(id)?.();
  }
}

test('新 Toast 替换旧计时器且迟到回调不能关闭当前提示', () => {
  const scheduler = new FakeTimerScheduler();
  const lifecycle = new SingleToastLifecycle(scheduler);
  const expired = [];

  lifecycle.replace({ id: 1, tone: 'information' }, (id) => expired.push(id));
  const staleTimer = 1;
  assert.deepEqual([...scheduler.active.values()], [3500]);

  lifecycle.replace({ id: 2, tone: 'error', durationMs: 7000 }, (id) => expired.push(id));
  assert.deepEqual([...scheduler.active.values()], [7000]);
  scheduler.fire(staleTimer);
  assert.deepEqual(expired, []);
  scheduler.fire(2);
  assert.deepEqual(expired, [2]);
  assert.equal(scheduler.active.size, 0);
});

test('加载 Toast 无自动计时，手动关闭或替换后按普通状态过期', () => {
  const scheduler = new FakeTimerScheduler();
  const lifecycle = new SingleToastLifecycle(scheduler);
  const expired = [];

  lifecycle.replace({ id: 1, tone: 'loading' }, (id) => expired.push(id));
  assert.equal(scheduler.active.size, 0);
  lifecycle.dismiss();
  assert.deepEqual(expired, []);

  lifecycle.replace({ id: 2, tone: 'loading' }, (id) => expired.push(id));
  lifecycle.replace({ id: 3, tone: 'success' }, (id) => expired.push(id));
  assert.deepEqual([...scheduler.active.values()], [3500]);
  scheduler.fire(1);
  assert.deepEqual(expired, [3]);
});

test('卸载 Toast 主机会清除仍有效的计时器', () => {
  const scheduler = new FakeTimerScheduler();
  const lifecycle = new SingleToastLifecycle(scheduler);
  lifecycle.replace({ id: 9, tone: 'success' }, () => assert.fail('已卸载的提示不得回调'));
  lifecycle.dispose();
  assert.equal(scheduler.active.size, 0);
});
