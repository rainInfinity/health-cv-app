/** 以真实 PPG 会话和双 CSV 消费者验证原生轮次，而不是断言实现源码。 */
package com.healthcvapp.acquisition.ppg.fingertip

import com.healthcvapp.acquisition.ppg.model.PPGCaptureRecord
import com.healthcvapp.acquisition.ppg.output.PPGSessionOutput
import com.healthcvapp.acquisition.ppg.output.PPGCsvEncoder
import com.healthcvapp.acquisition.ppg.session.PPGCaptureFailure
import com.healthcvapp.acquisition.ppg.session.PPGCaptureSession
import com.healthcvapp.acquisition.storage.AcquisitionFileStore
import com.healthcvapp.acquisition.storage.csv.BatchWriter
import com.healthcvapp.acquisition.storage.csv.BatchWriterFactory
import com.healthcvapp.acquisition.storage.csv.CsvBatchWriter
import java.nio.file.Files
import kotlin.math.sin
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

class FingertipControllerTest {
  private val full = FingertipCoverage(100.0, FingertipCoverage.State.COMPLETE)
  private val partial = FingertipCoverage(50.0, FingertipCoverage.State.PARTIAL)

  @Test fun preparationFramesExcludedAndCoverageInvalidationReturnsToSameObservation() = runTest {
    val host = Host(StandardTestDispatcher(testScheduler))
    host.preparation = CompletableDeferred()
    val controller = controller(host)
    val id = controller.start("owner", 30_000)
    stable(controller)
    assertEquals("starting", controller.snapshot("owner")!!.phase)
    assertEquals(-1L, host.session!!.beginFrame(now()))
    controller.onCoverage(partial, now())
    host.preparation!!.complete(Unit)
    runCurrent()
    val snapshot = controller.snapshot("owner")!!
    assertEquals(id, snapshot.captureId)
    assertEquals("observing", snapshot.phase)
    assertNull(snapshot.windowStart)
    assertNull(snapshot.artifact)
    assertEquals(1, host.discards)
    controller.stop("owner", id)
    host.root.deleteRecursively()
  }

  @Test fun closeIntentBeforeMutexPreventsQueuedAutomaticStartAndDoesNotStopOtherOwnerOrOldCapture() = runTest {
    val host = Host(StandardTestDispatcher(testScheduler))
    val mutex = Mutex()
    val controller = controller(host, mutex)
    val first = controller.start("owner", 30_000)
    mutex.lock()
    stable(controller)
    controller.requestEnd("external", first)
    assertEquals("starting", controller.snapshot("owner")!!.phase)
    controller.requestEnd("owner", first)
    val stopped = async { controller.stop("owner", first) }
    runCurrent()
    mutex.unlock()
    runCurrent()
    stopped.await()
    assertEquals(0, host.prepares)
    assertEquals("interrupted", controller.snapshot("owner")!!.phase)
    val second = controller.start("owner", 30_000)
    controller.stop("owner", first)
    assertEquals(second, controller.snapshot("owner")!!.captureId)
    assertEquals("observing", controller.snapshot("owner")!!.phase)
    controller.stop("owner", second)
    host.root.deleteRecursively()
  }

  @Test fun nativeDeadlineWithoutSubscribersCompletesFilesAndOldDeadlineCannotStopNewRound() = runTest {
    val host = Host(StandardTestDispatcher(testScheduler))
    val controller = controller(host)
    val first = controller.start("owner", 600)
    stable(controller)
    assertEquals(3000 * MS, controller.snapshot("owner")!!.windowStart)
    repeat(12) { advanceTimeBy(50); controller.onCoverage(full, now()); host.frame(now()); runCurrent() }
    val completed = controller.snapshot("owner")!!
    assertEquals("completed", completed.phase)
    assertEquals("duration_reached", completed.endReason)
    assertEquals(3600 * MS, completed.windowEnd)
    assertEquals(600.0, completed.elapsedMillis, 0.0)
    assertEquals(0.0, completed.remainingMillis, 0.0)
    assertTrue(completed.receivedFrameCount > 0)
    assertTrue(completed.resourcesReleased)
    assertEquals(2, completed.artifact!!.files.size)
    assertTrue(completed.artifact.files.all { java.io.File(it.path).isFile })
    val second = controller.start("owner", 30_000)
    advanceTimeBy(1000); runCurrent()
    assertEquals(second, controller.snapshot("owner")!!.captureId)
    assertEquals("observing", controller.snapshot("owner")!!.phase)
    controller.stop("owner", first)
    assertEquals("observing", controller.snapshot("owner")!!.phase)
    controller.stop("owner", second)
    host.root.deleteRecursively()
  }

