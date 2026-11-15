/** 验证正式半开窗口与 Nitro 调用方授权的消费者行为。 */
package com.healthcvapp.acquisition.ppg.fingertip

import com.healthcvapp.acquisition.ppg.runtime.PPGCommandOwnership
import com.healthcvapp.acquisition.ppg.session.PPGCaptureSession
import java.nio.file.Files
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class FingertipWindowOwnershipTest {
  @Test fun preparedWriterDoesNotAcceptFramesAndFormalBoundsAreHalfOpen() = runTest {
    val root = Files.createTempDirectory("fingertip-window").toFile()
    val dispatcher = StandardTestDispatcher(testScheduler)
    val session = PPGCaptureSession(root, "bounds", ioDispatcher = dispatcher, consumerDispatcher = dispatcher)
    session.prepare()
    assertEquals(-1L, session.beginFrame(1_000))
    session.openWindow(2_000, 3_000)
    assertEquals(-1L, session.beginFrame(1_999))
    for (time in listOf(2_000L, 2_999L)) {
      val index = session.beginFrame(time)
      assertTrue(index >= 0)
      session.offerPpgFrame(fingertipRecord(index, time), time)
      session.offerCaptureMetadata(fingertipMetadata(time))
    }
    assertEquals(-1L, session.beginFrame(3_000))
    session.sealEntrance()
    assertEquals(-1L, session.beginFrame(2_500))
    val artifact = session.stop(3)
    assertEquals(3, java.io.File(artifact.files.first().path).readLines().size)
    root.deleteRecursively()
  }

  @Test fun formalGapUsesLossGraceButManualPathRemainsUngatedAndUnlimited() = runTest {
    val root = Files.createTempDirectory("fingertip-gap").toFile()
    val dispatcher = StandardTestDispatcher(testScheduler)
    suspend fun create(id: String) = PPGCaptureSession(root, id, ioDispatcher = dispatcher,
      consumerDispatcher = dispatcher).also { it.prepare() }
    val formal = create("formal")
    formal.openWindow(1, 10_000_000_000, maximumFrameGapNanos = FingertipSignalConfig.COVERAGE_LOSS_NANOS)
    val formalTime = 500_000_001L
    val formalIndex = formal.beginFrame(formalTime)
    assertEquals(0L, formalIndex)
    formal.offerPpgFrame(fingertipRecord(formalIndex, formalTime), formalTime)
    formal.offerCaptureMetadata(fingertipMetadata(formalTime))
    assertEquals(-1L, formal.beginFrame(formalTime + FingertipSignalConfig.COVERAGE_LOSS_NANOS))
    assertEquals(-1L, formal.beginFrame(formalTime + FingertipSignalConfig.COVERAGE_LOSS_NANOS + 1))
    formal.stop(2000)
    val manual = create("manual")
    manual.openWindow(1, Long.MAX_VALUE)
    val index = manual.beginFrame(100_000_000_000)
    assertEquals(0L, index)
    manual.offerPpgFrame(fingertipRecord(index, 100), 100)
    manual.offerCaptureMetadata(fingertipMetadata(100))
    manual.stop(100_000)
    root.deleteRecursively()
  }

  @Test fun foreignCloseCannotReleaseOwnerAndCancelledOpenCannotAcquireAfterCloseIntent() {
    val ownership = PPGCommandOwnership()
    val ownerVersion = ownership.beginOpen("owner")
    assertTrue(ownership.acquire("owner", ownerVersion))
    val busyVersion = ownership.beginOpen("busy")
    assertFalse(ownership.acquire("busy", busyVersion))
    ownership.requestClose("busy")
    ownership.release("busy")
    assertTrue(ownership.owns("owner"))
    assertFalse(ownership.owns("busy"))
    ownership.requestClose("owner")
    assertTrue(ownership.owns("owner"))
    ownership.release("owner")
    val pending = ownership.beginOpen("owner")
    ownership.requestClose("owner")
    assertFalse(ownership.acquire("owner", pending))
    val next = ownership.beginOpen("owner")
    assertTrue(ownership.acquire("owner", next))
  }
  @Test fun busyPreviewDetachDoesNotCloseActuallyBoundHost() {
    val registry = com.healthcvapp.acquisition.ppg.runtime.PPGPreviewRegistry<Any>()
    val occupyingHost = Any()
    val busyHost = Any()
    registry.attach(occupyingHost)
    assertSame(occupyingHost, registry.candidate())
    assertTrue(registry.bind(occupyingHost))
    registry.attach(busyHost)
    assertSame(busyHost, registry.candidate())
    assertFalse(registry.detach(busyHost))
    assertSame(occupyingHost, registry.candidate())
    assertTrue(registry.detach(occupyingHost))
    assertFalse(registry.bind(occupyingHost))
  }
}
