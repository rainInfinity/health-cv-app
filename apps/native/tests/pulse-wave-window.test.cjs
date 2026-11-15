// 验证历史回看不漂移、起始留白及窗口边缘真实断线。

const assert = require('node:assert/strict');
const test = require('node:test');
const windowModule = import('../src/shared/components/PulseWaveHistory/pulseWaveWindow.ts');
const displayModule = import('../src/shared/components/PulseWaveChart/pulseWaveDisplay.ts');

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

test('纵轴仅取当前六秒真实样本，预绘区、邻点及新来的窗口外极值均不改变留白', async () => {
  const { getPulseWindowRange, selectPulseWindow } = await windowModule;
  const history = [[0, -1e6], [750, 1e6], [950, -1e5], [1_000, 2], [2_000, null], [6_950, 8], [7_100, -1e5], [7_250, 1e6]];
  const original = structuredClone(history);
  const range = () => getPulseWindowRange(selectPulseWindow(history, 1_000, 200), 1_000);
  const current = range();
  assert.ok(Math.abs((-8 - current.minimum) / (current.maximum - current.minimum) - 0.1) < 1e-12);
  assert.ok(Math.abs((-2 - current.minimum) / (current.maximum - current.minimum) - 0.85) < 1e-12);
  history.push([15_000, 1e9]);
  assert.deepEqual(range(), current);
  assert.deepEqual(history.slice(0, original.length), original);
});

test('空窗和常量用窄坐标范围而不造样本，真实缺口与原始幅值不变', async () => {
  const { getPulseWindowRange, selectPulseWindow } = await windowModule;
  const points = [[0, 9], [100, null], [200, 9]];
  const original = structuredClone(points);
  const constant = getPulseWindowRange(selectPulseWindow(points, 0, 200), 0);
  assert.ok(constant.minimum < -9 && constant.maximum > -9);
  assert.ok(constant.maximum - constant.minimum <= 1);
  const empty = getPulseWindowRange(selectPulseWindow(points, 10_000, 200), 10_000);
  assert.ok(Number.isFinite(empty.minimum) && Number.isFinite(empty.maximum) && empty.maximum > empty.minimum);
  assert.ok(empty.maximum - empty.minimum <= 1);
  assert.deepEqual(points, original);
});

test('共享绘图仅翻转展示，零值不断线、真实缺口保留，重复渲染不反转原始历史', async () => {
  const { buildPulseDisplayPoints } = await displayModule;
  const original = [[0, 2], [25, 0], [50, -3], [75, null], [100, 8]];
  const points = Object.freeze(original.map((point) => Object.freeze([...point])));
  const expected = [[0, -2], [25, -0], [50, 3], [75, null], [100, -8]];
  assert.deepEqual(buildPulseDisplayPoints(points), expected);
  assert.deepEqual(buildPulseDisplayPoints(points), expected);
  assert.deepEqual(points, original);
  const { getPulseWindowRange } = await windowModule;
  const axis = getPulseWindowRange(points, 0);
  const position = (value) => (value - axis.minimum) / (axis.maximum - axis.minimum);
  assert.ok(Math.abs(position(-8) - 0.1) < 1e-12);
  assert.ok(Math.abs(position(3) - 0.85) < 1e-12);
});
