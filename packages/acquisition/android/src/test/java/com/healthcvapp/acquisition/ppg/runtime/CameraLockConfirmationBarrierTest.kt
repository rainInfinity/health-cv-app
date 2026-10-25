/** 验证 AE／AWB 锁屏障拒绝旧周期、乱序和未确认结果。 */

package com.healthcvapp.acquisition.ppg.runtime

import com.healthcvapp.acquisition.ppg.camera.CameraFrameMetadata
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CameraLockConfirmationBarrierTest {
  @Test
  fun `confirms only a new result from the current camera with both requested locks`() = runTest {
    val barrier = CameraLockConfirmationBarrier(
      cameraSessionId = "camera-session-2",
      minimumFrameTimestampNanos = 100L,
      expectedAeLocked = true,
      expectedAwbLocked = true,
    )

    assertFalse(barrier.offer("camera-session-1", metadata(101L, true, true)))
    assertFalse(barrier.offer("camera-session-2", metadata(100L, true, true)))
    assertFalse(barrier.offer("camera-session-2", metadata(101L, false, true)))
    assertFalse(barrier.offer("camera-session-2", metadata(102L, true, false)))
    val confirmed = metadata(103L, true, true)
    assertTrue(barrier.offer("camera-session-2", confirmed))
    assertSame(confirmed, barrier.await())
  }

  @Test
  fun `does not accept a late older result after a newer mismatching result`() = runTest {
    val barrier = CameraLockConfirmationBarrier(
      cameraSessionId = "camera-session",
      minimumFrameTimestampNanos = 100L,
      expectedAeLocked = true,
      expectedAwbLocked = null,
    )

    assertFalse(barrier.offer("camera-session", metadata(102L, false, false)))
    assertFalse(barrier.offer("camera-session", metadata(101L, true, true)))
    assertTrue(barrier.offer("camera-session", metadata(103L, true, false)))
  }

  @Test
  fun `fails within the bounded timeout when no capture result confirms the request`() = runTest {
    val barrier = CameraLockConfirmationBarrier(
      cameraSessionId = "camera-session",
      minimumFrameTimestampNanos = null,
      expectedAeLocked = true,
      expectedAwbLocked = null,
      timeoutMillis = 2_000L,
    )
    val result = async { runCatching { barrier.await() } }

    advanceTimeBy(2_001L)
    runCurrent()

    assertTrue(result.await().exceptionOrNull() is TimeoutCancellationException)
  }

  @Test
  fun `device interruption immediately fails the pending confirmation`() = runTest {
    val barrier = CameraLockConfirmationBarrier(
      cameraSessionId = "camera-session",
      minimumFrameTimestampNanos = null,
      expectedAeLocked = true,
      expectedAwbLocked = null,
    )
    val interruption = IllegalStateException("camera closed")

    barrier.fail(interruption)

    val failure = runCatching { barrier.await() }.exceptionOrNull()
    assertTrue(failure is IllegalStateException && failure.message == "camera closed")
  }

  private fun metadata(timestampNanos: Long, aeLocked: Boolean?, awbLocked: Boolean?) = CameraFrameMetadata(
    timestampElapsedNanos = timestampNanos + 1L,
    timestampFrameNanos = timestampNanos,
    timestampSystemNanos = timestampNanos + 2L,
    exposureTimeNanos = 0L,
    durationTimeNanos = 0L,
    rollingShutterSkewTimeNanos = 0L,
    iso = 0,
    whiteBalanceMode = 0,
    aeLocked = aeLocked,
    awbLocked = awbLocked,
  )
}
