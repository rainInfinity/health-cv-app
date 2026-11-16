/** 血压共用六段录音，贴胸、正式开始及重新覆盖使用方式独有资源。 */
import { commonVoiceResources } from './commonVoiceResources'
import type { BloodPressureVoiceCue, MeasurementVoiceResource } from './measurementVoiceTypes'

/** 静态打包原始录音；完整时长包含首尾静音，不裁剪或调整语速。 */
export const bloodPressureVoiceResources: Record<BloodPressureVoiceCue, MeasurementVoiceResource> = {
  ...commonVoiceResources,
  chestGuide: { source: require('../../../assets/audio/blood-pressure/chest-guide.mp3'), durationMillis: 5040 },
  starting: { source: require('../../../assets/audio/blood-pressure/starting.mp3'), durationMillis: 4008 },
  restoreCover: { source: require('../../../assets/audio/blood-pressure/restore-cover.mp3'), durationMillis: 3672 },
}
