/** 指尖本地短语音的节点与单路播放契约，不包含检测状态变更。 */

/** 七段现有录音的业务节点。 */
export type FingertipVoiceCue = 'placementGuide' | 'starting' | 'remaining20' | 'remaining10' | 'countdown' | 'coverCamera' | 'placementHelp'

/** 随包资源及不经裁剪的原文件时长。 */
export interface FingertipVoiceResource {
  /** Metro 静态 require 生成的本地资源标识。 */
  source: number
  /** 包含首尾静音的完整时长，单位毫秒。 */
  durationMillis: number
}

/** 页面独占播放器；调度器负责节点资格，适配器负责异步播放取消。 */
export interface FingertipVoicePlayer {
  /** 原文件实测完整时长，单位毫秒，包含首尾静音。 */
  durationMillis(cue: FingertipVoiceCue): number
  /** 从头播放；失败也释放通道，真正发声前重新检查最新资格。 */
  play(cue: FingertipVoiceCue, onComplete: () => void, canPlay?: () => boolean): void
  /** 立即停止并使尚未完成的准备和定位失效，不回调旧完成事件。 */
  stop(): void
  /** 释放本页播放器与事件订阅。 */
  dispose(): void
}
