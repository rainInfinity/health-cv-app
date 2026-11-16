// 验证异步准备和定位不能让已取消或被抢占的录音重新发声。
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { createFingertipVoicePlayback } = require('../src/app/measurement/fingertipVoicePlayback.ts')

/** 用命令边界控制迟到定位，不模拟检测成功。 */
function harness(configure = async () => {}) {
  const events = []
  const seeks = []
  const listeners = []
  const resources = { starting: { source: 1, durationMillis: 2808 }, countdown: { source: 2, durationMillis: 4032 } }
  const driver = {
    pause() { events.push('pause') },
    replace(source) { events.push(['replace', source]) },
    isLoaded: true,
    seekTo(seconds) { const seek = Promise.withResolvers(); seeks.push(seek); events.push(['seek', seconds]); return seek.promise },
    play() { events.push('play') },
    remove() { events.push('remove') },
    addListener(_, listener) { listeners.push(listener); return { remove() { events.push('unsubscribe') } } },
  }
  const player = createFingertipVoicePlayback(() => driver, configure, resources)
  return { player, driver, events, seeks, listeners }
}

/** 等待已经登记的微任务链，不依赖实际时钟。 */
async function settle() { await new Promise((resolve) => setImmediate(resolve)) }

test('停止不等待模式准备，旧准备完成后不创建或播放录音', async () => {
  const mode = Promise.withResolvers()
  const state = harness(() => mode.promise)
  let completed = 0
  state.player.play('starting', () => completed++)
  state.player.stop()
  mode.resolve()
  await settle()
  assert.deepEqual(state.events, [])
  assert.equal(completed, 0)
  state.player.dispose()
})

test('关键抢占先暂停再替换；旧定位及旧完成不能恢复或停止新语音', async () => {
  const state = harness()
  let oldCompleted = 0
  let completed = 0
  state.player.play('starting', () => oldCompleted++)
  await settle()
  state.player.play('countdown', () => completed++)
  await settle()
  state.seeks[0].resolve()
  await settle()
  assert.equal(state.events.includes('play'), false)
  state.seeks[1].resolve()
  await settle()
  const paused = state.events.indexOf('pause')
  const replaced = state.events.findIndex((event) => Array.isArray(event) && event[0] === 'replace' && event[1] === 2)
  assert.ok(paused >= 0 && paused < replaced)
  assert.equal(state.events.filter((event) => event === 'play').length, 1)
  const finish = state.listeners.at(-1)
  finish({ didJustFinish: true, error: null })
  state.player.play('starting', () => oldCompleted++)
  await settle()
  const countBeforeLate = state.events.length
  finish({ didJustFinish: true, error: null })
  assert.equal(state.events.length, countBeforeLate)
  assert.equal(completed, 1)
  assert.equal(oldCompleted, 0)
  state.player.dispose()
  state.seeks[2].resolve()
  await settle()
  assert.equal(state.events.filter((event) => event === 'play').length, 1)
  assert.equal(state.events.at(-1), 'remove')
})

test('定位后资格过时不发声；失败只释放通道且不会自动重试', async () => {
  const state = harness()
  let valid = true
  let completed = 0
  state.player.play('starting', () => completed++, () => valid)
  await settle()
  valid = false
  state.seeks[0].resolve()
  await settle()
  assert.equal(state.events.includes('play'), false)
  assert.equal(completed, 1)
  state.player.play('countdown', () => completed++)
  await settle()
  state.seeks[1].reject(new Error('定位失败'))
  await settle()
  assert.equal(completed, 2)
  assert.equal(state.events.includes('play'), false)
  state.player.dispose()
})

test('原生资源加载期间不预排play，就绪时重新检查已变化的资格', async () => {
  const state = harness()
  state.driver.isLoaded = false
  let valid = true
  let completed = 0
  state.player.play('starting', () => completed++, () => valid)
  await settle()
  assert.deepEqual(state.events, [['replace', 1]])
  valid = false
  state.listeners.at(-1)({ isLoaded: true, didJustFinish: false, error: null })
  state.seeks[0].resolve()
  await settle()
  assert.equal(state.events.includes('play'), false)
  assert.equal(completed, 1)
  state.player.dispose()
})
