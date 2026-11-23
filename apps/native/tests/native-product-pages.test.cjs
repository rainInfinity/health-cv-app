// 验证最新记录消费者的独立时间、真实空态与认证隔离。
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  selectHealthPresentation,
} = require('../node_modules/.cache/native-test/pages/home/healthPresentation.js');
const { formatRiskLevel } = require('../node_modules/.cache/native-test/shared/healthNumber.js');

const authenticated = { status: 'authenticated', userId: 7, username: 'member' };
const emptyStates = [{ status: 'anonymous' }, { status: 'restoring' }, { status: 'unavailable', reason: 'network' }];
const record = (metric, code, value, submittedAt) => ({
  recordId: `42:${metric}`, taskId: 42, metric, submittedAt,
  captureMethod: null, captureMode: null, durationMs: null,
  readings: [{ code, value, unit: 'beats_per_minute' }],
  quality: null, riskLevel: null, modelId: 3, versionId: 9,
  version: '2.1', algorithmKey: 'ppg.active.offline.hr_br.v1',
});
const latest = {
  bloodPressure: { ...record('bloodPressure', 'dbp', 81.3, '2026-11-22 23:59:00'), readings: [
    { code: 'dbp', value: 81.3, unit: 'mmHg' }, { code: 'sbp', value: 129.7, unit: 'mmHg' },
  ] },
  heartRate: record('heartRate', 'hr', 68.2, '2026-11-23 00:01:00'),
  respirationRate: record('respirationRate', 'br', 14.8, '2026-11-21 12:15:00'),
  oxygenSaturation: null,
  diabetesRisk: { ...record('diabetesRisk', 'diabetes_probability', .5523077249526978, '2026-11-20 10:00:00'), riskLevel: 0 },
};

test('每个指标使用自己的提交时间与原始读数，空项不借其他指标值或本地面部结果', () => {
  const view = selectHealthPresentation(authenticated, latest);
  assert.deepEqual([view.systolic, view.diastolic, view.heartRate, view.respirationRate, view.oxygenSaturation], [129.7, 81.3, 68.2, 14.8, null]);
  assert.equal(view.records.heartRate.submittedAt, '2026-11-23 00:01:00');
  assert.equal(view.records.respirationRate.submittedAt, '2026-11-21 12:15:00');
  assert.equal(view.records.oxygenSaturation, null);
  assert.equal(view.diabetesRisk, 0);
  assert.equal(view.records.diabetesRisk.riskLevel, 0);
});

test('首页三档文案只读取后端编码，缺失档位不按概率推算', () => {
  for (const [riskLevel, label] of [[0, '较低\n风险'], [1, '中\n风险'], [2, '较高\n风险'], [null, '--']]) {
    const source = { ...latest, diabetesRisk: { ...latest.diabetesRisk, riskLevel, readings: [{ code: 'diabetes_probability', value: .99, unit: 'ratio' }] } };
    const view = selectHealthPresentation(authenticated, source);
    assert.equal(formatRiskLevel(view.diabetesRisk), label);
    assert.equal(view.records.diabetesRisk.readings[0].value, .99);
  }
});

test('认证未确认时即使旧响应仍在也清空所有健康数据与时间', () => {
  for (const auth of emptyStates) {
    const view = selectHealthPresentation(auth, latest);
    assert.deepEqual([view.systolic, view.diastolic, view.heartRate, view.respirationRate, view.oxygenSaturation, view.diabetesRisk], Array(6).fill(null));
    assert.ok(Object.values(view.records).every((value) => value === null));
  }
});

