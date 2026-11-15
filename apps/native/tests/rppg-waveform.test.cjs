// 验证真实波形的有界开发窗口、本轮产品历史、会话隔离与断线规则。

const assert = require('node:assert/strict');
const test = require('node:test');
const waveformModule = import('../src/app/rppg/rppgWaveform.ts');

function batch(overrides = {}) {
  return { sessionId: 'session-a', segmentIndex: 0, sequence: 0, startTimeMs: 0, sampleIntervalMs: 50, values: [1, 2, 3], ...overrides };
}

const boundedLimit = { durationMillis: 6_000, maxPoints: 120 };

test('有界追加同时限制跨度及容量，开发窗口保持十五秒300点且不改写原批次', async () => {
  const { appendRPPGRealtimeBatch } = await waveformModule;
  const source = batch({ values: Array.from({ length: 500 }, (_, index) => index) });
  const original = structuredClone(source);
  const bounded = appendRPPGRealtimeBatch([], source, boundedLimit);
  const dev = appendRPPGRealtimeBatch([], source, { durationMillis: 15_000, maxPoints: 300 });
  assert.equal(bounded.length, 120);
  assert.equal(dev.length, 300);
  assert.equal(bounded.at(-1).timeMs - bounded[0].timeMs, 5_950);
  assert.equal(dev.at(-1).timeMs - dev[0].timeMs, 14_950);
  assert.deepEqual(source, original);
  const afterGap = appendRPPGRealtimeBatch(bounded, batch({ sequence: 1, startTimeMs: 40_000 }), boundedLimit);
  assert.equal(afterGap.length, 3);
  assert.equal(afterGap[0].timeMs, 40_000);
});

test('重复或迟到批次不改变曲线，跨会话立即清除旧窗口', async () => {
  const { appendRPPGRealtimeBatch } = await waveformModule;
  const first = appendRPPGRealtimeBatch([], batch({ sequence: 10 }), boundedLimit);
  assert.strictEqual(appendRPPGRealtimeBatch(first, batch({ sequence: 10, values: [99] }), boundedLimit), first);
  assert.strictEqual(appendRPPGRealtimeBatch(first, batch({ sequence: 9, values: [99] }), boundedLimit), first);
  const next = appendRPPGRealtimeBatch(first, batch({ sessionId: 'session-b', values: [9] }), boundedLimit);
  assert.equal(next.length, 1);
  assert.equal(next[0].sessionId, 'session-b');
  assert.equal(next[0].value, 9);
});

test('同批相邻与连续新批可连线，漏批、切段及采集时间缺口均断线', async () => {
  const { appendRPPGRealtimeBatch, areRPPGSamplesContinuous } = await waveformModule;
  const first = appendRPPGRealtimeBatch([], batch(), boundedLimit);
  assert.equal(areRPPGSamplesContinuous(first[0], first[1]), true);
  const last = first.at(-1);
  const nextPoint = (overrides) => appendRPPGRealtimeBatch([], batch({ sequence: 1, startTimeMs: 150, ...overrides }), boundedLimit)[0];
  assert.equal(areRPPGSamplesContinuous(last, nextPoint({})), true);
  assert.equal(areRPPGSamplesContinuous(last, nextPoint({ sequence: 2 })), false);
  assert.equal(areRPPGSamplesContinuous(last, nextPoint({ segmentIndex: 1 })), false);
  assert.equal(areRPPGSamplesContinuous(last, nextPoint({ startTimeMs: 300 })), false);
  assert.equal(areRPPGSamplesContinuous(last, nextPoint({ sessionId: 'session-b' })), false);
});

test('裁剪保留原批次内位置，不在容量边界合成或补零', async () => {
  const { appendRPPGRealtimeBatch } = await waveformModule;
  const first = appendRPPGRealtimeBatch([], batch({ values: [4, -1, 7, 2] }), { durationMillis: 100, maxPoints: 2 });
  assert.deepEqual(first.map(({ valueIndex, value }) => [valueIndex, value]), [[2, 7], [3, 2]]);
});

test('图表在每个真实缺口断线，并保留采集时间、幅值与固定窗口', async () => {
  const { appendRPPGRealtimeBatch, buildRPPGWaveformPlot } = await waveformModule;
  const continuous = appendRPPGRealtimeBatch([], batch({ values: [-2, 3] }), boundedLimit);
  const withGap = appendRPPGRealtimeBatch(continuous, batch({ sequence: 2, startTimeMs: 200, values: [7, -1] }), boundedLimit);
  const original = structuredClone(withGap);
  const plot = buildRPPGWaveformPlot(withGap, 6_000);
  assert.deepEqual(plot.points, [[0, -2], [50, 3], [125, null], [200, 7], [250, -1]]);
  assert.equal(plot.startTimeMs, -5_750);
  assert.equal(plot.endTimeMs, 250);
  assert.equal(plot.minimum, -7);
  assert.equal(plot.maximum, 2);
  assert.deepEqual(withGap, original);
  const cutSegment = withGap.map((sample, index) => ({ ...sample, segmentIndex: index >= 3 ? 1 : 0 }));
  assert.equal(buildRPPGWaveformPlot(cutSegment, 6_000).points.filter(([, value]) => value === null).length, 2);
});

