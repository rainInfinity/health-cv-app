// 直接消费纯调度源码，测试原生事实、单路优先级及异步失效，不检查文案或页面接线。
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { createFingertipVoice } = require('../src/pages/measurement/FingertipMeasurement/fingertipVoice.ts')
const { createFingertipPlacementReminder } = require('../src/pages/measurement/FingertipMeasurement/fingertipPlacementReminder.ts')

/** 提供真实快照字段；冻结输入以防语音回调意外改写检测事实。 */
function snapshot(phase = 'observing', overrides = {}) {
  const remainingMillis = overrides.remainingMillis ?? 30_000
  return Object.freeze({
    captureId: 'round-1', sessionId: phase === 'capturing' ? 'ppg-1' : null,
    phase, coverageState: 'complete', coveragePercent: 100, coverageReady: false,
    targetDurationMillis: 30_000, elapsedMillis: 30_000 - remainingMillis, remainingMillis,
    endReason: null, errorCode: null, errorMessage: null, artifact: null,
    windowStartElapsedNanos: phase === 'observing' || phase === 'starting' ? null : '1000000000',
    windowEndElapsedNanos: null, receivedFrameCount: 0,
    firstFrameTimestampNanos: null, lastFrameTimestampNanos: null,
    cameraConfigSummary: null, resourcesReleased: false,
    ...overrides,
  })
}

/** load 模拟真正发声前的异步边界，complete 故意允许旧回调迟到。 */
function fixture({ deferred = false, durations = {} } = {}) {
  const attempts = []
  const heard = []
  const events = []
  let playerToken = 0
  const player = {
    durationMillis(cue) { return durations[cue] ?? 1_000 },
    play(cue, onComplete, canPlay) {
      const expectedToken = ++playerToken
      const attempt = {
        cue,
        load() {
          if (playerToken !== expectedToken) return
          if (canPlay && !canPlay()) {
            onComplete()
            return
          }
          heard.push(cue)
        },
        complete: onComplete,
        canPlay,
      }
      attempts.push(attempt)
      events.push(`play:${cue}`)
      if (!deferred) attempt.load()
    },
    stop() { playerToken++; events.push('stop') },
    dispose() { playerToken++; events.push('dispose') },
  }
  const voice = createFingertipVoice(player)
  return { voice, attempts, heard, events, last: () => attempts.at(-1) }
}

function beginObservation(f, overrides = {}) {
  f.voice.update(snapshot('observing', overrides))
  assert.equal(f.last().cue, 'placementGuide')
  f.last().complete()
}

test('只由真实阶段触发，跨过20、10、3秒且重复快照不重播', () => {
  const f = fixture()
  assert.deepEqual(f.heard, [])
  f.voice.update(snapshot('starting'))
  assert.deepEqual(f.heard, [])
  beginObservation(f)
  f.voice.update(snapshot())
  f.voice.update(snapshot('capturing', { remainingMillis: 29_750 }))
  f.voice.update(snapshot('capturing', { remainingMillis: 20_100 }))
  f.voice.update(snapshot('capturing', { remainingMillis: 19_850 }))
  f.voice.update(snapshot('capturing', { remainingMillis: 19_850 }))
  f.voice.update(snapshot('capturing', { remainingMillis: 9_750 }))
  f.voice.update(snapshot('capturing', { remainingMillis: 2_750 }))
  f.voice.update(snapshot('capturing', { remainingMillis: 2_500 }))
  assert.deepEqual(f.heard, ['placementGuide', 'starting', 'remaining20', 'remaining10', 'countdown'])
  assert.deepEqual(f.events, [
    'play:placementGuide', 'play:starting', 'stop', 'play:remaining20',
    'stop', 'play:remaining10', 'stop', 'play:countdown',
  ])
})

test('首次晚到快照及跳过多个节点只播放当前节点，不追播开始或20秒', () => {
  for (const [remainingMillis, cue] of [[18_500, 'remaining20'], [8_500, 'remaining10'], [2_500, 'countdown']]) {
    const f = fixture()
    f.voice.update(snapshot('capturing', { remainingMillis }))
    f.last().complete()
    f.voice.update(snapshot('capturing', { remainingMillis }))
    assert.deepEqual(f.heard, [cue])
  }
  const f = fixture()
  f.voice.update(snapshot('capturing'))
  f.voice.update(snapshot('capturing', { remainingMillis: 8_900 }))
  f.voice.update(snapshot('capturing', { remainingMillis: 2_900 }))
  assert.deepEqual(f.heard, ['starting', 'remaining10', 'countdown'])
})

