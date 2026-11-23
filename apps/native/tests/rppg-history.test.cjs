// 验证频谱均值、逐搏采集时间精度及旧历史缺值语义。
const assert = require('node:assert/strict');
const test = require('node:test');
const historyModule = import('../src/app/rppg/rppgHistory.ts');
const hrHeader = 'segmentIndex,windowStartNs,windowEndNs,heartRateBpm,valid,reason,spectralSnrDb\n';
const beatHeader = 'segmentIndex,previousPeakTimestampNs,peakTimestampNs,intervalNs,heartRateBpm\n';
const origin = 9007199254740993000n;

/** 构造已发布的本地会话合同，绝对纳秒有意超出JS安全整数范围。 */
function fixture(total = 3, valid = 2) {
  const artifact = { sessionId: 'history-a', source: 'passive', sampleCounts: { heartRateWindows: total, validHeartRateWindows: valid } };
  const session = JSON.stringify({ complete: true, sessionId: artifact.sessionId, source: 'passive', sensorTimeOriginNs: String(origin), startedAt: '2026-11-23T08:00:00Z', config: { configVersion: 'rppg-experiment-v2', targetMeasurementDurationNanos: 12e9, heartRateWindowNanos: 6e9 } });
  return { artifact, session };
}

test('本轮均值只统计有效频谱窗，逐搏序列保留独立读数与纳秒相减精度', async () => {
  const { parseRPPGHistory } = await historyModule;
  const { artifact, session } = fixture();
  const windows = hrHeader + `0,${origin},${origin + 6_000_000_000n},70,true,,12\n0,${origin + 1n},${origin + 6_000_000_001n},,false,LOW_SNR,1\n0,${origin + 2n},${origin + 6_000_000_002n},80,true,,15\n`;
  const beats = beatHeader + `0,${origin + 1n},${origin + 750_000_001n},750000000,80\n1,${origin + 3_000_000_001n},${origin + 3_600_000_001n},600000000,100\n`;
  const data = parseRPPGHistory(artifact, session, windows, beats);
  assert.equal(data.averageHeartRateBpm, 75);
  assert.equal(data.validWindowCount, 2);
  assert.deepEqual(data.beats, [
    { segmentIndex: 0, timeMs: 750.000001, intervalMs: 750, heartRateBpm: 80 },
    { segmentIndex: 1, timeMs: 3600.000001, intervalMs: 600, heartRateBpm: 100 },
  ]);
  assert.equal(data.targetSeconds, 12);
  assert.equal(data.windowSeconds, 6);
});

test('没有有效窗口不补零，旧历史未保存逐搏与新历史没有合格搏动分别表达', async () => {
  const { parseRPPGHistory } = await historyModule;
  const { artifact, session } = fixture(0, 0);
  const old = parseRPPGHistory(artifact, session, hrHeader, null);
  assert.equal(old.averageHeartRateBpm, null);
  assert.equal(old.beats, null);
  const current = parseRPPGHistory(artifact, session, hrHeader, beatHeader);
  assert.equal(current.averageHeartRateBpm, null);
  assert.deepEqual(current.beats, []);
});

test('窗口读取不完整或逐搏RR损坏时不能发布部分平均值', async () => {
  const { parseRPPGHistory } = await historyModule;
  const current = fixture();
  assert.throws(() => parseRPPGHistory(current.artifact, current.session, hrHeader, null), /INCOMPLETE_WINDOWS/);
  const empty = fixture(0, 0);
  const beats = beatHeader + `0,${origin},${origin + 750_000_000n},600000000,80\n`;
  assert.throws(() => parseRPPGHistory(empty.artifact, empty.session, hrHeader, beats), /INVALID_BEAT/);
});
