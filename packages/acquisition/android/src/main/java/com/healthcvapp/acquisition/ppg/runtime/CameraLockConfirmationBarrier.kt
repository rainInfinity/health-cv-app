/** 将当前相机周期的 AE／AWB 请求与新的拍摄结果严格关联。 */

package com.healthcvapp.acquisition.ppg.runtime

import com.healthcvapp.acquisition.camera.CameraFrameMetadata
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeout

/** 只接受当前周期、晚于基线且实际锁状态匹配的 Camera2 结果。 */
internal class CameraLockConfirmationBarrier(
  private val cameraSessionId: String,
  private val minimumFrameTimestampNanos: Long?,
  private val expectedAeLocked: Boolean?,
  private val expectedAwbLocked: Boolean?,
  private val timeoutMillis: Long = LOCK_CONFIRMATION_TIMEOUT_MILLIS,
) {
  private val confirmation = CompletableDeferred<CameraFrameMetadata>()
  private var latestFrameTimestampNanos = minimumFrameTimestampNanos

  init {
    require(cameraSessionId.isNotBlank())
    require(expectedAeLocked != null || expectedAwbLocked != null)
    require(timeoutMillis > 0L)
  }

  /** 接收真实拍摄结果；旧周期、基线帧、缺失值和状态不匹配均不确认。 */
  @Synchronized
  fun offer(openedCameraSessionId: String, metadata: CameraFrameMetadata): Boolean {
    if (confirmation.isCompleted || openedCameraSessionId != cameraSessionId) return false
    val frameTimestampNanos = metadata.timestampFrameNanos ?: return false
    val latestFrameTimestampNanos = this.latestFrameTimestampNanos
    if (latestFrameTimestampNanos != null && frameTimestampNanos <= latestFrameTimestampNanos) return false
    this.latestFrameTimestampNanos = frameTimestampNanos
    if (expectedAeLocked != null && metadata.aeLocked != expectedAeLocked) return false
    if (expectedAwbLocked != null && metadata.awbLocked != expectedAwbLocked) return false
    return confirmation.complete(metadata)
  }

  /** 在有限时间内等待符合当前请求的第一条真实结果。 */
  suspend fun await(): CameraFrameMetadata = withTimeout(timeoutMillis) { confirmation.await() }

  /** 使后台中断、关闭或设备错误立即终止等待。 */
  fun fail(error: Throwable) {
    confirmation.completeExceptionally(error)
  }

  private companion object {
    const val LOCK_CONFIRMATION_TIMEOUT_MILLIS = 2_000L
  }
}
