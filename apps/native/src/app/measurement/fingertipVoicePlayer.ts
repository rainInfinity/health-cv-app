/** 指尖页面独占的 Expo Audio 播放入口，不启用录音、后台或锁屏控制。 */
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio'
import { createFingertipVoicePlayback } from './fingertipVoicePlayback'
import { fingertipVoiceResources } from './fingertipVoiceResources'

/** 延迟创建唯一播放器；血压不调用此入口，因此不会初始化音频会话。 */
export function createFingertipVoicePlayer() {
  return createFingertipVoicePlayback(
    () => createAudioPlayer(null, { updateInterval: 100, keepAudioSessionActive: false }),
    () => setAudioModeAsync({
      allowsRecording: false,
      allowsBackgroundRecording: false,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
    }),
    fingertipVoiceResources,
  )
}
