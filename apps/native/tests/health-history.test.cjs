// 验证真实历史消费者：完整区间、同日多条、全区间统计、风险与北京时间。
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  adjacentHistoryMetric, calendarMonthCells, calendarTimestamp, commitHistoryRange,
  formatHistoryNumber, formatHistoryValue,
  initialHistoryFilter, isValidHistoryRange, moveCalendarDate, moveCalendarMonth,
  moveHistoryPeriod, selectHistoryPeriod, selectHistoryView,
} = require('../node_modules/.cache/native-test/pages/history/historyModel.js');
const { beijingToday, formatBeijingDateTime, parseSubmittedAt } = require('../node_modules/.cache/native-test/shared/dateTime.js');

const authenticated = { status: 'authenticated', userId: 7, username: 'member' };
const now = Date.parse('2026-11-22T16:01:00Z');
const filter = () => initialHistoryFilter(now);
function record(taskId, submittedAt, values = [120, 80], overrides = {}) {
  return {
    recordId: `${taskId}:bloodPressure`, taskId, metric: 'bloodPressure', submittedAt,
    captureMethod: 'fingertip_chest', captureMode: 'active', durationMs: 30001,
    readings: [{ code: 'dbp', value: values[1], unit: 'mmHg' }, { code: 'sbp', value: values[0], unit: 'mmHg' }],
    quality: { score: 81.5, threshold: 70 }, riskLevel: null, modelId: 5,
    versionId: 11, version: '2.0.0', algorithmKey: 'ppg_acc.active.offline.bp.v1',
    ...overrides,
  };
}
const interval = (items, complete = true, error = null, total = items.length) => ({ items, total, complete, error });

test('北京时间日界决定默认今日七日，无时区submittedAt不按设备时区解析', () => {
  assert.equal(beijingToday(Date.parse('2026-11-22T15:59:59Z')), '2026-11-22');
  assert.equal(beijingToday(now), '2026-11-23');
  assert.deepEqual([filter().from, filter().to, filter().anchor, filter().period], ['2026-11-17', '2026-11-23', '2026-11-23', 7]);
  assert.equal(parseSubmittedAt('2026-11-23 00:01:00'), now);
  assert.equal(formatBeijingDateTime(parseSubmittedAt('2026-11-23 00:01:00'), 'fullDateTime'), '2026年11月23日 00:01');
  assert.equal(formatBeijingDateTime('2026-12-31T16:05:00Z', 'fullDateTime'), '2027年1月1日 00:05');
  for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
    const previous = process.env.TZ;
    try {
      process.env.TZ = tz;
      assert.equal(parseSubmittedAt('2026-11-23 00:01:00'), now);
      assert.equal(initialHistoryFilter(now).to, '2026-11-23');
    } finally {
      if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
    }
  }
});

test('周期、日期与日历交互保留日历闭区间及合法确认语义', () => {
  const thirty = selectHistoryPeriod(filter(), 30);
  assert.deepEqual([thirty.from, thirty.to], ['2026-10-25', '2026-11-23']);
  const previous = moveHistoryPeriod(thirty, -1);
  assert.deepEqual([previous.from, previous.to], ['2026-09-25', '2026-10-24']);
  assert.deepEqual(moveHistoryPeriod(previous, 1), thirty);
  assert.equal(commitHistoryRange(thirty, { from: '2026-11-23', to: '2026-11-22' }), thirty);
  assert.equal(isValidHistoryRange({ from: '2026-02-30', to: '2026-11-23' }), false);
  const custom = commitHistoryRange(thirty, { from: '2026-12-31', to: '2027-01-01' });
  assert.equal(custom.period, null);
  assert.equal(moveHistoryPeriod(custom, -1), custom);
  assert.equal(selectHistoryPeriod(custom, 7).anchor, '2027-01-01');
  assert.equal(moveCalendarDate('2026-12-31', 1), '2027-01-01');
  assert.equal(calendarTimestamp(moveCalendarDate('2026-03-08', 7)) - calendarTimestamp('2026-03-08'), 7 * 86400000);
  assert.equal(moveCalendarMonth('2026-12', 1), '2027-01');
  const cells = calendarMonthCells('2026-11');
  assert.equal(cells.length, 42);
  assert.equal(cells.filter(Boolean).length, 30);
});

