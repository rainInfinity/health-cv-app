// 验证认证变化对页面健康展示的隔离及固定记录间隔边界。

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getMeasurementRecency,
  selectHealthPresentation,
} = require('../node_modules/.cache/native-test/pages/home/healthPresentation.js');

const authenticated = { status: 'authenticated', userId: 7, username: 'member' };
const emptyStates = [
  { status: 'anonymous' },
  { status: 'restoring' },
  { status: 'unavailable', reason: 'network' },
];

test('只有确认登录后提供固定页面读数，其余认证状态均为空', () => {
  const presentation = selectHealthPresentation(authenticated);
  assert.deepEqual(
    [presentation.systolic, presentation.diastolic, presentation.heartRate, presentation.respirationRate, presentation.oxygenSaturation],
    [118, 76, 72, 16, 98],
  );
  assert.equal(presentation.measuredAt, '2026-10-31T08:30:00+08:00');

  for (const state of emptyStates) {
    const empty = selectHealthPresentation(state);
    assert.equal(empty.measuredAt, null);
    assert.deepEqual(
      [empty.systolic, empty.diastolic, empty.heartRate, empty.respirationRate, empty.oxygenSaturation],
      [null, null, null, null, null],
    );
  }
});

test('测量间隔保留无记录、时钟偏早及分钟小时天边界', () => {
  assert.deepEqual(getMeasurementRecency(null, 0), { kind: 'none' });
  assert.deepEqual(getMeasurementRecency('1970-01-01T00:01:00Z', 0), { kind: 'future' });
  assert.deepEqual(getMeasurementRecency('1970-01-01T00:00:00Z', 30_000), { kind: 'recent' });
  assert.deepEqual(getMeasurementRecency('1970-01-01T00:00:00Z', 120_000), {
    kind: 'elapsed', value: 2, unit: 'minute',
  });
  assert.deepEqual(getMeasurementRecency('1970-01-01T00:00:00Z', 7_200_000), {
    kind: 'elapsed', value: 2, unit: 'hour',
  });
  assert.deepEqual(getMeasurementRecency('1970-01-01T00:00:00Z', 172_800_000), {
    kind: 'elapsed', value: 2, unit: 'day',
  });
  assert.deepEqual(getMeasurementRecency('invalid', 0), { kind: 'unknown' });
});
