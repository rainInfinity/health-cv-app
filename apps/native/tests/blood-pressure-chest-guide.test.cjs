// 验证真实贴胸阶段、每轮一次和取消资格，不发送采集命令。
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { createBloodPressureChestGuide } = require('../src/pages/measurement/BloodPressureMeasurement/bloodPressureChestGuide.ts')

/** 只提供指导消费的轮次与真实阶段。 */
function snapshot(phase, captureId = 'bp-1') { return { captureId, phase } }

test('观测期不弹，首次贴胸准备立即显示，重复或联合启动回退不重复', () => {
  const events = []
  const guide = createBloodPressureChestGuide(value => events.push(value), () => false)
  guide.update(snapshot('observing_finger'))
  assert.deepEqual(events, [])
  guide.update(snapshot('awaiting_chest'))
  assert.deepEqual(events, [true])
  guide.update(snapshot('starting'))
  guide.update(snapshot('awaiting_chest'))
  assert.deepEqual(events, [true])
  guide.dismiss()
  guide.update(snapshot('starting'))
  assert.deepEqual(events, [true, false])
})

test('进入覆盖回退、正式采集或终态立即收起，同轮返回贴胸不再弹', () => {
  for (const phase of ['observing_finger', 'capturing', 'stopping', 'completed', 'failed', 'interrupted']) {
    const events = []
    const guide = createBloodPressureChestGuide(value => events.push(value), () => false)
    guide.update(snapshot('starting'))
    guide.update(snapshot(phase))
    guide.update(snapshot('awaiting_chest'))
    assert.deepEqual(events, [true, false], phase)
  }
})

test('设备已选择不再提示时，新一轮两个准备阶段都不弹', () => {
  const events = []
  const guide = createBloodPressureChestGuide(value => events.push(value), () => true)
  guide.update(snapshot('awaiting_chest'))
  guide.update(snapshot('starting'))
  guide.reset()
  guide.update(snapshot('awaiting_chest', 'bp-2'))
  assert.deepEqual(events, [])
})

test('后台或离页取消后旧轮不能恢复，明确新轮重新获得提示资格', () => {
  const events = []
  const guide = createBloodPressureChestGuide(value => events.push(value), () => false)
  guide.update(snapshot('awaiting_chest'))
  guide.cancel()
  guide.update(snapshot('awaiting_chest'))
  guide.update(snapshot('starting', 'bp-2'))
  assert.deepEqual(events, [true, false])
  guide.reset()
  guide.update(snapshot('starting', 'bp-2'))
  assert.deepEqual(events, [true, false, true])
})

test('未到贴胸即取消不补弹，其他轮次的迟到通知不关闭当前指导', () => {
  const events = []
  const guide = createBloodPressureChestGuide(value => events.push(value), () => false)
  guide.update(snapshot('observing_finger'))
  guide.cancel()
  guide.update(snapshot('awaiting_chest'))
  assert.deepEqual(events, [])
  guide.reset()
  guide.update(snapshot('awaiting_chest', 'bp-2'))
  guide.update(snapshot('failed', 'bp-1'))
  assert.deepEqual(events, [true])
})
