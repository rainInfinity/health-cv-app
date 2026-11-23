// 验证报告消费者仅取得同任务的有效成员，失败与未知结果不产生默认读数。
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { adaptMeasurementResult } = require('../node_modules/.cache/native-test/app/measurement/resultAdapter.js')
const { classifyBloodPressure } = require('../node_modules/.cache/native-test/pages/measurement/BloodPressureResults/bloodPressureAssessment.js')

const algorithmKeys = {
  hr_br: 'ppg.active.offline.hr_br.v1', spo2: 'ppg.active.offline.spo2.v1',
  diabetes: 'ppg.active.offline.diabetes.v1', bp: 'ppg_acc.active.offline.bp.v1',
}
const quality = { score: 88.65866718458382, threshold: 70 }
const values = {
  hr_br: { hr: 79.25, br: 15.125, quality },
  spo2: { spo2: 98.5, quality, window_predictions: [96, 98.5], window_starts: [0, 75] },
  diabetes: { prob: 0.5523077249526978, risk_level: 0, quality },
  bp: { sbp: 120.25, dbp: 80.5, quality },
}
function task(modelCode = 'ppg.active.offline.all', overrides = {}) {
  return {
    taskId: 101, modelId: 7, modelCode, modelName: '正式模型', versionId: 12, version: '1.0.0',
    status: 'SUCCEEDED', isExample: false, createdAt: '2026-11-22 23:58:00',
    submittedAt: '2026-11-23 00:01:00', startedAt: '2026-11-23 00:01:01', finishedAt: '2026-11-23 00:01:04',
    measurement: null, failureCode: null, failureMessage: null, qualityFailure: null,
    ...overrides,
  }
}
function member(key, succeeded = true, overrides = {}) {
  return {
    algorithmKey: algorithmKeys[key], status: succeeded ? 'SUCCEEDED' : 'FAILED',
    result: succeeded ? values[key] : null,
    failureCode: succeeded ? null : 'INFERENCE.QUALITY_REJECTED',
    failureMessage: succeeded ? null : '未检测到可用信号，请重新采集',
    qualityFailure: succeeded ? null : { reason: 'NO_VALID_SIGNAL', details: null },
    ...overrides,
  }
}
function ppgResult(overrides = {}) {
  return {
    outcome: 'ALL_SUCCEEDED',
    results: { hr_br: member('hr_br'), spo2: member('spo2'), diabetes: member('diabetes') },
    output_files: { hr_br_processed_ppg: '不透明引用' },
    ...overrides,
  }
}
function readings(report) {
  return Object.values(report.metrics).flatMap((metric) => metric.readings)
}

test('部分成功保留真实HR/BR及血氧，风险质量拒绝不生成概率或默认档位', () => {
  const result = ppgResult({ outcome: 'PARTIALLY_SUCCEEDED' })
  result.results.diabetes = member('diabetes', false, {
    qualityFailure: { reason: 'LOW_SCORE', details: { score: 61.25, threshold: 70 } },
  })
  const source = task(undefined, { result })
  const original = structuredClone(source)
  const report = adaptMeasurementResult(source)
  assert.equal(report.hasValidMembers, true)
  assert.equal(report.state, 'partial')
  assert.equal(report.outcome, 'PARTIALLY_SUCCEEDED')
  assert.equal(report.metrics.heartRate.readings[0].value, 79.25)
  assert.equal(report.metrics.respirationRate.readings[0].value, 15.125)
  assert.equal(report.metrics.oxygenSaturation.readings[0].value, 98.5)
  assert.strictEqual(report.metrics.heartRate.quality, report.metrics.respirationRate.quality)
  assert.deepEqual(report.metrics.heartRate.quality, quality)
  assert.equal(report.metrics.diabetesRisk.status, 'failed')
  assert.deepEqual(report.metrics.diabetesRisk.readings, [])
  assert.equal(report.metrics.diabetesRisk.riskLevel, null)
  assert.deepEqual(report.metrics.diabetesRisk.quality, { score: 61.25, threshold: 70 })
  assert.equal(report.metrics.diabetesRisk.failureReason, 'quality')
  assert.ok(report.summary)
  assert.deepEqual(source, original)
})

test('ALL_FAILED与任务失败分开，全部失败无默认指标或无信号分数', () => {
  const result = ppgResult({
    outcome: 'ALL_FAILED',
    results: { hr_br: member('hr_br', false), spo2: member('spo2', false), diabetes: member('diabetes', false) },
  })
  const report = adaptMeasurementResult(task(undefined, { result }))
  assert.equal(report.taskStatus, 'SUCCEEDED')
  assert.equal(report.state, 'all_failed')
  assert.equal(report.hasValidMembers, false)
  assert.deepEqual(readings(report), [])
  for (const metric of Object.values(report.metrics)) assert.equal(metric.quality, null)
  const failed = adaptMeasurementResult(task(undefined, {
    status: 'FAILED', result: ppgResult(), failureCode: 'INFERENCE.EXECUTION_TIMEOUT', failureMessage: '推理执行超时',
  }))
  assert.equal(failed.state, 'task_failed')
  assert.equal(failed.outcome, null)
  assert.equal(failed.hasValidMembers, false)
  assert.deepEqual(readings(failed), [])
  assert.ok(failed.summary.includes('推理执行超时'))
})

