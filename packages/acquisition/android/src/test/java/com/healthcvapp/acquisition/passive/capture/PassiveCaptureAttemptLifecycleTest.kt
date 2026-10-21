/** 验证录像关闭、Finalize 和发布的确定性竞争结果。 */

package com.healthcvapp.acquisition.passive.capture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** 覆盖打开中、录像中、收尾中、重复关闭和迟到 Finalize。 */
class PassiveCaptureAttemptLifecycleTest {
  @Test
  fun `close while opening prevents a late start from entering recording`() {
    val attempt = PassiveCaptureAttemptLifecycle()

    assertTrue(attempt.cancel())
    assertFalse(attempt.markRecordingStarted())
    assertFalse(attempt.cancel())
    assertFalse(attempt.claimPublication())
    assertEquals(PassiveCaptureAttemptPhase.CANCELLED, attempt.currentPhase())
  }

  @Test
  fun `close while recording cancels the clip before finalization`() {
    val attempt = PassiveCaptureAttemptLifecycle()
    assertTrue(attempt.markRecordingStarted())

    assertTrue(attempt.cancel())
    assertFalse(attempt.beginFinalization(reachedTargetDuration = true))
    assertFalse(attempt.claimPublication())
    assertEquals(PassiveCaptureAttemptPhase.CANCELLED, attempt.currentPhase())
  }

  @Test
  fun `close during finalization wins before the publication claim`() {
    val attempt = PassiveCaptureAttemptLifecycle()
    assertTrue(attempt.markRecordingStarted())
    assertTrue(attempt.beginFinalization(reachedTargetDuration = true))

    assertTrue(attempt.cancel())
    assertFalse(attempt.claimPublication())
    assertEquals(PassiveCaptureAttemptPhase.CANCELLED, attempt.currentPhase())
  }

  @Test
  fun `publication claim is the completion boundary and close is idempotent`() {
    val attempt = PassiveCaptureAttemptLifecycle()
    assertTrue(attempt.markRecordingStarted())
    assertTrue(attempt.beginFinalization(reachedTargetDuration = true))
    assertTrue(attempt.claimPublication())

    assertFalse(attempt.cancel())
    attempt.completePublication(succeeded = true)
    attempt.completePublication(succeeded = false)
    assertFalse(attempt.cancel())
    assertEquals(PassiveCaptureAttemptPhase.COMPLETED, attempt.currentPhase())
  }

  @Test
  fun `late finalize from a cancelled session cannot mutate a newer session`() {
    val oldAttempt = PassiveCaptureAttemptLifecycle()
    val newAttempt = PassiveCaptureAttemptLifecycle()
    assertTrue(oldAttempt.markRecordingStarted())
    assertTrue(oldAttempt.beginFinalization(reachedTargetDuration = true))
    assertTrue(oldAttempt.cancel())
    assertTrue(newAttempt.markRecordingStarted())

    oldAttempt.completePublication(succeeded = true)
    assertFalse(oldAttempt.claimPublication())
    assertEquals(PassiveCaptureAttemptPhase.CANCELLED, oldAttempt.currentPhase())
    assertEquals(PassiveCaptureAttemptPhase.RECORDING, newAttempt.currentPhase())
  }
}
