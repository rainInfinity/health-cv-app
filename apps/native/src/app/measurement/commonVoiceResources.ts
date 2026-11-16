/** 指尖与血压共用的随包录音；完整时长包含首尾静音。 */
import type { CommonMeasurementVoiceCue, MeasurementVoiceResource } from './measurementVoiceTypes'

/** 共用提示只保留一份资源，两种方式使用相同录音与真实时长。 */
export const commonVoiceResources: Record<CommonMeasurementVoiceCue, MeasurementVoiceResource> = {
  placementGuide: { source: require('../../../assets/audio/common/placement-guide.mp3'), durationMillis: 5352 },
  coverCamera: { source: require('../../../assets/audio/common/cover-camera.mp3'), durationMillis: 3168 },
  remaining20: { source: require('../../../assets/audio/common/remaining-20s.mp3'), durationMillis: 1968 },
  remaining10: { source: require('../../../assets/audio/common/remaining-10s.mp3'), durationMillis: 1920 },
  countdown: { source: require('../../../assets/audio/common/countdown-3s.mp3'), durationMillis: 4032 },
  placementHelp: { source: require('../../../assets/audio/common/placement-help.mp3'), durationMillis: 3384 },
}
