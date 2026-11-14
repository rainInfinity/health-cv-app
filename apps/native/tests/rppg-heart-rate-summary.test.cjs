// 验证重复、无效、迟到及跨会话心率窗口不会污染有效平均值。

const assert = require('node:assert/strict');
const test = require('node:test');

const heartRateSummaryModule = import('../src/app/rppg/rppgHeartRateSummary.ts');

function heartRateWindow({ start, end, bpm, valid, segmentIndex = 0, reason = null }) {
  return {
    segmentIndex,
    windowStartNanos: String(start),
    windowEndNanos: String(end),
    heartRateBpm: bpm,
    valid,
    reason,
    spectralSnrDb: valid ? 8 : null,
  };
}

function snapshot(sessionId, latestHeartRate, phase = 'measuring') {
  return { sessionId, latestHeartRate, phase };
}

test('有效窗口只累计一次，无效与迟到窗口不覆盖上次有效值', async () => {
  const { accumulateRPPGHeartRateSnapshot, createEmptyRPPGHeartRateSummary } = await heartRateSummaryModule;
  const firstValid = heartRateWindow({ start: 1_000, end: 12_000, bpm: 70, valid: true });
  let summary = accumulateRPPGHeartRateSnapshot(
    createEmptyRPPGHeartRateSummary(),
    snapshot('session-a', firstValid),
  );
  assert.equal(summary.validWindowCount, 1);
  assert.equal(summary.validHeartRateSum / summary.validWindowCount, 70);

  summary = accumulateRPPGHeartRateSnapshot(summary, snapshot('session-a', firstValid));
  assert.equal(summary.validWindowCount, 1);

  const invalid = heartRateWindow({ start: 2_000, end: 13_000, bpm: null, valid: false, reason: 'LOW_SNR' });
  summary = accumulateRPPGHeartRateSnapshot(summary, snapshot('session-a', invalid));
  assert.equal(summary.latestWindow.valid, false);
  assert.equal(summary.lastValidWindow, firstValid);
  assert.equal(summary.validWindowCount, 1);

  const secondValid = heartRateWindow({ start: 3_000, end: 14_000, bpm: 80, valid: true });
  summary = accumulateRPPGHeartRateSnapshot(summary, snapshot('session-a', secondValid));
  assert.equal(summary.validWindowCount, 2);
  assert.equal(summary.validHeartRateSum / summary.validWindowCount, 75);

  summary = accumulateRPPGHeartRateSnapshot(summary, snapshot('session-a', firstValid));
  assert.equal(summary.latestWindow, secondValid);
  assert.equal(summary.validWindowCount, 2);
});

test('新会话重置前一会话的窗口累计', async () => {
  const { accumulateRPPGHeartRateSnapshot, createEmptyRPPGHeartRateSummary } = await heartRateSummaryModule;
  const oldWindow = heartRateWindow({ start: 1_000, end: 12_000, bpm: 70, valid: true });
  const newWindow = heartRateWindow({ start: 1_000, end: 12_000, bpm: 62, valid: true });
  const previous = accumulateRPPGHeartRateSnapshot(
    createEmptyRPPGHeartRateSummary(),
    snapshot('session-a', oldWindow),
  );
  const next = accumulateRPPGHeartRateSnapshot(previous, snapshot('session-b', newWindow));

  assert.equal(next.sessionId, 'session-b');
  assert.equal(next.validWindowCount, 1);
  assert.equal(next.validHeartRateSum, 62);
  assert.equal(next.lastValidWindow, newWindow);
});

test('切段及大整数纳秒使用窗口身份去重，逐搏初步值不参与频谱平均', async () => {
  const { accumulateRPPGHeartRateSnapshot, createEmptyRPPGHeartRateSummary } = await heartRateSummaryModule;
  const first = heartRateWindow({ start: '90071992547409930', end: '90071992547419930', bpm: 72, valid: true });
  let summary = accumulateRPPGHeartRateSnapshot(createEmptyRPPGHeartRateSummary(), {
    ...snapshot('session-a', first), latestInstantHeartRate: { heartRateBpm: 140 },
  });
  const second = heartRateWindow({ start: '90071992547409931', end: '90071992547419931', bpm: 78, valid: true });
  summary = accumulateRPPGHeartRateSnapshot(summary, snapshot('session-a', second));
  assert.equal(summary.validWindowCount, 2);
  assert.equal(summary.validHeartRateSum / summary.validWindowCount, 75);
  const newSegment = heartRateWindow({ start: '1', end: '2', bpm: 90, valid: true, segmentIndex: 1 });
  summary = accumulateRPPGHeartRateSnapshot(summary, snapshot('session-a', newSegment));
  summary = accumulateRPPGHeartRateSnapshot(summary, snapshot('session-a', second));
  assert.equal(summary.validWindowCount, 3);
  assert.equal(summary.latestWindow, newSegment);
  const instantOnly = accumulateRPPGHeartRateSnapshot(createEmptyRPPGHeartRateSummary(), {
    ...snapshot('session-b', null), latestInstantHeartRate: { heartRateBpm: 140 },
  });
  assert.equal(instantOnly.validWindowCount, 0);
  assert.equal(instantOnly.validHeartRateSum, 0);
});

test('已关闭会话清空摘要，无效非有限读数不纳入有效累计', async () => {
  const { accumulateRPPGHeartRateSnapshot, createEmptyRPPGHeartRateSummary } = await heartRateSummaryModule;
  const invalid = heartRateWindow({ start: 1, end: 2, bpm: Number.NaN, valid: true });
  const summary = accumulateRPPGHeartRateSnapshot(createEmptyRPPGHeartRateSummary(), snapshot('session-a', invalid));
  assert.equal(summary.validWindowCount, 0);
  assert.equal(summary.lastValidWindow, null);
  const closed = accumulateRPPGHeartRateSnapshot(summary, snapshot(null, null, 'closed'));
  assert.deepEqual(closed, createEmptyRPPGHeartRateSummary());
});
