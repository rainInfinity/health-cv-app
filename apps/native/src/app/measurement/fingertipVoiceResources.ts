/** 静态打包七段用户录音；时长由原 MP3 测量，包含首尾静音。 */
import type { FingertipVoiceCue, FingertipVoiceResource } from './fingertipVoiceTypes'

/** 原文件资源标识及完整时长（毫秒），不裁剪结束语。 */
export const fingertipVoiceResources: Record<FingertipVoiceCue, FingertipVoiceResource> = {
  placementGuide: { source: require('../../../assets/audio/fingertip/placement-guide.mp3'), durationMillis: 3264 },
  starting: { source: require('../../../assets/audio/fingertip/starting.mp3'), durationMillis: 2808 },
  remaining20: { source: require('../../../assets/audio/fingertip/remaining-20s.mp3'), durationMillis: 1968 },
  remaining10: { source: require('../../../assets/audio/fingertip/remaining-10s.mp3'), durationMillis: 1920 },
  countdown: { source: require('../../../assets/audio/fingertip/countdown-3s.mp3'), durationMillis: 4032 },
  coverCamera: { source: require('../../../assets/audio/fingertip/cover-camera.mp3'), durationMillis: 3048 },
  placementHelp: { source: require('../../../assets/audio/fingertip/placement-help.mp3'), durationMillis: 3384 },
}
