/** 验证采集文件完成后解锁成功与失败的收尾契约。 */

package com.healthcvapp.acquisition.ppg.runtime

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class CaptureLockReleaseTest {
  @Test
  fun `unlock failure preserves the completed artifact and closes the camera cycle`() = runTest {
    val artifact = Any()
    val failure = IllegalStateException("unlock confirmation failed")
    var cameraClosed = false

    val result = releaseLocksAfterCapture(
      artifact = artifact,
      releaseLocks = { throw failure },
      closeFailedCameraCycle = { cameraClosed = true },
    )

    assertSame(artifact, result.artifact)
    assertSame(failure, result.error)
    assertTrue(cameraClosed)
  }

  @Test
  fun `successful unlock keeps preview available without closing the camera`() = runTest {
    val artifact = Any()
    var cameraClosed = false

    val result = releaseLocksAfterCapture(
      artifact = artifact,
      releaseLocks = {},
      closeFailedCameraCycle = { cameraClosed = true },
    )

    assertSame(artifact, result.artifact)
    assertNull(result.error)
    assertFalse(cameraClosed)
  }
}