  @Test fun noFrameTimesOutAt1500MillisWithoutResumingAfterTermination() = runTest {
    val host = Host(StandardTestDispatcher(testScheduler))
    val controller = controller(host)
    controller.start("owner", 30_000)
    stable(controller)
    host.frame(now())
    advanceTimeBy(1499); runCurrent()
    assertEquals("capturing", controller.snapshot("owner")!!.phase)
    assertEquals(FingertipCoverage.UNKNOWN, controller.snapshot("owner")!!.coverage)
    advanceTimeBy(1); runCurrent()
    val stale = controller.snapshot("owner")!!
    assertEquals("interrupted", stale.phase)
    assertEquals("coverage_lost", stale.endReason)
    assertEquals(4500 * MS, stale.windowEnd)
    assertNotNull(stale.artifact)
    controller.onCoverage(full, now())
    assertEquals("interrupted", controller.snapshot("owner")!!.phase)
    host.root.deleteRecursively()
  }

  @Test fun shortLowCoverageAndFrameGapRecoverWithoutExtendingNativeDeadline() = runTest {
    val host = Host(StandardTestDispatcher(testScheduler))
    val controller = controller(host)
    val id = controller.start("owner", 30_000)
    stable(controller)
    val end = controller.snapshot("owner")!!.windowEnd
    repeat(8) {
      advanceTimeBy(100)
      controller.onCoverage(partial, now())
      host.frame(now(), partial.usable)
      runCurrent()
    }
    assertEquals("capturing", controller.snapshot("owner")!!.phase)
    val nearlyFull = FingertipCoverage(95.0, FingertipCoverage.State.PARTIAL)
    advanceTimeBy(1)
    controller.onCoverage(nearlyFull, now())
    host.frame(now(), nearlyFull.usable)
    runCurrent()
    advanceTimeBy(1000); runCurrent()
    assertEquals("capturing", controller.snapshot("owner")!!.phase)
    controller.onCoverage(nearlyFull, now())
    host.frame(now(), nearlyFull.usable)
    runCurrent()
    assertEquals(10L, controller.snapshot("owner")!!.receivedFrameCount)
    assertEquals(end, controller.snapshot("owner")!!.windowEnd)
    repeat(10) {
      advanceTimeBy(100)
      controller.onCoverage(nearlyFull, now())
      host.frame(now(), nearlyFull.usable)
      runCurrent()
    }
    assertEquals("capturing", controller.snapshot("owner")!!.phase)
    controller.stop("owner", id)
    host.root.deleteRecursively()
  }

  @Test fun continuousLowOrUnknownCoverageEndsAt1500MillisDespiteFreshFrames() = runTest {
    for (coverage in listOf(partial, FingertipCoverage.UNKNOWN)) {
      val host = Host(StandardTestDispatcher(testScheduler))
      val controller = controller(host)
      controller.start("owner", 30_000)
      stable(controller)
      val lostAt = now()
      controller.onCoverage(coverage, now())
      host.frame(now(), coverage.usable)
      runCurrent()
      repeat(14) {
        advanceTimeBy(100)
        controller.onCoverage(coverage, now())
        host.frame(now(), coverage.usable)
        runCurrent()
      }
      assertEquals("capturing", controller.snapshot("owner")!!.phase)
      advanceTimeBy(100)
      // 即使恢复帧先于本次定时器执行，到期也不得复活。
      controller.onCoverage(full, now())
      runCurrent()
      val stopped = controller.snapshot("owner")!!
      assertEquals("interrupted", stopped.phase)
      assertEquals("coverage_lost", stopped.endReason)
      assertEquals(lostAt + 1500 * MS, stopped.windowEnd)
      host.root.deleteRecursively()
    }
  }

