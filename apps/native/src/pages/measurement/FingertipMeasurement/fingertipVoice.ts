/** 只消费本轮原生事实与指导可见性，不建立检测时钟或推进页面状态。 */
import type { FingertipSnapshot } from '@health-cv-app/acquisition'
import type { FingertipVoiceCue, MeasurementVoicePlayer } from '@/app/measurement/measurementVoiceTypes'

/** 指尖页面每轮持有的纯语音消费者，不提供任何采集控制命令。 */
export interface FingertipVoice {
  /** 接收同轮未经展示防抖的原生事实。 */
  update(snapshot: FingertipSnapshot): void
  /** 使用既有十秒指导的实际可见性，不创建额外计时。 */
  setHelpVisible(visible: boolean): void
  /** 永久撤销本轮语音，返回前台不恢复。 */
  cancel(): void
  /** 取消并释放本页独占播放器。 */
  dispose(): void
}

/** 每轮独立创建；取消后不能通过后续快照恢复播放资格。 */
export function createFingertipVoice(player: MeasurementVoicePlayer<FingertipVoiceCue>): FingertipVoice {
  let captureId: string | null = null
  let latest: FingertipSnapshot | null = null
  let cancelled = false
  let disposed = false
  let ended = false
  let observed = false
  // 0 为未正式开始；1 至 4 依次为开始、20 秒、10 秒和结束节点。
  let captureNode = 0
  let helpVisible = false
  let helpConsumed = false
  // 只阻止同一提示时机的纠正与帮助串播，不屏蔽后来新显示的十秒指导。
  let helpBlockedByCorrection = false
  let deficitActive = false
  let deficitEpisode = 0
  let correctionConsumed = false
  let currentCue: FingertipVoiceCue | null = null
  let token = 0

  /** 先撤销回调令牌，再让播放器撤销正在加载或播放的操作。 */
  function stop() {
    token++
    currentCue = null
    player.stop()
  }

  /** 未知覆盖不推断不足，也不以未知事实恢复纠正资格。 */
  function coverageDeficit(snapshot: FingertipSnapshot): boolean | null {
    if (snapshot.coverageState === 'unknown' || snapshot.coveragePercent == null) return null
    return snapshot.phase === 'capturing'
      ? snapshot.coveragePercent < 95
      : snapshot.coverageState !== 'complete'
  }

  function preparing(snapshot: FingertipSnapshot) {
    return snapshot.phase === 'observing' || snapshot.phase === 'starting'
  }

  /** 空档严格大于完整音频时长；仅使用最新原生剩余量，不估算经过时间。 */
  function fitsGap(cue: FingertipVoiceCue, snapshot: FingertipSnapshot) {
    if (snapshot.phase !== 'capturing') return true
    const remaining = snapshot.remainingMillis
    const next = remaining > 20_000 ? 20_000 : remaining > 10_000 ? 10_000 : 3_000
    const duration = player.durationMillis(cue)
    return Number.isFinite(duration) && duration > 0 && duration < remaining - next
  }

  function play(cue: FingertipVoiceCue, critical: boolean) {
    if (currentCue != null) stop()
    const expectedToken = ++token
    const expectedDeficitEpisode = deficitEpisode
    currentCue = cue
    player.play(cue, () => {
      if (cancelled || disposed || expectedToken !== token) return
      currentCue = null
      // 关键节点结束后只重判最新事实；低优先级结束不自动串播相近指导。
      if (critical) tryLowPriority()
    }, () => {
      const snapshot = latest
      if (cancelled || disposed || ended || expectedToken !== token || currentCue !== cue
        || snapshot == null || snapshot.captureId !== captureId || snapshot.endReason != null) return false
      if (cue === 'coverCamera') return expectedDeficitEpisode === deficitEpisode
        && coverageDeficit(snapshot) === true && fitsGap(cue, snapshot)
      if (cue === 'placementHelp') return helpVisible && preparing(snapshot) && fitsGap(cue, snapshot)
      if (cue === 'placementGuide') return preparing(snapshot) && captureNode === 0
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
    const deficit = coverageDeficit(snapshot)
    if (deficit === true && !correctionConsumed) {
      if (fitsGap('coverCamera', snapshot)) {
        correctionConsumed = true
        if (helpVisible) helpBlockedByCorrection = true
        play('coverCamera', false)
      }
      return
    }
    if (helpBlockedByCorrection) return
    if (helpVisible && !helpConsumed && preparing(snapshot) && fitsGap('placementHelp', snapshot)) {
      helpConsumed = true
      play('placementHelp', false)
    }
  }

  /** 原生在进入 stopping 前还可能发布带结束原因的 capturing 快照。 */
  function reachedWindowEnd(snapshot: FingertipSnapshot) {
    return snapshot.endReason === 'duration_reached'
      && (snapshot.phase === 'capturing' || snapshot.phase === 'stopping'
        || snapshot.phase === 'completed' || snapshot.phase === 'failed')
      && snapshot.windowStartElapsedNanos != null
      && snapshot.targetDurationMillis > 0
      && snapshot.elapsedMillis >= snapshot.targetDurationMillis
      && snapshot.remainingMillis <= 0
  }

  function cancel() {
    if (cancelled || disposed) return
    cancelled = true
    latest = null
    helpVisible = false
    stop()
  }

  return {
    update(snapshot: FingertipSnapshot) {
      if (cancelled || disposed) return
      if (captureId == null) captureId = snapshot.captureId
      if (captureId !== snapshot.captureId) return
      latest = snapshot
      if (ended) return
      if (snapshot.endReason != null || (!preparing(snapshot) && snapshot.phase !== 'capturing')) {
        ended = true
        helpVisible = false
        helpConsumed = true
        // 只保留已经启动的合并结束音频，不在终态补播。
        if (currentCue !== 'countdown' || !reachedWindowEnd(snapshot)) stop()
        return
      }

      const deficit = coverageDeficit(snapshot)
      if (deficit === false) {
        if (deficitActive) deficitEpisode++
        deficitActive = false
        correctionConsumed = false
        helpBlockedByCorrection = false
      } else if (deficit === true) {
        deficitActive = true
      }

      if (snapshot.phase === 'capturing') {
        helpVisible = false
        helpConsumed = true
        const node = snapshot.remainingMillis <= 3_000 ? 4
          : snapshot.remainingMillis <= 10_000 ? 3
            : snapshot.remainingMillis <= 20_000 ? 2 : 1
        if (node > captureNode) {
          captureNode = node
          const cue = node === 4 ? 'countdown' : node === 3 ? 'remaining10' : node === 2 ? 'remaining20' : 'starting'
          play(cue, true)
          return
        }
      } else if (snapshot.phase === 'observing' && !observed && captureNode === 0) {
        observed = true
        play('placementGuide', false)
        return
      }

      // 帮助收起立即撤销；其他异步候选在真正发声前按最新事实复核。
      if (currentCue === 'placementHelp' && (!helpVisible || !preparing(snapshot))) stop()
      tryLowPriority()
    },
    setHelpVisible(visible: boolean) {
      if (cancelled || disposed || ended) return
      if (visible && !helpVisible) helpBlockedByCorrection = currentCue === 'coverCamera'
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
