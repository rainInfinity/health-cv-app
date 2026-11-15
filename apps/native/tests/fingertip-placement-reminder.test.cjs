// 验证真实阶段驱动的放置指导时机，不以动画或覆盖数值推进正式检测。
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { createFingertipPlacementReminder } = require('../src/pages/measurement/FingertipMeasurement/fingertipPlacementReminder.ts')

/** 仅提供提醒实际使用的轮次与原生阶段。 */
function snapshot(phase = 'observing', captureId = 'round-1') {
  return { captureId, phase }
}

test('授权和预览准备不计时，观测满十五秒未开始才显示，开始准备不重置等待', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const events = []
  const reminder = createFingertipPlacementReminder((visible) => events.push(visible))
  context.mock.timers.tick(30_000)
  assert.deepEqual(events, [])
  reminder.update(snapshot())
  context.mock.timers.tick(10_000)
  reminder.update(snapshot('starting'))
  context.mock.timers.tick(4_999)
  assert.deepEqual(events, [])
  context.mock.timers.tick(1)
  assert.deepEqual(events, [true])
  reminder.dispose()
})

test('提前正式开始或本轮终止不弹，弹出后正式开始和失败立即收起', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  for (const phase of ['capturing', 'stopping', 'completed', 'interrupted', 'failed']) {
    const events = []
    const reminder = createFingertipPlacementReminder((visible) => events.push(visible))
    reminder.update(snapshot())
    context.mock.timers.tick(14_999)
    reminder.update(snapshot(phase))
    context.mock.timers.tick(1)
    assert.deepEqual(events, [])
    reminder.update(snapshot('observing', 'round-2'))
    context.mock.timers.tick(15_000)
    reminder.update(snapshot(phase, 'round-2'))
    assert.deepEqual(events, [true, false])
    reminder.dispose()
  }
})

test('确认后同轮只提醒一次，新轮重新等待十五秒', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const events = []
  const reminder = createFingertipPlacementReminder((visible) => events.push(visible))
  reminder.update(snapshot())
  context.mock.timers.tick(15_000)
  reminder.dismiss()
  reminder.update(snapshot('starting'))
  reminder.update(snapshot())
  context.mock.timers.tick(30_000)
  assert.deepEqual(events, [true, false])
  reminder.update(snapshot('observing', 'round-2'))
  context.mock.timers.tick(14_999)
  assert.deepEqual(events, [true, false])
  context.mock.timers.tick(1)
  assert.deepEqual(events, [true, false, true])
  reminder.dispose()
})

test('离页或后台撤销待显示和已显示指导，重试不继承旧轮等待，卸载不再通知', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const events = []
  const reminder = createFingertipPlacementReminder((visible) => events.push(visible))
  reminder.update(snapshot())
  context.mock.timers.tick(14_000)
  reminder.reset()
  context.mock.timers.tick(30_000)
  assert.deepEqual(events, [])
  reminder.update(snapshot('observing', 'round-2'))
  context.mock.timers.tick(15_000)
  reminder.reset()
  assert.deepEqual(events, [true, false])
  reminder.update(snapshot('observing', 'round-3'))
  context.mock.timers.tick(14_999)
  reminder.dispose()
  context.mock.timers.tick(30_000)
  reminder.update(snapshot('observing', 'round-4'))
  context.mock.timers.tick(15_000)
  assert.deepEqual(events, [true, false])
})