  @Test fun nativeDeadlineStillWinsDuringNoFrameGrace() = runTest {
    val host = Host(StandardTestDispatcher(testScheduler))
    val controller = controller(host)
    controller.start("owner", 600)
    stable(controller)
    host.frame(now())
    advanceTimeBy(600); runCurrent()
    val completed = controller.snapshot("owner")!!
    assertEquals("completed", completed.phase)
    assertEquals("duration_reached", completed.endReason)
    assertEquals(3600 * MS, completed.windowEnd)
    assertEquals(600.0, completed.elapsedMillis, 0.0)
    host.root.deleteRecursively()
  }

  @Test fun terminalWaitsForRealWriterTailAndResourceFailureCanBeRetriedWithoutLosingFiles() = runTest {
    val host = Host(StandardTestDispatcher(testScheduler))
    host.writeGate = CompletableDeferred()
    host.resourceFailure = true
    val controller = controller(host)
    val batches = ArrayList<FingertipPulseBatchData>()
    val subscription = controller.pulseHub.addListener(batches::add)
    val id = controller.start("owner", 30_000)
    stable(controller)
    repeat(30) { advanceTimeBy(50); controller.onCoverage(full, now()); host.frame(now()); runCurrent() }
    controller.pulseHub.removeListener(subscription)
    val stop = async { controller.stop("owner", id) }
    val concurrentStop = async { controller.stop("owner", id) }
    runCurrent()
    assertFalse(stop.isCompleted)
    assertTrue(host.enteredWrite.isCompleted)
    assertEquals("stopping", controller.snapshot("owner")!!.phase)
    assertNull(controller.snapshot("owner")!!.artifact)
    host.writeGate!!.complete(Unit)
    runCurrent()
    assertEquals("CAMERA_CLOSE_FAILED", stop.await()!!.resourceFailure!!.code)
    assertEquals("CAMERA_CLOSE_FAILED", concurrentStop.await()!!.resourceFailure!!.code)
    assertEquals(1, host.finishes)
    val failed = controller.snapshot("owner")!!
    assertEquals("failed", failed.phase)
    assertFalse(failed.resourcesReleased)
    assertNotNull(failed.artifact)
    val rawLines = java.io.File(failed.artifact!!.files.first().path).readLines().size
    assertEquals(31, rawLines)
    assertTrue(batches.isNotEmpty())
    host.resourceFailure = false
    val retry = controller.stop("owner", id)!!
    assertNull(retry.resourceFailure)
    assertTrue(controller.snapshot("owner")!!.resourcesReleased)
    assertNull(controller.snapshot("owner")!!.errorCode)
    assertEquals(failed.artifact, controller.snapshot("owner")!!.artifact)
    host.root.deleteRecursively()
  }

  @Test fun normalCoverageNotificationsAreCoalescedAt250MillisButStagesAndErrorsAreImmediate() = runTest {
    val host = Host(StandardTestDispatcher(testScheduler))
    val controller = controller(host)
    val id = controller.start("owner", 30_000)
    val received = ArrayList<Long>()
    val listener = controller.addListener("owner") { received.add(testScheduler.currentTime) }
    repeat(35) { advanceTimeBy(10); controller.onCoverage(partial, now()); runCurrent() }
    assertEquals(listOf(0L, 250L), received)
    stable(controller)
    assertEquals(3350L, received.last())
    assertEquals("capturing", controller.snapshot("owner")!!.phase)
    advanceTimeBy(1)
    controller.fail("TEST_FAILURE", "受控技术失败。")
    assertEquals(3351L, received.last())
    runCurrent()
    assertEquals("failed", controller.snapshot("owner")!!.phase)
    controller.removeListener(listener)
    controller.stop("owner", id)
    host.root.deleteRecursively()
  }

  @Test fun closeDuringWriterPreparationNeverOpensAWindowAndKeepsInterruptionNonTechnical() = runTest {
    val host = Host(StandardTestDispatcher(testScheduler))
    host.preparation = CompletableDeferred()
    val controller = controller(host)
    val id = controller.start("owner", 30_000)
    stable(controller)
    assertEquals("starting", controller.snapshot("owner")!!.phase)
    controller.requestEnd("owner", id, "app_background")
    val stop = async { controller.stop("owner", id, "app_background") }
    host.preparation!!.complete(Unit)
    runCurrent()
    stop.await()
    val snapshot = controller.snapshot("owner")!!
    assertEquals("interrupted", snapshot.phase)
    assertEquals("app_background", snapshot.endReason)
    assertNull(snapshot.errorCode)
    assertNull(snapshot.windowStart)
    assertNull(snapshot.artifact)
    assertTrue(snapshot.resourcesReleased)
    assertEquals(1, host.discards)
    host.root.deleteRecursively()
  }