test('四类独立历史保持原路径，旧缺失采集属性不阻断权威读数', () => {
  const cases = [
    ['ppg.active.offline.hr_br', 'hr_br', ['hr', 'br']],
    ['ppg.active.offline.spo2', 'spo2', ['spo2']],
    ['ppg.active.offline.diabetes', 'diabetes', ['diabetes_probability']],
    ['ppg_acc.active.offline.bp', 'bp', ['sbp', 'dbp']],
  ]
  for (const [model, key, codes] of cases) {
    const report = adaptMeasurementResult(task(model, { result: { ...values[key], output_files: { processed_ppg: '引用' } } }))
    assert.equal(report.state, 'complete')
    assert.equal(report.hasValidMembers, true)
    assert.equal(report.outcome, null)
    assert.deepEqual(readings(report).map((reading) => reading.code), codes)
    assert.equal(report.measurementTime, '2026年11月23日 00:01')
    assert.equal(report.submittedAt, '2026-11-23 00:01:00')
  }
})

test('风险保留原始概率及历史编码，不重算档位或生成医学分层', () => {
  const payload = { ...values.diabetes, prob: 0.9991234567890123, risk_level: 0 }
  const report = adaptMeasurementResult(task('ppg.active.offline.diabetes', { result: payload }))
  assert.equal(report.metrics.diabetesRisk.readings[0].value, payload.prob)
  assert.equal(report.metrics.diabetesRisk.riskLevel, 0)
  assert.deepEqual(report.metrics.diabetesRisk.quality, quality)
})

test('血压场景只能展示同一成功成员的完整双读数，缺一项不跨任务补齐', () => {
  const result = { outcome: 'ALL_SUCCEEDED', results: { bp: member('bp') } }
  const report = adaptMeasurementResult(task('ppg_acc.active.offline.all', { result }))
  assert.deepEqual(report.metrics.bloodPressure.readings.map((reading) => reading.value), [120.25, 80.5])
  assert.equal(report.hasValidMembers, true)
  const incomplete = adaptMeasurementResult(task('ppg_acc.active.offline.all', {
    taskId: 102,
    result: { ...result, results: { bp: member('bp', true, { result: { sbp: 119, quality } }) } },
  }))
  assert.equal(incomplete.taskId, 102)
  assert.equal(incomplete.hasValidMembers, false)
  assert.deepEqual(incomplete.metrics.bloodPressure.readings, [])
  const allFailed = adaptMeasurementResult(task('ppg_acc.active.offline.all', {
    result: { outcome: 'ALL_FAILED', results: { bp: member('bp', false) } },
  }))
  assert.equal(allFailed.state, 'all_failed')
  assert.deepEqual(allFailed.metrics.bloodPressure.readings, [])
})

test('血压三级按原始双读数判断，边界归属明确且低高交叉时偏高优先', () => {
  for (const [sbp, dbp, expected] of [
    [90, 60, 'normal'], [139.99, 89.99, 'normal'],
    [140, 80, 'high'], [120, 90, 'high'],
    [89.99, 80, 'low'], [120, 59.99, 'low'],
    [145, 55, 'high'], [85, 95, 'high'],
  ]) {
    const report = adaptMeasurementResult(task('ppg_acc.active.offline.all', {
      result: { outcome: 'ALL_SUCCEEDED', results: { bp: member('bp', true, { result: { sbp, dbp, quality } }) } },
    }))
    const pressure = report.metrics.bloodPressure
    assert.equal(pressure.status, 'succeeded')
    assert.equal(classifyBloodPressure(
      pressure.readings.find((reading) => reading.code === 'sbp').value,
      pressure.readings.find((reading) => reading.code === 'dbp').value,
    ), expected, `${sbp}/${dbp}`)
  }
})

test('未知模型、状态、示例、outcome及成员身份均不猜测成功', () => {
  for (const model of ['unknown.model', '__proto__', 'constructor']) {
    assert.equal(adaptMeasurementResult(task(model, { result: { hr: 70, br: 16, ...ppgResult() } })).hasValidMembers, false)
  }
  for (const overrides of [
    { status: 'FUTURE_STATUS', result: ppgResult() },
    { isExample: true, result: ppgResult() },
    { result: ppgResult({ outcome: 'UNKNOWN' }) },
    { result: ppgResult({ outcome: 'ALL_FAILED' }) },
    { result: ppgResult({ results: { hr_br: member('hr_br') } }) },
    { result: ppgResult({ results: { hr_br: member('hr_br', true, { algorithmKey: 'unknown.algorithm' }), spo2: member('spo2'), diabetes: member('diabetes') } }) },
  ]) {
    const report = adaptMeasurementResult(task(undefined, overrides))
    assert.equal(report.hasValidMembers, false)
    assert.deepEqual(readings(report), [])
  }
})

test('HR/BR原子有效性、非法评分和坏日期不会变成默认有效值', () => {
  const report = adaptMeasurementResult(task('ppg.active.offline.hr_br', { result: { hr: 72, br: null, quality } }))
  assert.equal(report.hasValidMembers, false)
  assert.deepEqual(readings(report), [])
  const badQuality = adaptMeasurementResult(task('ppg.active.offline.hr_br', {
    submittedAt: '2026-02-30 00:01:00', result: { hr: 0, br: 0, quality: { score: '88', threshold: 70 } },
  }))
  assert.equal(badQuality.hasValidMembers, true)
  assert.deepEqual(readings(badQuality).map((reading) => reading.value), [0, 0])
  assert.equal(badQuality.metrics.heartRate.quality, null)
  assert.equal(badQuality.measurementTime, '检测时间未知')
})

test('部分成功中的非法成功载荷不能伪装为可展示部分报告', () => {
  const result = ppgResult()
  result.results.spo2.result = { spo2: null }
  const report = adaptMeasurementResult(task(undefined, { result }))
  assert.equal(report.state, 'unavailable')
  assert.equal(report.hasValidMembers, false)
})
