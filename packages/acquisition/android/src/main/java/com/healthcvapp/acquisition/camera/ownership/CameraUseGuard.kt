/** 以单一会话令牌隔离主动 PPG 与被动录像的相机占用。 */

package com.healthcvapp.acquisition.camera.ownership

/** 相机不支持两种采集会话并行时提供最小的持有者保护。 */
internal object CameraUseGuard {
  private val lock = Any()
  /** 当前持有相机的唯一会话令牌；无持有者时为空。 */
  private var ownerToken: String? = null

  /** 仅在没有其它会话持有相机时取得可幂等释放的占用权。 */
  fun tryAcquire(token: String): CameraUseLease? = synchronized(lock) {
    require(token.isNotBlank()) { "相机持有令牌不能为空。" }
    if (ownerToken != null) return@synchronized null
    ownerToken = token
    CameraUseLease(token)
  }

  /** 仅由仍匹配的持有者释放占用权，迟到的旧会话不会影响新会话。 */
  internal fun release(token: String): Boolean = synchronized(lock) {
    if (ownerToken != token) return@synchronized false
    ownerToken = null
    true
  }
}

/** 表示一个会话持有的相机资源，并防止重复释放影响后续持有者。 */
internal class CameraUseLease internal constructor(
  private val ownerToken: String,
) : AutoCloseable {
  private val released = java.util.concurrent.atomic.AtomicBoolean(false)

  /** 只释放本令牌对应的相机占用。 */
  override fun close() {
    if (released.compareAndSet(false, true)) CameraUseGuard.release(ownerToken)
  }
}