  @Test fun pairedNearlyFullYuvKeepsRealRedPulseWithoutChangingRawCsvOrBatchIdentity() = runTest {
    val host = Host(StandardTestDispatcher(testScheduler))
    host.yuv = { timestamp ->
      val u = 97.0
      val v = 220.0 + 2 * sin(2 * Math.PI * 1.2 * timestamp / 1e9)
      val y = 0.4 + FingertipSignalConfig.GREEN_U * (u - 128) + FingertipSignalConfig.GREEN_V * (v - 128)
      doubleArrayOf(y, u, v)
    }
    val controller = controller(host)
    val batches = ArrayList<FingertipPulseBatchData>()
    val subscription = controller.pulseHub.addListener(batches::add)
    val id = controller.start("owner", 30_000)
    stable(controller)
    val firstFrameTime = now() + 50 * MS
    repeat(120) {
      advanceTimeBy(50)
      val coverage = FingertipCoverage(if (it % 2 == 0) 95.0 else 99.0, FingertipCoverage.State.PARTIAL)
      controller.onCoverage(coverage, now())
      host.frame(now(), coverage.usable)
      runCurrent()
    }
    val result = controller.stop("owner", id)!!
    runCurrent()
    controller.pulseHub.removeListener(subscription)
    val values = batches.flatMap { it.values }
    assertTrue(values.size > 80)
    assertTrue(values.max() > 2.5)
    assertTrue(values.min() < -2.5)
    assertTrue(batches.all { it.captureId == id && it.sessionId == host.session!!.sessionId })
    assertEquals(batches.indices.map(Int::toLong), batches.map { it.sequence })
    assertTrue(batches.first().timesMillis.first() >= 1000)
    val lines = java.io.File(result.artifact!!.files.first { it.path.endsWith("ppg.csv") }.path).readLines()
    assertEquals(121, lines.size)
    val header = lines.first().split(",")
    val first = lines[1].split(",")
    val expected = host.yuv!!(firstFrameTime)
    assertEquals(expected[0], first[header.indexOf("avgY")].toDouble(), 0.0)
    assertEquals(expected[1], first[header.indexOf("avgU")].toDouble(), 0.0)
    assertEquals(expected[2], first[header.indexOf("avgV")].toDouble(), 0.0)
    host.root.deleteRecursively()
  }

  @Test fun invalidAndUnknownPairedSamplesStayInRawCsvButProduceNoPulse() = runTest {
    val host = Host(StandardTestDispatcher(testScheduler))
    val controller = controller(host)
    val batches = ArrayList<FingertipPulseBatchData>()
    val subscription = controller.pulseHub.addListener(batches::add)
    val id = controller.start("owner", 30_000)
    stable(controller)
    repeat(50) {
      advanceTimeBy(50)
      // 覆盖控制仍收到真实恢复帧；配对消费者必须只依赖其各自同帧有效性。
      controller.onCoverage(full, now())
      host.frame(now(), if (it % 2 == 0) false else null)
      runCurrent()
    }
    assertTrue(batches.isEmpty())
    repeat(50) {
      advanceTimeBy(50)
      controller.onCoverage(full, now())
      host.frame(now(), full.usable)
      runCurrent()
    }
    val result = controller.stop("owner", id)!!
    runCurrent()
    controller.pulseHub.removeListener(subscription)
    assertTrue(batches.flatMap { it.values }.isNotEmpty())
    assertTrue(batches.flatMap { it.timesMillis }.all { it >= 3500.0 })
    val lines = java.io.File(result.artifact!!.files.first { it.path.endsWith("ppg.csv") }.path).readLines()
    assertEquals(101, lines.size)
    host.root.deleteRecursively()
  }

