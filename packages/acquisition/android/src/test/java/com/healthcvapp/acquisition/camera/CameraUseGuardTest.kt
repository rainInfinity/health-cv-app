/** 验证主动与被动采集共享相机时的持有者隔离。 */

package com.healthcvapp.acquisition.camera

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/** 覆盖忙状态、旧会话迟到释放和打开失败后的资源恢复。 */
class CameraUseGuardTest {
  @Test
  fun `existing holder blocks a second session and release enables next owner`() {
    val active = CameraUseGuard.tryAcquire("active-session")
    assertNotNull(active)
    assertNull(CameraUseGuard.tryAcquire("passive-session"))

    active!!.close()

    val passive = CameraUseGuard.tryAcquire("passive-session")
    assertNotNull(passive)
    assertNull(CameraUseGuard.tryAcquire("active-session-again"))
    passive!!.close()
  }

  @Test
  fun `late release from old lease cannot release a newer holder`() {
    val oldLease = CameraUseGuard.tryAcquire("old-session")
    assertNotNull(oldLease)
    oldLease!!.close()

    val newLease = CameraUseGuard.tryAcquire("new-session")
    assertNotNull(newLease)
    oldLease.close()
    assertNull(CameraUseGuard.tryAcquire("third-session"))

    newLease!!.close()
    val finalLease = CameraUseGuard.tryAcquire("third-session")
    assertNotNull(finalLease)
    finalLease!!.close()
  }

  @Test
  fun `failed open releases its lease`() {
    val lease = CameraUseGuard.tryAcquire("failing-session")
    assertNotNull(lease)

    try {
      throw IllegalStateException("camera open failed")
    } catch (error: IllegalStateException) {
      assertEquals("camera open failed", error.message)
    } finally {
      lease!!.close()
    }

    val nextLease = CameraUseGuard.tryAcquire("next-session")
    assertNotNull(nextLease)
    nextLease!!.close()
  }
}
