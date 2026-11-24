// 验证报告消费者仅取得同任务的有效成员，失败与未知结果不产生默认读数。
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { adaptMeasurementResult } = require('../node_modules/.cache/native-test/app/measurement/resultAdapter.js')
const { classifyBloodPressure } = require('../node_modules/.cache/native-test/pages/measurement/BloodPressureResults/bloodPressureAssessment.js')

const algorithmKeys = {
  hr: 'ppg.active.offline.hr.v1', br: 'ppg.active.offline.br.v1', spo2: 'ppg.active.offline.spo2.v1',
  diabetes: 'ppg.active.offline.diabetes.v1', bp: 'ppg_acc.active.offline.bp.v1',
}
const quality = { score: 88.65866718458382, threshold: 70 }
const brQuality = { score: 81.125, threshold: 72 }
const values = {
  hr: { hr: 79.25, quality },
  br: { br: 15.125, quality: brQuality },
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
    results: { hr: member('hr'), br: member('br'), spo2: member('spo2'), diabetes: member('diabetes') },
    output_files: { hr_processed_ppg: '不透明引用' },
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
  assert.deepEqual(report.metrics.heartRate.quality, quality)
  assert.deepEqual(report.metrics.respirationRate.quality, brQuality)
  assert.notDeepEqual(report.metrics.heartRate.quality, report.metrics.respirationRate.quality)
  assert.equal(report.metrics.diabetesRisk.status, 'failed')
  assert.deepEqual(report.metrics.diabetesRisk.readings, [])
  assert.equal(report.metrics.diabetesRisk.riskLevel, null)
  assert.deepEqual(report.metrics.diabetesRisk.quality, { score: 61.25, threshold: 70 })
  assert.equal(report.metrics.diabetesRisk.failureReason, 'quality')
  assert.ok(report.summary)
  assert.deepEqual(source, original)
})

test('HR与BR独立失败只影响自身，成功读数和各自质量均保留', () => {
  for (const [failedKey, failedMetric, successfulKey, successfulMetric] of [
    ['br', 'respirationRate', 'hr', 'heartRate'],
    ['hr', 'heartRate', 'br', 'respirationRate'],
  ]) {
    const result = ppgResult({ outcome: 'PARTIALLY_SUCCEEDED' })
    const rejectedQuality = { score: 51.25, threshold: 75 }
    result.results[failedKey] = member(failedKey, false, {
      qualityFailure: { reason: 'LOW_SCORE', details: rejectedQuality },
    })
    const report = adaptMeasurementResult(task(undefined, { result }))
    assert.equal(report.state, 'partial')
    assert.equal(report.hasValidMembers, true)
    assert.equal(report.metrics[successfulMetric].status, 'succeeded')
    assert.equal(report.metrics[successfulMetric].readings[0].value, values[successfulKey][successfulKey])
    assert.deepEqual(report.metrics[successfulMetric].quality, values[successfulKey].quality)
    assert.deepEqual(report.members[successfulKey].quality, values[successfulKey].quality)
    assert.equal(report.metrics[failedMetric].status, 'failed')
    assert.deepEqual(report.metrics[failedMetric].readings, [])
    assert.equal(report.metrics[failedMetric].failureReason, 'quality')
    assert.deepEqual(report.metrics[failedMetric].quality, rejectedQuality)
    assert.deepEqual(report.members[failedKey].quality, rejectedQuality)
  }
})

test('HR与BR生成失败不借用另一成员的质量或失败原因', () => {
  for (const [key, metric] of [['hr', 'heartRate'], ['br', 'respirationRate']]) {
    const result = ppgResult({ outcome: 'PARTIALLY_SUCCEEDED' })
    result.results[key] = member(key, false, {
      failureCode: 'INFERENCE.EXECUTION_FAILED', failureMessage: '本项处理失败', qualityFailure: null,
    })
    const report = adaptMeasurementResult(task(undefined, { result }))
    assert.equal(report.state, 'partial')
    assert.equal(report.metrics[metric].failureReason, 'generation')
    assert.equal(report.metrics[metric].message, '本项处理失败')
    assert.equal(report.metrics[metric].quality, null)
    assert.deepEqual(report.metrics[metric].readings, [])
  }
})