test('同日多条按recordId区分，最近十条、完整列表和详情同源且保留任务', () => {
  const items = Array.from({ length: 13 }, (_, index) => record(index + 1, `2026-11-23 ${String(index).padStart(2, '0')}:00:00`, [120 + index / 10, 80]));
  const data = interval(items.slice().reverse());
  const view = selectHistoryView(authenticated, filter(), data);
  assert.equal(view.records.length, 13);
  assert.equal(view.all.length, 13);
  assert.equal(view.recent.length, 10);
  assert.deepEqual(view.recent, view.all.slice(0, 10));
  assert.deepEqual(view.all, view.records.slice().reverse());
  assert.equal(new Set(view.all.map((item) => item.id)).size, 13);
  for (const item of view.recent) {
    const detail = selectHistoryView(authenticated, filter(), data, item.id).detail;
    assert.equal(detail.taskId, item.taskId);
    assert.equal(detail.submittedAt, items[item.taskId - 1].submittedAt);
  }
  assert.equal(selectHistoryView(authenticated, filter(), data, 'missing').detail, null);
  assert.equal(view.statistics[0].average, items.reduce((sum, item) => sum + item.readings[1].value, 0) / items.length);
  assert.equal(view.statistics[1].minimumRecord.id, '1:bloodPressure');
  assert.equal(view.statistics[1].maximumRecord.id, '1:bloodPressure');
});

test('同秒记录维持服务端内部精度排序，不用任务ID猜测先后', () => {
  const first = record(4, '2026-11-23 09:00:00', [131, 84], { versionId: 22 });
  const second = record(90, '2026-11-23 09:00:00', [125, 82], { versionId: 21 });
  const view = selectHistoryView(authenticated, filter(), interval([first, second]));
  assert.deepEqual(view.all.map((item) => item.taskId), [4, 90]);
  assert.deepEqual(view.records.map((item) => item.taskId), [90, 4]);
  assert.deepEqual(view.statistics.map((item) => item.average), [128, 83]);
});

test('当前指标全区间不同版本、来源、方式和成员算法的记录都参与统计', () => {
  const items = [
    record(1, '2026-11-22 08:00:00', [100, 60]),
    record(2, '2026-11-22 09:00:00', [200, 120], { versionId: 12, version: '3.0' }),
    record(3, '2026-11-22 10:00:00', [130, 75], { captureMethod: null, captureMode: null }),
    record(4, '2026-11-22 11:00:00', [140, 85], { algorithmKey: 'another.member.v1' }),
    record(5, '2026-11-22 12:00:00', [150, 90], { captureMethod: 'fingertip', captureMode: 'another-source' }),
  ];
  const data = interval(items);
  const view = selectHistoryView(authenticated, filter(), data);
  assert.deepEqual(view.records.map((item) => item.taskId), [1, 2, 3, 4, 5]);
  assert.deepEqual(view.statistics.map((item) => item.average), [144, 86]);
  assert.deepEqual(view.statistics.map((item) => [item.minimum, item.maximum]), [[100, 200], [60, 120]]);
  assert.deepEqual(view.all.map((item) => item.taskId), [5, 4, 3, 2, 1]);
  assert.deepEqual(view.recent, view.all);
});

test('部分分页及刷新失败均不提供旧记录或统计，内部完整缓存不冒充成功展示', () => {
  const item = record(1, '2026-11-23 00:01:00');
  for (const error of [null, new Error('page 2 failed')]) {
    const view = selectHistoryView(authenticated, filter(), interval([item], false, error, 101));
    assert.equal(view.total, 101);
    assert.equal(view.recent.length, 0);
    assert.equal(view.complete, false);
    assert.deepEqual(view.records, []);
    assert.deepEqual(view.statistics, []);
  }
  const previous = selectHistoryView(authenticated, filter(), interval([item], true, new Error('refresh failed')));
  assert.deepEqual(previous.all, []);
  assert.deepEqual(previous.statistics, []);
  assert.equal(previous.complete, false);
  assert.equal(selectHistoryView(authenticated, filter()).all.length, 0);
});