test('准备期要求complete，持续不足只纠正一次，恢复后再次不足重新获得资格', () => {
  const f = fixture()
  beginObservation(f, { coverageState: 'partial', coveragePercent: 99.9 })
  f.voice.update(snapshot('observing', { coverageState: 'partial', coveragePercent: 99.9 }))
  assert.equal(f.last().cue, 'coverCamera')
  f.last().complete()
  for (let i = 0; i < 3; i++) f.voice.update(snapshot('starting', { coverageState: 'partial', coveragePercent: 99.9 }))
  assert.deepEqual(f.heard, ['placementGuide', 'coverCamera'])
  f.voice.update(snapshot('observing', { coverageReady: false }))
  f.voice.update(snapshot('observing', { coverageState: 'uncovered', coveragePercent: 0 }))
  assert.deepEqual(f.heard, ['placementGuide', 'coverCamera', 'coverCamera'])
})

test('未知覆盖不纠正也不重新授予资格，正式阶段95%以上允许轻微缺角', () => {
  const f = fixture()
  beginObservation(f, { coverageState: 'unknown', coveragePercent: null })
  f.voice.update(snapshot('observing', { coverageState: 'unknown', coveragePercent: null }))
  f.voice.update(snapshot('capturing', { coverageState: 'partial', coveragePercent: 95 }))
  f.last().complete()
  f.voice.update(snapshot('capturing', { coverageState: 'partial', coveragePercent: 99 }))
  assert.deepEqual(f.heard, ['placementGuide', 'starting'])
  f.voice.update(snapshot('capturing', { coverageState: 'partial', coveragePercent: 94.9 }))
  f.last().complete()
  f.voice.update(snapshot('capturing', { coverageState: 'unknown', coveragePercent: null }))
  f.voice.update(snapshot('capturing', { coverageState: 'partial', coveragePercent: 94.9 }))
  assert.deepEqual(f.heard, ['placementGuide', 'starting', 'coverCamera'])
  f.voice.update(snapshot('capturing', { coverageState: 'partial', coveragePercent: 95 }))
  f.voice.update(snapshot('capturing', { coverageState: 'partial', coveragePercent: 94.9 }))
  assert.equal(f.heard.filter(cue => cue === 'coverCamera').length, 2)
})

test('正式开始和各定时关键节点先停止纠正，旧完成回调不能清空新占用', () => {
  const f = fixture()
  beginObservation(f, { coverageState: 'partial', coveragePercent: 50 })
  f.voice.update(snapshot('observing', { coverageState: 'partial', coveragePercent: 50 }))
  const correction = f.last()
  f.voice.update(snapshot('capturing', { coverageState: 'partial', coveragePercent: 50 }))
  assert.deepEqual(f.events.slice(-2), ['stop', 'play:starting'])
  correction.complete()
  f.voice.setHelpVisible(true)
  assert.equal(f.last().cue, 'starting')
  f.last().complete()
  f.voice.update(snapshot('capturing', { coverageState: 'partial', coveragePercent: 50 }))
  assert.equal(f.heard.filter(cue => cue === 'coverCamera').length, 1)

  for (const remainingMillis of [19_900, 9_900, 2_900]) {
    const g = fixture()
    g.voice.update(snapshot('capturing', { remainingMillis: remainingMillis + 2_000 }))
    g.last().complete()
    g.voice.update(snapshot('capturing', { remainingMillis: remainingMillis + 2_000, coverageState: 'partial', coveragePercent: 80 }))
    assert.equal(g.last().cue, 'coverCamera')
    g.voice.update(snapshot('capturing', { remainingMillis, coverageState: 'partial', coveragePercent: 80 }))
    assert.deepEqual(g.events.slice(-2), ['stop', `play:${remainingMillis > 10_000 ? 'remaining20' : remainingMillis > 3_000 ? 'remaining10' : 'countdown'}`])
  }
})

test('低优先级实际时长必须严格小于下一节点空档，不使用独立时钟', () => {
  for (const [remainingMillis, duration, allowed] of [[21_000, 1_000, false], [21_001, 1_000, true], [11_000, 1_000, false], [4_001, 1_000, true]]) {
    const f = fixture({ durations: { coverCamera: duration } })
    f.voice.update(snapshot('capturing', { remainingMillis }))
    f.last().complete()
    f.voice.update(snapshot('capturing', { remainingMillis, coverageState: 'partial', coveragePercent: 80 }))
    assert.equal(f.heard.includes('coverCamera'), allowed)
  }
  const f = fixture({ durations: { coverCamera: 5_000 } })
  f.voice.update(snapshot('capturing', { remainingMillis: 24_000 }))
  f.last().complete()
  f.voice.update(snapshot('capturing', { remainingMillis: 24_000, coverageState: 'partial', coveragePercent: 80 }))
  assert.deepEqual(f.heard, ['starting'])
})

