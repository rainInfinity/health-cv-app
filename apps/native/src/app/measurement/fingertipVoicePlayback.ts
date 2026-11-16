/** 单播放器的异步定位与取消屏障；失效准备不能在停止后重新发声。 */
import type { FingertipVoiceCue, FingertipVoicePlayer, FingertipVoiceResource } from './fingertipVoiceTypes'

/** 播放适配只依赖现有播放器的必要命令，便于验证迟到定位。 */
interface VoiceDriver {
  /** 当前资源真实加载完成，避免仅排队 play 后在过时状态发声。 */
  readonly isLoaded: boolean
  /** 暂停不释放播放器。 */
  pause(): void
  /** 同一实例替换随包资源。 */
  replace(source: number): void
  /** 从原文件起点定位，单位秒。 */
  seekTo(seconds: number): Promise<void>
  /** 开始或等待本地资源就绪后播放。 */
  play(): void
  /** 释放原生实例。 */
  remove(): void
  /** 只消费完成或播放失败，不修改检测状态。 */
  addListener(event: 'playbackStatusUpdate', listener: (status: { isLoaded: boolean; didJustFinish: boolean; error: string | null }) => void): { remove(): void }
}

/** 注入播放器边界，所有切换共用一个实例及单调递增令牌。 */
export function createFingertipVoicePlayback(
  createDriver: () => VoiceDriver,
  configure: () => Promise<void>,
  resources: Record<FingertipVoiceCue, FingertipVoiceResource>,
): FingertipVoicePlayer {
  let driver: VoiceDriver | null = null
  let ready: Promise<void> | null = null
  let token = 0
  let disposed = false
  let subscription: { remove(): void } | null = null

  /** 先撤销回调资格，再暂停；无需等待尚未完成的定位。 */
  function stop() {
    token += 1
    subscription?.remove()
    subscription = null
    driver?.pause()
  }

  return {
    durationMillis: (cue) => resources[cue].durationMillis,
    play(cue, onComplete, canPlay = () => true) {
      if (disposed) return
      stop()
      const expected = token
      const current = () => !disposed && expected === token
      /** 完成与失败都只释放本次通道，旧事件不能结束新提示。 */
      const finish = () => {
        if (!current()) return
        stop()
        onComplete()
      }
      void (async () => {
        ready ??= configure()
        await ready
        if (!current()) return
        if (!canPlay()) { finish(); return }
        driver ??= createDriver()
        const active = driver
        active.replace(resources[cue].source)
        let positioning = false
        let started = false
        /** 原生真正就绪后才定位并复核，加载期间不预先排队播放。 */
        const startLoaded = () => {
          if (!current() || positioning) return
          positioning = true
          void active.seekTo(0).then(() => {
            if (!current()) return
            if (!canPlay()) { finish(); return }
            started = true
            active.play()
          }).catch(finish)
        }
        subscription = active.addListener('playbackStatusUpdate', (status) => {
          if (!current()) return
          if (status.error != null || (started && status.didJustFinish)) finish()
          else if (status.isLoaded) startLoaded()
        })
        if (active.isLoaded) startLoaded()
      })().catch(finish)
    },
    stop,
    dispose() {
      if (disposed) return
      stop()
      disposed = true
      driver?.remove()
      driver = null
    },
  }
}