test('跨日按submittedAt归档，不按完成顺序或日期伪造缺失记录', () => {
  const day = { ...selectHistoryPeriod(filter(), 1) };
  const data = interval([
    record(1, '2026-11-22 23:59:59'),
    record(2, '2026-11-23 00:00:00'),
    record(3, '2026-11-24 00:00:00'),
  ]);
  const view = selectHistoryView(authenticated, day, data);
  assert.deepEqual(view.all.map((item) => item.taskId), [2]);
  assert.equal(view.all[0].measuredAt, '2026-11-22T16:00:00.000Z');
  assert.equal(formatBeijingDateTime(view.all[0].measuredAt, 'time'), '00:00');
});

test('风险保留原概率及编码，按服务端档位显示等级，不产生趋势、均值或档位重算', () => {
  const probability = .559923077249526978;
  const risk = record(8, '2026-11-23 08:30:00', [], {
    recordId: '8:diabetesRisk', metric: 'diabetesRisk', captureMethod: 'fingertip',
    readings: [{ code: 'diabetes_probability', value: probability, unit: 'ratio' }],
    riskLevel: 2, algorithmKey: 'ppg.active.offline.diabetes.v1',
  });
  const view = selectHistoryView(authenticated, { ...filter(), metric: 'diabetesRisk' }, interval([risk]), risk.recordId);
  assert.equal(view.all.length, 1);
  assert.equal(view.detail.riskLevel, 2);
  assert.equal(view.detail.values[0], probability);
  assert.equal(view.detail.readings[0].value, probability);
  assert.equal(formatHistoryValue(view.detail, view.detail.values[0]), '较高\n风险');
  assert.deepEqual(view.records, []);
  assert.deepEqual(view.statistics, []);
});

test('长小数只在最终展示时直接舍弃，均值及源记录仍按原精度计算', () => {
  const items = [
    record(31, '2026-11-23 08:00:00', [113.9, 66.9]),
    record(32, '2026-11-23 09:00:00', [114.9, 67.9]),
  ];
  const view = selectHistoryView(authenticated, filter(), interval(items), items[1].recordId);
  assert.equal(formatHistoryValue(view.detail, view.detail.values[0]), '114');
  assert.equal(formatHistoryValue(view.detail, view.detail.values[1]), '67');
  assert.equal(view.statistics[0].average, (113.9 + 114.9) / 2);
  assert.equal(formatHistoryNumber(view.statistics[0].average), '114');
  assert.equal(formatHistoryNumber(view.statistics[1].average), '67');
  assert.equal(items[0].readings[0].value, 66.9);
  assert.equal(items[1].readings[1].value, 114.9);
});

test('游客、恢复中和不可确认立即清空已打开记录，不重置已提交筛选', () => {
  const current = filter();
  const data = interval([record(1, '2026-11-23 08:30:00')]);
  for (const auth of [{ status: 'anonymous' }, { status: 'restoring' }, { status: 'unavailable', reason: 'network' }]) {
    const view = selectHistoryView(auth, current, data, '1:bloodPressure');
    assert.deepEqual([view.all, view.recent, view.records, view.statistics], [[], [], [], []]);
    assert.equal(view.detail, null);
    assert.equal(view.total, 0);
    assert.equal(current.to, '2026-11-23');
  }
  assert.equal(adjacentHistoryMetric('bloodPressure', -1), null);
  assert.equal(adjacentHistoryMetric('bloodPressure', 1), 'heartRate');
  assert.equal(adjacentHistoryMetric('diabetesRisk', 1), null);
});