test('空图和恒定信号仍有合法坐标范围，不以零值伪造曲线', async () => {
  const { appendRPPGRealtimeBatch, buildRPPGWaveformPlot } = await waveformModule;
  const empty = buildRPPGWaveformPlot([], 6_000);
  assert.deepEqual(empty.points, []);
  assert.equal(empty.endTimeMs - empty.startTimeMs, 6_000);
  assert.ok(empty.maximum > empty.minimum);
  const constant = appendRPPGRealtimeBatch([], batch({ values: [4, 4, 4] }), boundedLimit);
  const plot = buildRPPGWaveformPlot(constant, 6_000);
  assert.equal((-4 - plot.minimum) / (plot.maximum - plot.minimum), 0.5);
  const one = buildRPPGWaveformPlot(constant.slice(0, 1));
  assert.equal(one.endTimeMs - one.startTimeMs, 50);
});

test('产品保留整轮三十秒真实历史，首样本归零且追加不复制或改写早期样本', async () => {
  const { createRPPGWaveformHistory, appendRPPGWaveformHistory } = await waveformModule;
  const history = createRPPGWaveformHistory();
  const first = batch({ startTimeMs: 73_000, values: Array.from({ length: 150 }, (_, index) => index - 20) });
  const original = structuredClone(first);
  assert.equal(appendRPPGWaveformHistory(history, first), true);
  const points = history.points;
  const earlyPoint = points[0];
  const earlyHistory = structuredClone(points);
  appendRPPGWaveformHistory(history, batch({
    sequence: 1, startTimeMs: 80_500, values: Array.from({ length: 450 }, (_, index) => index + 130),
  }));
  assert.strictEqual(history.points, points);
  assert.strictEqual(history.points[0], earlyPoint);
  assert.deepEqual(history.points.slice(0, 150), earlyHistory);
  assert.deepEqual(first, original);
  assert.deepEqual(history.points[0], [0, -20]);
  assert.equal(history.points.length, 600);
  assert.equal(history.latestTimeMs, 29_950);
  assert.deepEqual(history.points.at(-1), [29_950, 579]);
  assert.equal(history.lastSample.timeMs, 102_950);
});

test('产品历史拒绝重复迟到批次，新会话与独立历史不携带上一轮数据', async () => {
  const { createRPPGWaveformHistory, appendRPPGWaveformHistory } = await waveformModule;
  const history = createRPPGWaveformHistory();
  appendRPPGWaveformHistory(history, batch({ sequence: 10, values: [-100, 100] }));
  const original = structuredClone(history);
  assert.equal(appendRPPGWaveformHistory(history, batch({ sequence: 10, values: [99] })), false);
  assert.equal(appendRPPGWaveformHistory(history, batch({ sequence: 9, values: [99] })), false);
  assert.deepEqual(history, original);
  const independent = createRPPGWaveformHistory();
  assert.deepEqual(independent.points, []);
  appendRPPGWaveformHistory(history, batch({ sessionId: 'session-b', startTimeMs: 650_000, values: [4] }));
  assert.deepEqual(history.points, [[0, 4]]);
  assert.equal(history.originTimeMs, 650_000);
  assert.equal(history.latestTimeMs, 0);
  assert.deepEqual(independent.points, []);
});

test('产品历史按相对采集时间追加，漏批、切段和时间缺口各自插入空值而不补造样本', async () => {
  const { createRPPGWaveformHistory, appendRPPGWaveformHistory } = await waveformModule;
  const history = createRPPGWaveformHistory();
  appendRPPGWaveformHistory(history, batch({ startTimeMs: 70_000, values: [-2, 3] }));
  appendRPPGWaveformHistory(history, batch({ sequence: 2, startTimeMs: 70_200, values: [7, -1] }));
  appendRPPGWaveformHistory(history, batch({ sequence: 3, segmentIndex: 1, startTimeMs: 70_300, values: [4, 6] }));
  appendRPPGWaveformHistory(history, batch({ sequence: 4, segmentIndex: 1, startTimeMs: 70_600, values: [1] }));
  assert.deepEqual(history.points, [
    [0, -2], [50, 3], [125, null], [200, 7], [250, -1],
    [275, null], [300, 4], [350, 6], [475, null], [600, 1],
  ]);
});

test('早期异常离开六秒窗口后恢复正常振幅，回看仍使用当时窗口的尺度', async () => {
  const { createRPPGWaveformHistory, appendRPPGWaveformHistory } = await waveformModule;
  const { getPulseWindowRange, selectPulseWindow } = await import('../src/shared/components/PulseWaveHistory/pulseWaveWindow.ts');
  const history = createRPPGWaveformHistory();
  appendRPPGWaveformHistory(history, batch({ values: [-1_000, 1_000] }));
  appendRPPGWaveformHistory(history, batch({ sequence: 1, startTimeMs: 7_000, values: [2, 8, 3, 7] }));
  const range = (start) => getPulseWindowRange(selectPulseWindow(history.points, start, 200), start);
  const normal = range(1_150);
  const ratio = (value) => (value - normal.minimum) / (normal.maximum - normal.minimum);
  assert.ok(Math.abs(ratio(-8) - 0.1) < 1e-12);
  assert.ok(Math.abs(ratio(-2) - 0.85) < 1e-12);
  const early = range(0);
  assert.ok(early.maximum - early.minimum > 2_000);
  appendRPPGWaveformHistory(history, batch({ sequence: 2, startTimeMs: 15_000, values: [-99_000, 99_000] }));
  assert.deepEqual(range(1_150), normal);
  assert.deepEqual(range(0), early);
  assert.deepEqual(history.points.slice(0, 2), [[0, -1_000], [50, 1_000]]);
});
