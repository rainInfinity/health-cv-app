// 以冻结快照和显式加载边界验证行为，不依赖相机、真实时钟或资源文案。
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { createBloodPressureVoice } = require('../src/pages/measurement/BloodPressureMeasurement/bloodPressureVoice.ts')

/** 使用正式窗口和联合采集的真实字段形状，输入不可被调度器改写。 */
function snapshot(phase = 'observing_finger', overrides = {}) {
  const remainingMillis = overrides.remainingMillis ?? 30_000
  const capturing = ['capturing', 'stopping', 'completed', 'failed'].includes(phase)
  return Object.freeze({
    captureId: 'round-1', sessionId: capturing ? 'ppg-1' : null,
    accSessionId: capturing ? 'acc-1' : null, phase,
    coverageState: 'complete', coveragePercent: 100, coverageReady: false,
    tiltDegrees: null, stable: null, scgCandidate: null,
    targetDurationMillis: 30_000, elapsedMillis: 30_000 - remainingMillis, remainingMillis,
    endReason: null, errorCode: null, errorMessage: null, artifact: null, accArtifact: null,
    windowStartElapsedNanos: capturing ? '1000000000' : null,
    windowEndElapsedNanos: null, stoppedAtElapsedNanos: null,
    receivedFrameCount: 0, receivedAccCount: 0,
    firstFrameTimestampNanos: null, lastFrameTimestampNanos: null,
    firstAccTimestampNanos: null, lastAccTimestampNanos: null,
    cameraConfigSummary: null, resourcesReleased: false, ...overrides,
  })
}

/** 手动加载与迟到完成分别模拟底座发声前资格复核、失效回调。 */
function fixture({ deferred = false, durations = {} } = {}) {
  const heard = []
  const attempts = []
  const events = []
  let playerToken = 0
  const completeDurations = {
    placementGuide: 5352, chestGuide: 5040, starting: 4008, restoreCover: 3672,
    coverCamera: 3168, remaining20: 1968, remaining10: 1920, countdown: 4032, placementHelp: 3384,
  }
  const voice = createBloodPressureVoice({
    durationMillis(cue) { return durations[cue] ?? completeDurations[cue] },
    play(cue, onComplete, canPlay) {
      const expected = ++playerToken
      const attempt = {
        cue, canPlay, complete: onComplete,
        load() {
          if (expected !== playerToken) return
          if (!canPlay()) { onComplete(); return }
          heard.push(cue)
        },
      }
      attempts.push(attempt)
      events.push(`play:${cue}`)
      if (!deferred) attempt.load()
    },
    stop() { playerToken++; events.push('stop') },
    dispose() { playerToken++; events.push('dispose') },
  })
  return { voice, heard, attempts, events, last: () => attempts.at(-1) }
}

const deficient = { coverageState: 'partial', coveragePercent: 70 }

test('真实观测到贴胸和正式窗口完整节点只播一次，不按重复通知重播', () => {
  const f = fixture()
  assert.deepEqual(f.heard, [])
  f.voice.update(snapshot())
  f.voice.update(snapshot())
  f.voice.update(snapshot('awaiting_chest'))
  f.voice.update(snapshot('starting'))
  f.voice.update(snapshot('awaiting_chest'))
  f.voice.update(snapshot('capturing'))
  f.voice.update(snapshot('capturing', { remainingMillis: 20_100 }))
  for (const remainingMillis of [19_850, 19_850, 9_800, 2_700, 2_500]) {
    f.voice.update(snapshot('capturing', { remainingMillis }))
  }
  assert.deepEqual(f.heard, ['placementGuide', 'chestGuide', 'starting', 'remaining20', 'remaining10', 'countdown'])
  assert.deepEqual(f.events, [
    'play:placementGuide', 'stop', 'play:chestGuide', 'stop', 'play:starting',
    'stop', 'play:remaining20', 'stop', 'play:remaining10', 'stop', 'play:countdown',
  ])
})

test('首个较晚快照只播放当前节点，跳过多个阈值不追播', () => {
  const f = fixture()
  f.voice.update(snapshot('starting'))
  f.voice.update(snapshot('awaiting_chest'))
  f.voice.update(snapshot('observing_finger', deficient))
  assert.deepEqual(f.heard, ['chestGuide', 'restoreCover'])
  const g = fixture()
  g.voice.update(snapshot('capturing', { remainingMillis: 9_700 }))
  g.voice.update(snapshot('capturing', { remainingMillis: 9_600 }))
  g.voice.update(snapshot('capturing', { remainingMillis: 2_800 }))
  assert.deepEqual(g.heard, ['remaining10', 'countdown'])
})

