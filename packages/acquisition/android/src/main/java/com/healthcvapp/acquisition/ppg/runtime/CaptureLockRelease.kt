/** 在采集文件完成后解除本周期自动锁并保留最终结果。 */

package com.healthcvapp.acquisition.ppg.runtime

/** 表示已保存产物及锁释放操作的可选错误。 */
internal data class CaptureLockReleaseResult<T>(
  /** 文件已完成提交的采集产物。 */
  val artifact: T,
  /** 解锁确认失败时的原始错误。 */
  val error: Throwable?,
)

/** 解锁确认失败时先关闭相机周期，仍返回已完成的产物。 */
internal suspend fun <T> releaseLocksAfterCapture(
  artifact: T,
  releaseLocks: suspend () -> Unit,
  closeFailedCameraCycle: suspend () -> Unit,
): CaptureLockReleaseResult<T> {
  return try {
    releaseLocks()
    CaptureLockReleaseResult(artifact, null)
  } catch (error: Throwable) {
    closeFailedCameraCycle()
    CaptureLockReleaseResult(artifact, error)
  }
}
