/** 组合共用录音与指尖独有开始语音；完整时长包含首尾静音。 */
import { commonVoiceResources } from './commonVoiceResources'
import type { FingertipVoiceCue, MeasurementVoiceResource } from './measurementVoiceTypes'

/** 原文件资源标识及完整时长（毫秒），不裁剪结束语。 */
export const fingertipVoiceResources: Record<FingertipVoiceCue, MeasurementVoiceResource> = {
  ...commonVoiceResources,
  starting: { source: require('../../../assets/audio/fingertip/starting.mp3'), durationMillis: 2544 },
}