test('退回用重新覆盖替代普通纠正，恢复后再次贴胸重播且联合启动回退不重播', () => {
  const f = fixture()
  f.voice.update(snapshot())
  f.voice.update(snapshot('awaiting_chest'))
  f.voice.update(snapshot('starting'))
  f.voice.update(snapshot('observing_finger', deficient))
  assert.deepEqual(f.events.slice(-2), ['stop', 'play:restoreCover'])
  f.last().complete()
  f.voice.update(snapshot('observing_finger', deficient))
  f.voice.update(snapshot('observing_finger', { coverageState: 'unknown', coveragePercent: null }))
  f.voice.update(snapshot('observing_finger', deficient))
  assert.deepEqual(f.heard, ['placementGuide', 'chestGuide', 'restoreCover'])
  f.voice.update(snapshot())
  f.voice.update(snapshot('awaiting_chest'))
  f.voice.update(snapshot('starting'))
  f.voice.update(snapshot('awaiting_chest'))
  assert.deepEqual(f.heard, ['placementGuide', 'chestGuide', 'restoreCover', 'chestGuide'])
})

test('失鲜退回不推断不足，后续明确不足才重新覆盖；恢复立即撤销旧指导', () => {
  const f = fixture({ deferred: true })
  f.voice.update(snapshot('awaiting_chest'))
  const oldChest = f.last()
  f.voice.update(snapshot('observing_finger', { coverageState: 'unknown', coveragePercent: null }))
  assert.equal(oldChest.canPlay(), false)
  assert.equal(f.attempts.length, 1)
  f.voice.update(snapshot('observing_finger', deficient))
  const restore = f.last()
  assert.equal(restore.cue, 'restoreCover')
  f.voice.update(snapshot())
  assert.equal(restore.canPlay(), false)
  restore.load()
  f.voice.update(snapshot('observing_finger', deficient))
  f.last().load()
  assert.deepEqual(f.heard, ['coverCamera'])
  f.voice.update(snapshot())
  f.voice.update(snapshot('awaiting_chest'))
  const nextChest = f.last()
  oldChest.load()
  oldChest.complete()
  assert.equal(nextChest.canPlay(), true)
  nextChest.load()
  assert.deepEqual(f.heard, ['coverCamera', 'chestGuide'])
})

test('关键节点先停旧指导，异步旧加载与完成不能恢复或释放新声道', () => {
  const f = fixture({ deferred: true })
  f.voice.update(snapshot())
  const placement = f.last()
  f.voice.update(snapshot('awaiting_chest'))
  const chest = f.last()
  f.voice.update(snapshot('capturing'))
  const start = f.last()
  f.voice.update(snapshot('capturing', { remainingMillis: 19_900 }))
  const remaining = f.last()
  for (const old of [placement, chest, start]) {
    assert.equal(old.canPlay(), false)
    old.load()
    old.complete()
  }
  f.voice.setHelpVisible(true)
  remaining.load()
  assert.deepEqual(f.heard, ['remaining20'])
  assert.deepEqual(f.events.slice(-2), ['stop', 'play:remaining20'])
})

test('纠正遵循准备完整覆盖和正式95%规则，空档严格大于完整音长', () => {
  const f = fixture()
  f.voice.update(snapshot())
  f.last().complete()
  f.voice.update(snapshot('observing_finger', { coverageState: 'partial', coveragePercent: 98 }))
  assert.equal(f.last().cue, 'coverCamera')
  f.last().complete()
  f.voice.update(snapshot('observing_finger', { coverageState: 'unknown', coveragePercent: null }))
  f.voice.update(snapshot('observing_finger', deficient))
  assert.equal(f.heard.filter(cue => cue === 'coverCamera').length, 1)
  f.voice.update(snapshot('capturing', { remainingMillis: 29_000, coverageState: 'partial', coveragePercent: 98 }))
  f.last().complete()
  assert.equal(f.heard.filter(cue => cue === 'coverCamera').length, 1)
  for (const [remainingMillis, allowed] of [[23_168, false], [23_169, true], [13_168, false], [6_169, true]]) {
    const g = fixture()
    g.voice.update(snapshot('capturing', { remainingMillis }))
    g.last().complete()
    g.voice.update(snapshot('capturing', { remainingMillis, ...deficient }))
    assert.equal(g.heard.includes('coverCamera'), allowed)
  }
})