  @Test fun missingFramesFollowedByInvalidFramesDoNotRestartLossGrace() = runTest {
    val host = Host(StandardTestDispatcher(testScheduler))
    val controller = controller(host)
    controller.start("owner", 30_000)
    stable(controller)
    host.frame(now())
    advanceTimeBy(1000)
    controller.onCoverage(partial, now())
    host.frame(now(), partial.usable)
    runCurrent()
    repeat(4) {
      advanceTimeBy(100)
      controller.onCoverage(partial, now())
      host.frame(now(), partial.usable)
      runCurrent()
    }
    assertEquals("capturing", controller.snapshot("owner")!!.phase)
    advanceTimeBy(100); runCurrent()
    val stopped = controller.snapshot("owner")!!
    assertEquals("interrupted", stopped.phase)
    assertEquals("coverage_lost", stopped.endReason)
    assertEquals(4500 * MS, stopped.windowEnd)
    host.root.deleteRecursively()
  }

  /** 覆盖稳定过程保持真实新鲜度；此辅助不直接调用自动开始。 */
  private suspend fun TestScope.stable(controller: FingertipController) {
    controller.onCoverage(full, now())
    repeat(30) { advanceTimeBy(100); controller.onCoverage(full, now()); runCurrent() }
  }

  private fun TestScope.now() = testScheduler.currentTime * MS

  private fun TestScope.controller(host: Host, mutex: Mutex = Mutex()) = FingertipController(
    backgroundScope, mutex, host, { now() }, FingertipPulseHub(StandardTestDispatcher(testScheduler)),
  )

  /** 使用真实文件消费者，仅将硬件锁及释放边界换成受控宿主。 */
  private class Host(private val dispatcher: TestDispatcher) : FingertipHost {
    val root = Files.createTempDirectory("fingertip-controller").toFile()
    var session: PPGCaptureSession? = null
    var preparation: CompletableDeferred<Unit>? = null
    var writeGate: CompletableDeferred<Unit>? = null
    val enteredWrite = CompletableDeferred<Unit>()
    var resourceFailure = false
    var prepares = 0
    var discards = 0
    var finishes = 0
    var yuv: ((Long) -> DoubleArray)? = null
    override fun configuration(ownerId: String) = fingertipConfiguration().takeIf { ownerId == "owner" }
    override suspend fun prepare(onRecord: (PPGCaptureRecord) -> Unit, onFailure: (PPGCaptureFailure) -> Unit): PPGCaptureSession {
      prepares++
      val id = "session-$prepares"
      val output = PPGSessionOutput(root, id, ioDispatcher = dispatcher,
        ppgWriterFactory = BatchWriterFactory { file ->
          val writer = CsvBatchWriter(AcquisitionFileStore().createNewOutput(file), PPGCsvEncoder)
          object : BatchWriter<PPGCaptureRecord> {
            override suspend fun writeBatch(records: List<PPGCaptureRecord>) {
              enteredWrite.complete(Unit)
              writeGate?.await()
              writer.writeBatch(records)
            }
            override fun close() = writer.close()
          }
        })
      val created = PPGCaptureSession(root, id, ioDispatcher = dispatcher, consumerDispatcher = dispatcher,
        output = output, onFailure = onFailure, onAcceptedRecord = onRecord)
      session = created
      created.prepare()
      preparation?.await()
      return created
    }
    override fun activate(session: PPGCaptureSession, start: Long, end: Long) {
      session.openWindow(start, end, maximumFrameGapNanos = FingertipSignalConfig.COVERAGE_LOSS_NANOS)
    }
    override suspend fun discard(session: PPGCaptureSession) { session.discardPrepared(); discards++ }
    override suspend fun finish(session: PPGCaptureSession?): FingertipFinishResult {
      finishes++
      val artifact = session?.stop(10_000, fingertipConfiguration())
      val resource = if (resourceFailure) PPGCaptureFailure("CAMERA_CLOSE_FAILED", "受控释放失败。") else null
      return FingertipFinishResult(artifact, null, resource, resource == null)
    }
    fun frame(now: Long, coverageUsable: Boolean? = true) {
      val current = session ?: return
      val index = current.beginFrame(now)
      if (index < 0) return
      val sensorTime = now + 10_000_000_000L
      val record = fingertipRecord(index, sensorTime, 40 + sin(now / 1e8), coverageUsable)
      yuv?.invoke(now)?.copyInto(record.averagesYuv)
      current.offerPpgFrame(record, sensorTime)
      current.offerCaptureMetadata(fingertipMetadata(sensorTime))
    }
  }

  private companion object { const val MS = 1_000_000L }
}