test('帮助与纠正同时适用时纠正优先，不自动串播；恢复覆盖后帮助仍可播放一次', () => {
  const f = fixture()
  beginObservation(f, { coverageState: 'uncovered', coveragePercent: 0 })
  f.voice.setHelpVisible(true)
  assert.equal(f.last().cue, 'coverCamera')
  f.last().complete()
  f.voice.update(snapshot('observing', { coverageState: 'uncovered', coveragePercent: 0 }))
  f.voice.setHelpVisible(true)
  assert.deepEqual(f.heard, ['placementGuide', 'coverCamera'])
  f.voice.update(snapshot('observing'))
  assert.equal(f.last().cue, 'placementHelp')
  f.last().complete()
  f.voice.setHelpVisible(false)
  f.voice.setHelpVisible(true)
  f.voice.update(snapshot('starting'))
  assert.equal(f.heard.filter(cue => cue === 'placementHelp').length, 1)
})

test('早期纠正已结束后，持续部分覆盖到十秒弹窗显示时仍播放帮助', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture()
  const reminder = createFingertipPlacementReminder((visible) => f.voice.setHelpVisible(visible))
  const deficient = snapshot('observing', { coverageState: 'partial', coveragePercent: 80 })
  const publish = () => { f.voice.update(deficient); reminder.update(deficient) }
  publish()
  context.mock.timers.tick(5_352)
  f.last().complete()
  publish()
  assert.equal(f.last().cue, 'coverCamera')
  context.mock.timers.tick(3_168)
  f.last().complete()
  publish()
  context.mock.timers.tick(1_479)
  assert.deepEqual(f.heard, ['placementGuide', 'coverCamera'])
  context.mock.timers.tick(1)
  assert.deepEqual(f.heard, ['placementGuide', 'coverCamera', 'placementHelp'])
  f.last().complete()
  publish()
  reminder.dismiss()
  publish()
  assert.equal(f.heard.filter((cue) => cue === 'placementHelp').length, 1)
  reminder.dispose()
  f.voice.dispose()
})

test('低优先级完成不自动串播；帮助在占用期间收起或正式开始后不补播', () => {
  const f = fixture()
  f.voice.update(snapshot())
  f.voice.setHelpVisible(true)
  f.last().complete()
  assert.deepEqual(f.heard, ['placementGuide'])
  f.voice.setHelpVisible(false)
  f.voice.update(snapshot())
  assert.deepEqual(f.heard, ['placementGuide'])
  const g = fixture()
  g.voice.update(snapshot())
  g.voice.setHelpVisible(true)
  g.voice.update(snapshot('capturing'))
  g.last().complete()
  g.voice.setHelpVisible(true)
  assert.deepEqual(g.heard, ['placementGuide', 'starting'])
})

test('异步纠正发声前重新核对覆盖与空档，不因资格已消费而自我否定', () => {
  const f = fixture({ deferred: true })
  beginObservation(f)
  f.voice.update(snapshot('observing', { coverageState: 'partial', coveragePercent: 80 }))
  const stale = f.last()
  f.voice.update(snapshot())
  stale.load()
  assert.deepEqual(f.heard, [])
  f.voice.update(snapshot('observing', { coverageState: 'partial', coveragePercent: 80 }))
  f.last().load()
  assert.deepEqual(f.heard, ['coverCamera'])

  const g = fixture({ deferred: true })
  g.voice.update(snapshot('capturing', { remainingMillis: 22_000 }))
  g.last().complete()
  g.voice.update(snapshot('capturing', { remainingMillis: 22_000, coverageState: 'partial', coveragePercent: 80 }))
  const shrinkingGap = g.last()
  g.voice.update(snapshot('capturing', { remainingMillis: 20_500, coverageState: 'partial', coveragePercent: 80 }))
  shrinkingGap.load()
  assert.deepEqual(g.heard, [])
})

test('异步帮助收起即失效，关键提示只在最新适用区间发声', () => {
  const f = fixture({ deferred: true })
  beginObservation(f)
  f.voice.setHelpVisible(true)
  const help = f.last()
  f.voice.setHelpVisible(false)
  help.load()
  help.complete()
  f.voice.update(snapshot())
  assert.deepEqual(f.heard, [])

  const g = fixture({ deferred: true })
  const stale = []
  for (const remainingMillis of [30_000, 19_900, 9_900, 2_900]) {
    g.voice.update(snapshot('capturing', { remainingMillis }))
    stale.push(g.last())
  }
  for (const attempt of stale.slice(0, -1)) {
    assert.equal(attempt.canPlay(), false)
    attempt.load()
    attempt.complete()
  }
  stale.at(-1).load()
  assert.deepEqual(g.heard, ['countdown'])
})