test('帮助只响应观测期实际可见，纠正优先且完成不串播；后来新显示仍适用', () => {
  const f = fixture()
  f.voice.update(snapshot())
  f.last().complete()
  f.voice.update(snapshot('observing_finger', deficient))
  f.voice.setHelpVisible(true)
  f.last().complete()
  f.voice.update(snapshot('observing_finger', deficient))
  assert.deepEqual(f.heard, ['placementGuide', 'coverCamera'])
  f.voice.setHelpVisible(false)

  const g = fixture({ deferred: true })
  g.voice.update(snapshot())
  g.last().complete()
  g.voice.update(snapshot('observing_finger', deficient))
  g.last().complete()
  g.voice.setHelpVisible(true)
  const help = g.last()
  assert.equal(help.cue, 'placementHelp')
  g.voice.update(snapshot('awaiting_chest'))
  assert.equal(help.canPlay(), false)
  help.load()
  g.voice.setHelpVisible(true)
  g.last().load()
  assert.deepEqual(g.heard, ['chestGuide'])
})

test('原生证明正常到点后保留已开始结束语，收尾失败不回撤且取消仍立即停声', () => {
  const f = fixture()
  f.voice.update(snapshot('capturing', { remainingMillis: 2_750 }))
  const ending = f.last()
  for (const phase of ['capturing', 'stopping', 'completed', 'failed']) {
    f.voice.update(snapshot(phase, {
      remainingMillis: 0, endReason: 'duration_reached', errorCode: phase === 'failed' ? 'FILE_FINALIZE_FAILED' : null,
    }))
  }
  assert.deepEqual(f.events, ['play:countdown'])
  ending.complete()
  assert.deepEqual(f.heard, ['countdown'])
  f.voice.cancel()
  assert.equal(f.events.at(-1), 'stop')
})

test('提前中断立即停声且无重新覆盖；正常终点也不新启动尚在加载的结束音', () => {
  for (const [phase, endReason, remainingMillis] of [
    ['stopping', 'coverage_lost', 1_000], ['failed', 'technical_failure', 1_000],
    ['interrupted', 'user_stopped', 0], ['failed', 'duration_reached', 1_000],
  ]) {
    const f = fixture()
    f.voice.update(snapshot('capturing', { remainingMillis: 2_800 }))
    f.voice.update(snapshot(phase, { endReason, remainingMillis, ...deficient }))
    assert.equal(f.events.at(-1), 'stop')
    f.voice.update(snapshot('observing_finger', deficient))
    assert.deepEqual(f.heard, ['countdown'])
  }
  const g = fixture({ deferred: true })
  g.voice.update(snapshot('capturing', { remainingMillis: 2_750 }))
  const pending = g.last()
  g.voice.update(snapshot('stopping', { endReason: 'duration_reached', remainingMillis: 0 }))
  assert.equal(pending.canPlay(), false)
  pending.load()
  pending.complete()
  assert.deepEqual(g.heard, [])
  const h = fixture()
  h.voice.update(snapshot('completed', { endReason: 'duration_reached', remainingMillis: 0 }))
  assert.deepEqual(h.heard, [])
})

test('绑定轮次且取消永久失效，迟到加载不能复活，释放幂等且新轮独立', () => {
  const f = fixture({ deferred: true })
  f.voice.update(snapshot())
  const old = f.last()
  f.voice.update(snapshot('awaiting_chest', { captureId: 'other-round' }))
  f.voice.cancel()
  old.load()
  old.complete()
  f.voice.setHelpVisible(true)
  f.voice.update(snapshot('capturing'))
  f.voice.dispose()
  f.voice.dispose()
  assert.deepEqual(f.heard, [])
  assert.equal(f.attempts.length, 1)
  assert.equal(f.events.filter(event => event === 'dispose').length, 1)
  const next = fixture()
  next.voice.update(snapshot('observing_finger', { captureId: 'next-round' }))
  assert.deepEqual(next.heard, ['placementGuide'])
})
