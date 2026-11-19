/** 只消费同轮原生阶段、剩余量及指导可见性，不控制准入或页面成功。 */
import type { BloodPressureSnapshot } from '@health-cv-app/acquisition'
import type { BloodPressureVoiceCue, MeasurementVoicePlayer } from '@/app/measurement/measurementVoiceTypes'

/** 页面每轮独占的血压语音消费者，取消后永久失效。 */
export interface BloodPressureVoice {
  /** 接收未经展示防抖的同轮原生事实。 */
  update(snapshot: BloodPressureSnapshot): void
  /** 仅消费既有十秒指导的实际可见性。 */
  setHelpVisible(visible: boolean): void
  /** 立即撤销本轮所有加载与播放资格。 */
  cancel(): void
  /** 取消并释放独占播放器。 */
  dispose(): void
}

/** 两种准备阶段共用贴胸段身份，但不与指尖调度器共用状态机。 */
export function createBloodPressureVoice(player: MeasurementVoicePlayer<BloodPressureVoiceCue>): BloodPressureVoice {
  let captureId: string | null = null
  let latest: BloodPressureSnapshot | null = null
  let cancelled = false
  let disposed = false
  let ended = false
  let firstSnapshot = true
  let chestSegment = 0
  let returnedToFinger = false
  // 只消费当前适用节点，跨过的开始、20 秒或 10 秒不追播。
  let captureNode = 0
  let helpVisible = false
  let helpConsumed = false
  let helpBlockedByCorrection = false
  let deficitActive = false
  let deficitEpisode = 0
  let correctionConsumed = false
  let currentCue: BloodPressureVoiceCue | null = null
  let token = 0

  function chestPreparing(snapshot: BloodPressureSnapshot) {
    return snapshot.phase === 'awaiting_chest' || snapshot.phase === 'starting'
  }

  function preparing(snapshot: BloodPressureSnapshot) {
    return snapshot.phase === 'observing_finger' || chestPreparing(snapshot)
  }

  /** 先撤销回调令牌，再停止实际播放器，包括仍在加载的旧候选。 */
  function stop() {
    token++
    currentCue = null
    player.stop()
  }

  /** 未知输入不推断不足，也不恢复连续不足的纠正资格。 */
  function coverageDeficit(snapshot: BloodPressureSnapshot): boolean | null {
    if (snapshot.coverageState === 'unknown' || snapshot.coveragePercent == null) return null
    return snapshot.phase === 'capturing'
      ? snapshot.coveragePercent < 95
      : snapshot.coverageState !== 'complete'
  }

  /** 只用原生剩余量，空档必须严格大于完整实测时长。 */
  function fitsGap(cue: BloodPressureVoiceCue, snapshot: BloodPressureSnapshot) {
    if (snapshot.phase !== 'capturing') return true
    const remaining = snapshot.remainingMillis
    const next = remaining > 20_000 ? 20_000 : remaining > 10_000 ? 10_000 : 3_000
    const duration = player.durationMillis(cue)
    return Number.isFinite(duration) && duration > 0 && duration < remaining - next
  }

  function play(cue: BloodPressureVoiceCue, critical: boolean) {
    if (currentCue != null) stop()
    const expectedToken = ++token
    const expectedSegment = chestSegment
    const expectedEpisode = deficitEpisode
    currentCue = cue
    player.play(cue, () => {
      if (cancelled || disposed || expectedToken !== token) return
      currentCue = null
      // 低优先级完成不自动串播帮助；关键节点完成只重判最新事实。
      if (critical) tryLowPriority()
    }, () => {
      const snapshot = latest
      if (cancelled || disposed || ended || expectedToken !== token || currentCue !== cue
        || snapshot == null || snapshot.captureId !== captureId || snapshot.endReason != null) return false
      if (cue === 'placementGuide') return snapshot.phase === 'observing_finger' && captureNode === 0
      if (cue === 'chestGuide') return chestPreparing(snapshot) && expectedSegment === chestSegment
      if (cue === 'restoreCover' || cue === 'coverCamera') {
        return expectedEpisode === deficitEpisode && expectedSegment === chestSegment
          && (preparing(snapshot) || snapshot.phase === 'capturing')
          && coverageDeficit(snapshot) === true && fitsGap(cue, snapshot)
          && (cue !== 'restoreCover' || (returnedToFinger && snapshot.phase === 'observing_finger'))
      }
      if (cue === 'placementHelp') return helpVisible && snapshot.phase === 'observing_finger' && fitsGap(cue, snapshot)
      if (snapshot.phase !== 'capturing') return false
      const remaining = snapshot.remainingMillis
      if (cue === 'starting') return remaining > 20_000
      if (cue === 'remaining20') return remaining > 10_000 && remaining <= 20_000
      if (cue === 'remaining10') return remaining > 3_000 && remaining <= 10_000
      return remaining > 0 && remaining <= 3_000
    })
  }

  function tryLowPriority() {
    const snapshot = latest
    if (cancelled || disposed || ended || currentCue != null || snapshot == null) return
    if (coverageDeficit(snapshot) === true && !correctionConsumed) {
      const cue = returnedToFinger && snapshot.phase === 'observing_finger' ? 'restoreCover' : 'coverCamera'
      if (fitsGap(cue, snapshot)) {
        correctionConsumed = true
        if (helpVisible) helpBlockedByCorrection = true
        play(cue, false)
      }
      return
    }
    if (helpBlockedByCorrection) return
    if (helpVisible && !helpConsumed && snapshot.phase === 'observing_finger' && fitsGap('placementHelp', snapshot)) {
      helpConsumed = true
      play('placementHelp', false)
    }
  }

  /** 只有原生证明正式窗口完整到点，才允许已开始的合并结束音跨越收尾。 */
  function reachedWindowEnd(snapshot: BloodPressureSnapshot) {
    return snapshot.endReason === 'duration_reached'
      && (snapshot.phase === 'capturing' || snapshot.phase === 'stopping'
        || snapshot.phase === 'completed' || snapshot.phase === 'failed')
      && snapshot.windowStartElapsedNanos != null && snapshot.targetDurationMillis > 0
      && snapshot.elapsedMillis >= snapshot.targetDurationMillis && snapshot.remainingMillis <= 0
  }

  function cancel() {
    if (cancelled || disposed) return
    cancelled = true
    latest = null
    helpVisible = false
    stop()
  }

  return {
    update(snapshot) {
      if (cancelled || disposed || (captureId != null && captureId !== snapshot.captureId)) return
      captureId ??= snapshot.captureId
      const previous = latest
      latest = snapshot
      if (ended) return
      if (snapshot.endReason != null || (!preparing(snapshot) && snapshot.phase !== 'capturing')) {
        ended = true
        returnedToFinger = false
        helpVisible = false
        helpConsumed = true
        // canPlay 在 ended 后恒为假，旧加载不能在终点后新发声。
        if (currentCue !== 'countdown' || !reachedWindowEnd(snapshot)) stop()
        return
      }

      const initial = firstSnapshot
      firstSnapshot = false
      const enteredChest = chestPreparing(snapshot) && (previous == null || !chestPreparing(previous))
      const leftChest = previous != null && chestPreparing(previous) && !chestPreparing(snapshot)
      const enteredCapture = snapshot.phase === 'capturing' && previous?.phase !== 'capturing'
      if (enteredChest || leftChest || enteredCapture) {
        chestSegment++
        returnedToFinger = leftChest && snapshot.phase === 'observing_finger'
        if (currentCue != null) stop()
      }
      if (snapshot.phase !== 'observing_finger') {
        helpVisible = false
        if (snapshot.phase === 'capturing') helpConsumed = true
      }

      const deficit = coverageDeficit(snapshot)
      if (deficit === false) {
        if (deficitActive) {
          deficitEpisode++
          returnedToFinger = false
        }
        deficitActive = false
        correctionConsumed = false
        helpBlockedByCorrection = false
        if (currentCue === 'restoreCover' || currentCue === 'coverCamera') stop()
      } else if (deficit === true) {
        deficitActive = true
      }

      if (snapshot.phase === 'capturing') {
        const node = snapshot.remainingMillis <= 3_000 ? 4
          : snapshot.remainingMillis <= 10_000 ? 3
            : snapshot.remainingMillis <= 20_000 ? 2 : 1
        if (node > captureNode) {
          captureNode = node
          play(node === 4 ? 'countdown' : node === 3 ? 'remaining10' : node === 2 ? 'remaining20' : 'starting', true)
          return
        }
      } else if (enteredChest) {
        play('chestGuide', false)
        return
      } else if (initial && snapshot.phase === 'observing_finger') {
        play('placementGuide', false)
        return
      }

      if (currentCue === 'placementHelp' && (!helpVisible || snapshot.phase !== 'observing_finger')) stop()
      tryLowPriority()
    },
    setHelpVisible(visible) {
      if (cancelled || disposed || ended) return
      if (visible && !helpVisible) helpBlockedByCorrection = currentCue === 'coverCamera' || currentCue === 'restoreCover'
      if (helpVisible && !visible) helpConsumed = true
      helpVisible = visible
      if (!visible && currentCue === 'placementHelp') stop()
      tryLowPriority()
    },
    cancel,
    dispose() {
      if (disposed) return
      cancel()
      disposed = true
      player.dispose()
    },
  }
}