test('关键完成按最新覆盖重判，过时覆盖不补播，帮助也不能在采集中启动', () => {
  const f = fixture()
  f.voice.update(snapshot('capturing', { coverageState: 'partial', coveragePercent: 80 }))
  f.voice.update(snapshot('capturing'))
  f.last().complete()
  assert.deepEqual(f.heard, ['starting'])
  const g = fixture()
  g.voice.update(snapshot('capturing', { coverageState: 'partial', coveragePercent: 80 }))
  g.last().complete()
  assert.deepEqual(g.heard, ['starting', 'coverCamera'])
})

test('正式窗口提前中断或技术失败停止，未真正到终点不保留结束音频', () => {
  for (const [phase, endReason, remainingMillis] of [
    ['stopping', 'coverage_lost', 1_000], ['failed', 'technical_failure', 1_000],
    ['interrupted', 'user_stopped', 0], ['failed', 'duration_reached', 1_000],
  ]) {
    const f = fixture()
    f.voice.update(snapshot('capturing', { remainingMillis: 2_800 }))
    const ending = f.last()
    f.voice.update(snapshot(phase, { endReason, remainingMillis }))
    assert.equal(f.events.at(-1), 'stop')
    ending.complete()
    f.voice.update(snapshot('capturing', { remainingMillis: 2_000 }))
    assert.deepEqual(f.heard, ['countdown'])
  }
})

test('已到终点的封口capturing、stopping、completed和收尾失败保留整段结束语', () => {
  for (const phase of ['capturing', 'stopping', 'completed', 'failed']) {
    const f = fixture()
    f.voice.update(snapshot('capturing', { remainingMillis: 2_750 }))
    const ending = f.last()
    const final = snapshot(phase, {
      remainingMillis: 0, endReason: 'duration_reached',
      errorCode: phase === 'failed' ? 'FILE_FINALIZE_FAILED' : null,
      resourcesReleased: phase === 'completed',
    })
    const before = JSON.stringify(final)
    f.voice.update(final)
    assert.deepEqual(f.events, ['play:countdown'])
    ending.complete()
    assert.equal(JSON.stringify(final), before)
    f.voice.update(final)
    assert.deepEqual(f.heard, ['countdown'])
    f.voice.cancel()
    assert.equal(f.events.at(-1), 'stop')
  }
})

test('终止后不补播，尚在加载的结束音频也不能在正式窗口结束后新发声', () => {
  const f = fixture()
  f.voice.update(snapshot('completed', { remainingMillis: 0, endReason: 'duration_reached' }))
  f.voice.update(snapshot('capturing', { remainingMillis: 2_000 }))
  assert.deepEqual(f.heard, [])
  const g = fixture({ deferred: true })
  g.voice.update(snapshot('capturing', { remainingMillis: 2_750 }))
  const ending = g.last()
  g.voice.update(snapshot('stopping', { remainingMillis: 0, endReason: 'duration_reached' }))
  ending.load()
  assert.deepEqual(g.heard, [])
})

test('captureId固定绑定，取消永久失效，旧加载与回调不能复活且释放幂等', () => {
  const f = fixture({ deferred: true })
  f.voice.update(snapshot())
  const old = f.last()
  f.voice.update(snapshot('capturing', { captureId: 'other-round' }))
  assert.equal(f.attempts.length, 1)
  f.voice.cancel()
  old.load()
  old.complete()
  f.voice.update(snapshot())
  f.voice.update(snapshot('capturing', { captureId: 'new-round' }))
  f.voice.setHelpVisible(true)
  f.voice.cancel()
  assert.deepEqual(f.heard, [])
  assert.equal(f.attempts.length, 1)
  const { dispose } = f.voice
  dispose()
  dispose()
  assert.equal(f.events.filter(event => event === 'dispose').length, 1)
  const next = fixture()
  next.voice.update(snapshot('observing', { captureId: 'new-round' }))
  assert.deepEqual(next.heard, ['placementGuide'])
})

test('纠正加载期间恢复又不足时旧候选失效，不消耗或重复新一段不足的资格', () => {
  const f = fixture({ deferred: true })
  beginObservation(f)
  const deficient = snapshot('observing', { coverageState: 'partial', coveragePercent: 80 })
  f.voice.update(deficient)
  const old = f.last()
  f.voice.update(snapshot())
  f.voice.update(deficient)
  old.load()
  assert.deepEqual(f.heard, [])
  f.voice.update(deficient)
  f.last().load()
  f.last().complete()
  f.voice.update(deficient)
  assert.deepEqual(f.heard, ['coverCamera'])
})
