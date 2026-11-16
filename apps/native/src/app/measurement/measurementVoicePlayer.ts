/** 接触式检测页面独占的 Expo Audio 入口，不启用录音、后台或锁屏控制。 */
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio'
import { createMeasurementVoicePlayback } from './measurementVoicePlayback'
import type { MeasurementVoicePlayer, MeasurementVoiceResource } from './measurementVoiceTypes'

/** 注入本方式资源表，延迟创建唯一播放器，不共享页面播放状态。 */
export function createMeasurementVoicePlayer<Cue extends string>(resources: Record<Cue, MeasurementVoiceResource>): MeasurementVoicePlayer<Cue> {
  return createMeasurementVoicePlayback(
    () => createAudioPlayer(null, { updateInterval: 100, keepAudioSessionActive: false }),
    () => setAudioModeAsync({
      allowsRecording: false,
      allowsBackgroundRecording: false,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
    }),
    resources,
  )
}
