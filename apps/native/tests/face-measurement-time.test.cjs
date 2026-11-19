/** 覆盖原生到点与 JS 计时通知偏差，不将提前结束补成完整测量。 */

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { formatFaceMeasurementElapsed } = require('../src/pages/measurement/FaceMeasurement/faceMeasurementTime.ts')

const target = { targetMeasurementDurationNanos: '30000000000', termination: null }

test('原生到点后即使本地计时不足三十秒也显示 00:30', () => {
  assert.equal(formatFaceMeasurementElapsed(target, 29_850), '00:29')
  assert.equal(formatFaceMeasurementElapsed({ ...target, termination: 'target_duration' }, 29_850), '00:30')
})

test('提前停止、后台或找脸超时不补成三十秒', () => {
  for (const termination of ['user_stop', 'app_background', 'page_left', 'interrupted', null]) {
    assert.equal(formatFaceMeasurementElapsed({ ...target, termination }, 12_850), '00:12')
  }
  assert.equal(formatFaceMeasurementElapsed({ ...target, termination: 'observation_timeout' }, 0), '00:00')
})

test('等待截止通知和收尾期间显示不超过目标时长，重测从零开始', () => {
  assert.equal(formatFaceMeasurementElapsed(target, 31_200), '00:30')
  assert.equal(formatFaceMeasurementElapsed({ ...target, termination: 'target_duration' }, 31_200), '00:30')
  assert.equal(formatFaceMeasurementElapsed(target, 0), '00:00')
})
