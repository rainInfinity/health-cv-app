// 验证历史回看不漂移、起始留白及窗口边缘真实断线。

const assert = require('node:assert/strict');
const test = require('node:test');
const windowModule = import('../src/shared/components/PulseWaveHistory/pulseWaveWindow.ts');

test('起始样点在右侧；超过六秒后可回看并保持绝对时间段', async () => {
  const { clampPulseWindowStart, formatPulseWindow } = await windowModule;
  assert.equal(clampPulseWindowStart(1_000, null), -5_000);
  assert.equal(clampPulseWindowStart(1_000, 0), -5_000);
  assert.equal(formatPulseWindow(-5_000), '0.0–1.0 秒');
  assert.equal(clampPulseWindowStart(12_000, null), 6_000);
  assert.equal(clampPulseWindowStart(12_000, 2_000), 2_000);
  assert.equal(clampPulseWindowStart(18_000, 2_000), 2_000);
  assert.equal(clampPulseWindowStart(18_000, -100), 0);
  assert.equal(clampPulseWindowStart(18_000, 99_000), 12_000);
  assert.equal(formatPulseWindow(2_000), '2.0–8.0 秒');
});

test('只向渲染器提供视窗邻点，边缘缺口保持断开且不改写历史', async () => {
  const { selectPulseWindow } = await windowModule;
  const history = [[0, 1], [1_000, 2], [2_000, null], [3_000, 4], [7_000, 5], [8_000, null], [9_000, 6], [10_000, 7]];
  const original = structuredClone(history);
  assert.deepEqual(selectPulseWindow(history, 2_500), history.slice(2, 7));
  assert.deepEqual(selectPulseWindow(history, -5_000), history.slice(0, 2));
  assert.deepEqual(history, original);
  assert.deepEqual(selectPulseWindow([], 0), []);
});

test('原生平移预绘区保留前后真实样本和缺口，不扩大六秒交互视窗', async () => {
  const { selectPulseWindow, clampPulseWindowStart } = await windowModule;
  const history = [[0, 1], [750, 2], [850, null], [950, 3], [1_000, 4], [6_950, 5], [7_100, null], [7_250, 6], [8_000, 7]];
  assert.equal(clampPulseWindowStart(7_000, null), 1_000);
  assert.deepEqual(selectPulseWindow(history, 1_000, 200), history.slice(1, 8));
});
