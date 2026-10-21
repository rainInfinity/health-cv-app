/** 以每次录像独立的终态仲裁关闭、Finalize 与文件发布。 */

package com.healthcvapp.acquisition.passive.capture

/** 一次录像从打开到完成或取消的阶段。 */
internal enum class PassiveCaptureAttemptPhase {
  /** 正在打开相机或等待 CameraX Start。 */
  OPENING,
  /** CameraX 已确认录像开始。 */
  RECORDING,
  /** 已请求 CameraX Finalize，尚未提交完成文件。 */
  FINALIZING,
  /** 已取得原子发布权，后续关闭不能撤销已线性化的完成操作。 */
  PUBLISHING,
  /** 完成文件已成功发布。 */
  COMPLETED,
  /** 片段已取消或失败，不得发布完成文件。 */
  CANCELLED,
}

/** 以同步状态转移确定录像完成与关闭竞争时的唯一胜者。 */
internal class PassiveCaptureAttemptLifecycle {
  private var phase = PassiveCaptureAttemptPhase.OPENING

  /** 只有未取消的打开阶段能接受 CameraX Start。 */
  @Synchronized
  fun markRecordingStarted(): Boolean {
    if (phase != PassiveCaptureAttemptPhase.OPENING) return false
    phase = PassiveCaptureAttemptPhase.RECORDING
    return true
  }

  /** 只有实际录像能进入收尾；非目标时长结束直接取消。 */
  @Synchronized
  fun beginFinalization(reachedTargetDuration: Boolean): Boolean {
    if (phase != PassiveCaptureAttemptPhase.RECORDING) return false
    phase = if (reachedTargetDuration) {
      PassiveCaptureAttemptPhase.FINALIZING
    } else {
      PassiveCaptureAttemptPhase.CANCELLED
    }
    return reachedTargetDuration
  }

  /** 在发布线性化前取消当前片段；重复关闭和旧回调不影响终态。 */
  @Synchronized
  fun cancel(): Boolean {
    if (phase != PassiveCaptureAttemptPhase.OPENING &&
      phase != PassiveCaptureAttemptPhase.RECORDING &&
      phase != PassiveCaptureAttemptPhase.FINALIZING
    ) {
      return false
    }
    phase = PassiveCaptureAttemptPhase.CANCELLED
    return true
  }

  /** 媒体校验后、文件重命名前原子取得发布权。 */
  @Synchronized
  fun claimPublication(): Boolean {
    if (phase != PassiveCaptureAttemptPhase.FINALIZING) return false
    phase = PassiveCaptureAttemptPhase.PUBLISHING
    return true
  }

  /** 记录当前发布事务的终态，不接受迟到回调改变其它阶段。 */
  @Synchronized
  fun completePublication(succeeded: Boolean) {
    if (phase != PassiveCaptureAttemptPhase.PUBLISHING) return
    phase = if (succeeded) {
      PassiveCaptureAttemptPhase.COMPLETED
    } else {
      PassiveCaptureAttemptPhase.CANCELLED
    }
  }

  /** 为确定性行为测试及服务诊断返回当前阶段。 */
  @Synchronized
  fun currentPhase(): PassiveCaptureAttemptPhase = phase
}