test('ALL_FAILED与任务失败分开，全部失败无默认指标或无信号分数', () => {
  const result = ppgResult({
    outcome: 'ALL_FAILED',
    results: { hr: member('hr', false), br: member('br', false), spo2: member('spo2', false), diabetes: member('diabetes', false) },
  })
  const report = adaptMeasurementResult(task(undefined, { result }))
  assert.equal(report.taskStatus, 'SUCCEEDED')
  assert.equal(report.state, 'all_failed')
  assert.equal(report.hasValidMembers, false)
  assert.deepEqual(readings(report), [])
  assert.deepEqual(Object.keys(report.members), ['hr', 'br', 'spo2', 'diabetes'])
  for (const metric of ['heartRate', 'respirationRate', 'oxygenSaturation', 'diabetesRisk']) {
    assert.equal(report.metrics[metric].status, 'failed')
  }
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

test('五类独立历史按自身模型读取，HR与BR互不生成对方读数', () => {
  const cases = [
    ['ppg.active.offline.hr', 'hr', ['hr']],
    ['ppg.active.offline.br', 'br', ['br']],
    ['ppg.active.offline.spo2', 'spo2', ['spo2']],
    ['ppg.active.offline.diabetes', 'diabetes', ['diabetes_probability']],
    ['ppg_acc.active.offline.bp', 'bp', ['sbp', 'dbp']],
  ]
  for (const [model, key, codes] of cases) {
    const report = adaptMeasurementResult(task(model, { result: { ...values[key], output_files: { [key === 'br' ? 'processed_rsp' : 'processed_ppg']: '引用' } } }))
    assert.equal(report.state, 'complete')
    assert.equal(report.hasValidMembers, true)
    assert.equal(report.outcome, null)
    assert.deepEqual(readings(report).map((reading) => reading.code), codes)
    assert.deepEqual(report.members[key].quality, values[key].quality)
    if (key === 'hr') assert.deepEqual(report.metrics.respirationRate.readings, [])
    if (key === 'br') assert.deepEqual(report.metrics.heartRate.readings, [])
    assert.equal(report.measurementTime, '2026年11月23日 00:01')
    assert.equal(report.submittedAt, '2026-11-23 00:01:00')
  }
})

test('独立HR与BR任务质量拒绝保留自身失败状态，不生成对方指标', () => {
  for (const [key, metric, otherMetric] of [
    ['hr', 'heartRate', 'respirationRate'],
    ['br', 'respirationRate', 'heartRate'],
  ]) {
    const rejectedQuality = { score: key === 'hr' ? 54 : 58, threshold: 75 }
    const report = adaptMeasurementResult(task(`ppg.active.offline.${key}`, {
      status: 'FAILED', result: values[key], failureCode: 'INFERENCE.QUALITY_REJECTED',
      qualityFailure: { reason: 'LOW_SCORE', details: rejectedQuality },
    }))
    assert.equal(report.state, 'task_failed')
    assert.equal(report.hasValidMembers, false)
    assert.equal(report.metrics[metric].status, 'failed')
    assert.equal(report.metrics[metric].failureReason, 'quality')
    assert.deepEqual(report.metrics[metric].quality, rejectedQuality)
    assert.deepEqual(report.members[key].quality, rejectedQuality)
    assert.equal(report.metrics[otherMetric].status, 'unavailable')
    assert.equal(report.metrics[otherMetric].quality, null)
    assert.deepEqual(readings(report), [])
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
  for (const model of ['unknown.model', '__proto__', 'constructor', 'ppg.active.offline.hr_br']) {
    assert.equal(adaptMeasurementResult(task(model, { result: { hr: 70, br: 16, ...ppgResult() } })).hasValidMembers, false)
  }
  for (const overrides of [
    { status: 'FUTURE_STATUS', result: ppgResult() },
    { isExample: true, result: ppgResult() },
    { result: ppgResult({ outcome: 'UNKNOWN' }) },
    { result: ppgResult({ outcome: 'ALL_FAILED' }) },
    { result: ppgResult({ results: { hr: member('hr'), spo2: member('spo2'), diabetes: member('diabetes') } }) },
    { result: ppgResult({ results: { hr: member('hr', true, { algorithmKey: 'unknown.algorithm' }), br: member('br'), spo2: member('spo2'), diabetes: member('diabetes') } }) },
  ]) {
    const report = adaptMeasurementResult(task(undefined, overrides))
    assert.equal(report.hasValidMembers, false)
    assert.deepEqual(readings(report), [])
  }
})

test('独立HR缺失读数、非法评分和坏日期不会变成默认有效值', () => {
  const report = adaptMeasurementResult(task('ppg.active.offline.hr', { result: { hr: null, quality } }))
  assert.equal(report.hasValidMembers, false)
  assert.deepEqual(readings(report), [])
  const badQuality = adaptMeasurementResult(task('ppg.active.offline.hr', {
    submittedAt: '2026-02-30 00:01:00', result: { hr: 0, quality: { score: '88', threshold: 70 } },
  }))
  assert.equal(badQuality.hasValidMembers, true)
  assert.deepEqual(readings(badQuality).map((reading) => reading.value), [0])
  assert.equal(badQuality.metrics.heartRate.quality, null)
  assert.equal(badQuality.measurementTime, '检测时间未知')
})

test('BR只接受闭区间8至20的原始有限数值，不限幅、转换或补默认数', () => {
  for (const br of [8, 8.125, 15.125, 19.875, 20]) {
    for (const model of ['ppg.active.offline.br', 'ppg.active.offline.all']) {
      const result = model.endsWith('.br') ? { br, quality: brQuality } : ppgResult()
      if (model.endsWith('.all')) result.results.br.result = { br, quality: brQuality }
      const report = adaptMeasurementResult(task(model, { result }))
      assert.equal(report.hasValidMembers, true)
      assert.equal(report.metrics.respirationRate.readings[0].value, br)
      assert.deepEqual(report.metrics.respirationRate.quality, brQuality)
    }
  }
  for (const br of [7.999, 20.001, 0, -1, null, undefined, '16', NaN, Infinity, -Infinity]) {
    for (const model of ['ppg.active.offline.br', 'ppg.active.offline.all']) {
      const result = model.endsWith('.br') ? { br, quality: brQuality } : ppgResult()
      if (model.endsWith('.all')) result.results.br.result = { br, quality: brQuality }
      const report = adaptMeasurementResult(task(model, { result }))
      assert.equal(report.hasValidMembers, false)
      assert.equal(report.state, 'unavailable')
      assert.deepEqual(report.metrics.respirationRate.readings, [])
      assert.equal(report.metrics.respirationRate.quality, null)
      assert.ok(Object.is(model.endsWith('.br') ? result.br : result.results.br.result.br, br))
    }
  }
})

test('部分成功中的非法成功载荷不能伪装为可展示部分报告', () => {
  const result = ppgResult()
  result.results.spo2.result = { spo2: null }
  const report = adaptMeasurementResult(task(undefined, { result }))
  assert.equal(report.state, 'unavailable')
  assert.equal(report.hasValidMembers, false)
})
