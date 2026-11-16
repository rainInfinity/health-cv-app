/** 用真实会话与 CSV 消费者验证血压窗口、准入撤销及本轮关闭。 */
package com.healthcvapp.acquisition.ppg.bloodpressure

import com.healthcvapp.acquisition.ppg.fingertip.*
import com.healthcvapp.acquisition.ppg.model.PPGCaptureRecord
import com.healthcvapp.acquisition.ppg.session.PPGCaptureFailure
import com.healthcvapp.acquisition.ppg.session.PPGCaptureSession
import com.healthcvapp.acquisition.sensors.model.*
import com.healthcvapp.acquisition.sensors.runtime.SensorController
import com.healthcvapp.acquisition.sensors.session.*
import com.healthcvapp.acquisition.sensors.source.*
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

class BloodPressureControllerTest {
  @Test fun coverageReadinessDoesNotSaveAndStableTiltStartsWithoutActionHistory() = runTest {
    val rig = Rig(this)
    val id = rig.controller.start("owner", 30_000)
    rig.drive(3_100, emitImu = false)
    assertEquals("awaiting_chest", rig.snapshot().capture.phase)
    assertEquals(30_000.0, rig.snapshot().capture.remainingMillis, 0.0)
    assertNull(rig.snapshot().capture.windowStart)
    assertTrue(rig.csvFiles().isEmpty())
    rig.untilCapturing()
    assertTrue(rig.snapshot().imu.tiltDegrees!! >= 30)
    assertTrue(rig.snapshot().imu.stable == true)
    assertEquals(1, rig.host.prepares)
    assertTrue(rig.host.blockedDuringActivation)
    assertNull(rig.controller.stop("external", id))
    assertEquals("capturing", rig.snapshot().capture.phase)
    rig.controller.stop("owner", id)
    rig.root.deleteRecursively()
  }

  @Test fun nativeDeadlineFinalizesSameRoundThreeFilesWithoutSubscribersOrPreparationHistory() = runTest {
    val rig = Rig(this)
    rig.controller.start("owner", 800)
    rig.untilCapturing()
    val start = rig.snapshot().capture.windowStart!!
    rig.drive(1_000)
    val done = rig.snapshot()
    assertEquals("completed", done.capture.phase)
    assertEquals("duration_reached", done.capture.endReason)
    assertEquals(start + 800 * MS, done.capture.windowEnd)
    assertEquals(done.capture.windowEnd, done.stoppedAt)
    assertTrue(done.capture.resourcesReleased)
    assertTrue(done.receivedAccCount > 0)
    assertTrue(done.capture.receivedFrameCount > 0)
    assertEquals(done.accSessionId, done.accArtifact!!.sessionId)
    val acc = File(done.accArtifact.path).readLines()
    assertEquals("timestamp,timestampEvent,timestampSystem,accX,accY,accZ", acc.first())
    assertEquals(done.receivedAccCount.toInt() + 1, acc.size)
    for (row in acc.drop(1)) {
      val fields = row.split(',')
      val received = fields[0].toDouble() * MS
      val event = fields[1].toDouble() * MS
      assertTrue(received >= start && received < done.capture.windowEnd!!)
      assertTrue(event >= start && event < done.capture.windowEnd!!)
      assertEquals(6.934, fields[3].toDouble(), 0.001)
      assertEquals(6.934, fields[5].toDouble(), 0.001)
    }
    val ppg = done.capture.artifact!!.files.first { it.path.endsWith("ppg.csv") }
    val frame = done.capture.artifact.files.first { it.path.endsWith("frame.csv") }
    assertEquals(done.capture.receivedFrameCount.toInt() + 1, File(ppg.path).readLines().size)
    assertEquals(done.capture.receivedFrameCount.toInt() + 1, File(frame.path).readLines().size)
    assertFalse(rig.sensors.adapters.values.any { it.callback != null })
    rig.root.deleteRecursively()
  }

  @Test fun coverageLostDuringPreparationDiscardsWritersAndRebuildsImuReadiness() = runTest {
    val rig = Rig(this)
    rig.host.preparation = CompletableDeferred()
    val id = rig.controller.start("owner", 30_000)
    rig.drive(7_000)
    assertEquals("starting", rig.snapshot().capture.phase)
    assertEquals(-1L, rig.host.session!!.beginFrame(rig.now()))
    val oldAcc = rig.snapshot().accSessionId
    rig.controller.onCoverage(FingertipCoverage(50.0, FingertipCoverage.State.PARTIAL), rig.now())
    rig.host.preparation!!.complete(Unit)
    runCurrent()
    assertEquals("observing_finger", rig.snapshot().capture.phase)
    assertNull(rig.snapshot().capture.artifact)
    assertNull(rig.snapshot().accArtifact)
    assertTrue(rig.csvFiles().isEmpty())
    assertEquals(1, rig.host.discards)
    rig.host.preparation = null
    rig.drive(3_100, emitImu = false)
    assertEquals("awaiting_chest", rig.snapshot().capture.phase)
    assertNotEquals(oldAcc, rig.snapshot().accSessionId)
    assertFalse(rig.snapshot().imu.admitted)
    rig.controller.stop("owner", id)
    rig.root.deleteRecursively()
  }

  @Test fun closeIntentCancelsQueuedStartAndOldStopCannotAffectNewRound() = runTest {
    val rig = Rig(this)
    val first = rig.controller.start("owner", 30_000)
    rig.drive(3_100)
    rig.mutex.lock()
    rig.drive(4_000)
    assertEquals("starting", rig.snapshot().capture.phase)
    rig.controller.requestEnd("owner", first)
    val close = async { rig.controller.stop("owner", first) }
    runCurrent()
    rig.mutex.unlock()
    runCurrent()
    assertTrue(close.await()!!.resourcesReleased)
    assertEquals(0, rig.host.prepares)
    val next = rig.controller.start("owner", 30_000)
    rig.controller.stop("owner", first)
    rig.drive(100, emitImu = false)
    assertEquals(next, rig.snapshot().capture.captureId)
    assertEquals("observing_finger", rig.snapshot().capture.phase)
    rig.controller.stop("owner", next)
    rig.root.deleteRecursively()
  }

  @Test fun continuousImuObservationDoesNotResetFormalClockWhenStabilityOrCandidateDisappears() = runTest {
    val rig = Rig(this)
    val id = rig.controller.start("owner", 30_000)
    rig.untilCapturing()
    val end = rig.snapshot().capture.windowEnd
    rig.drive(6_000, motion = true)
    val ongoing = rig.snapshot()
    assertEquals("capturing", ongoing.capture.phase)
    assertEquals(end, ongoing.capture.windowEnd)
    assertFalse(ongoing.imu.stable == true)
    assertEquals(false, ongoing.imu.scgCandidate)
    rig.controller.stop("owner", id)
    rig.root.deleteRecursively()
  }

  @Test fun coverageLossAndBackgroundCloseBothSourcesWithoutAutomaticResume() = runTest {
    for (background in listOf(false, true)) {
      val rig = Rig(this)
      val id = rig.controller.start("owner", 30_000)
      rig.untilCapturing()
      rig.drive(100)
      if (background) rig.controller.stop("owner", id, "app_background")
      else { advanceTimeBy(1_500); runCurrent() }
      val closed = rig.snapshot()
      assertEquals("interrupted", closed.capture.phase)
      assertEquals(if (background) "app_background" else "coverage_lost", closed.capture.endReason)
      assertTrue(closed.capture.resourcesReleased)
      assertNotNull(closed.accArtifact)
      rig.drive(3_000)
      assertEquals("interrupted", rig.snapshot().capture.phase)
      rig.root.deleteRecursively()
    }
  }

  @Test fun partialFilesSurviveResourceFailureAndExplicitCloseRetriesOnlyCurrentResources() = runTest {
    val rig = Rig(this)
    val id = rig.controller.start("owner", 30_000)
    rig.untilCapturing()
    rig.drive(100)
    rig.host.closeFails = true
    val failed = rig.controller.stop("owner", id)!!
    assertFalse(failed.resourcesReleased)
    val files = rig.snapshot()
    assertNotNull(files.capture.artifact)
    assertNotNull(files.accArtifact)
    rig.host.closeFails = false
    val closed = rig.controller.stop("owner", id)!!
    assertTrue(closed.resourcesReleased)
    assertEquals(files.accArtifact, rig.snapshot().accArtifact)
    assertEquals(files.capture.artifact, rig.snapshot().capture.artifact)
    assertEquals(2, rig.host.finishes)
    rig.root.deleteRecursively()
  }

  @Test fun sourceFailureCascadesOnlyWithinRoundAndNeverCompletesFromOtherFiles() = runTest {
    val rig = Rig(this)
    val independent = rig.sensors.controllers.getValue(SensorKind.MAGNETOMETER)
    independent.startCapture("external", "mag-session", 20_000.0)
    val id = rig.controller.start("owner", 30_000)
    rig.untilCapturing()
    rig.drive(100)
    rig.controller.fail("FILE_WRITE_FAILED", "受控源写入失败。")
    runCurrent()
    assertEquals("failed", rig.snapshot().capture.phase)
    assertTrue(rig.snapshot().capture.resourcesReleased)
    assertNotNull(rig.sensors.adapters.getValue(SensorKind.MAGNETOMETER).callback)
    val next = rig.controller.start("owner", 30_000)
    assertNull(rig.snapshot().accArtifact)
    assertNull(rig.snapshot().capture.artifact)
    rig.controller.stop("owner", id)
    assertEquals(next, rig.snapshot().capture.captureId)
    rig.controller.stop("owner", next)
    rig.sensors.adapters.getValue(SensorKind.MAGNETOMETER).emit(rig.now(), floatArrayOf(1f, 2f, 3f))
    independent.stopCapture("external", "mag-session")
    rig.root.deleteRecursively()
  }

  /** 只有硬件输入被受控替代，会话、文件和所有权仍走真实实现。 */
  private class Rig(private val scope: TestScope) {
    val root = Files.createTempDirectory("bp-controller").toFile()
    val dispatcher = StandardTestDispatcher(scope.testScheduler)
    val mutex = Mutex()
    val sensors = Sensors(root, dispatcher, ::now)
    val host = Host(root, dispatcher)
    val controller = BloodPressureController(scope.backgroundScope, mutex, host, sensors, ::now)
    fun now() = BASE + scope.testScheduler.currentTime * MS
    fun snapshot() = controller.snapshot("owner")!!
    fun csvFiles() = root.walkTopDown().filter { it.isFile && it.extension == "csv" }.toList()

    suspend fun untilCapturing() {
      repeat(2_000) {
        if (snapshot().capture.phase == "capturing") return
        drive(5)
      }
      error("真实准入在受控稳定输入下未建立：${snapshot()}")
    }

    suspend fun drive(millis: Int, emitImu: Boolean = true, motion: Boolean = false) {
      repeat(millis / 5) {
        scope.advanceTimeBy(5)
        val now = now()
        if (scope.testScheduler.currentTime % 100L == 0L || snapshot().capture.phase == "observing_finger") {
          controller.onCoverage(FULL, now)
        }
        if (emitImu) {
          sensors.adapters.getValue(SensorKind.ACCELEROMETER).emit(now, floatArrayOf(6.934f, 0f, 6.934f))
          if (scope.testScheduler.currentTime % 20L == 0L) {
            sensors.adapters.getValue(SensorKind.GYROSCOPE).emit(now, floatArrayOf(if (motion) 1f else 0f, 0f, 0f))
          }
        }
        if (scope.testScheduler.currentTime % 50L == 0L) host.frame(now)
        scope.runCurrent()
      }
    }
  }

  /** 按类型使用真实控制器，确保非所有者与组外隔离不是测试替身的假设。 */
  private class Sensors(root: File, dispatcher: TestDispatcher, now: () -> Long) : BloodPressureSensors {
    val adapters = SensorKind.entries.associateWith { Adapter() }
    val clock = object : SensorCaptureClock {
      override fun elapsedRealtimeNanos() = now()
      override fun nanoTime() = now() + BASE
    }
    val controllers = SensorKind.entries.associateWith { kind -> SensorController(kind, root,
      AndroidSensorSource(adapters.getValue(kind)), { true }, dispatcher, clock, dispatcher, dispatcher) }
    override suspend fun reserve(kind: SensorKind, owner: String, id: String, intervalMicros: Int,
      onSample: (SensorSample) -> Unit, onFailure: (SensorCaptureFailure) -> Unit) =
      controllers.getValue(kind).reserve(owner, id, SensorConfig.fromRequest(kind.wireName, intervalMicros.toDouble()), onSample, onFailure)
    override suspend fun release(kind: SensorKind, owner: String, id: String) = controllers.getValue(kind).release(owner, id)
    override fun isReserved(kind: SensorKind, owner: String, id: String) = controllers.getValue(kind).isReserved(owner, id)
  }

  /** 有限同步设备来源，取消后不再产生新事件。 */
  private class Adapter : SensorDeviceAdapter {
    var callback: SensorEventCallback? = null
    override fun getDefaultSensor(androidType: Int) = SensorDevice(Any(), "bp-test", 0)
    override fun registerListener(device: SensorDevice, samplingPeriodMicros: Int, callback: SensorEventCallback): Boolean {
      this.callback = callback
      return true
    }
    override fun unregisterListener(device: SensorDevice, callback: SensorEventCallback) { if (this.callback === callback) this.callback = null }
    fun emit(now: Long, values: FloatArray) { callback?.invoke(now, values) }
  }

  /** PPG writer、配对和文件真实运行，硬件锁与相机释放可受控阻塞。 */
  private class Host(private val root: File, private val dispatcher: TestDispatcher) : FingertipHost {
    var session: PPGCaptureSession? = null
    var preparation: CompletableDeferred<Unit>? = null
    var prepares = 0
    var discards = 0
    var finishes = 0
    var closeFails = false
    var blockedDuringActivation = false
    override fun configuration(ownerId: String) = fingertipConfiguration().takeIf { ownerId == "owner" }
    override suspend fun prepare(onRecord: (PPGCaptureRecord) -> Unit, onFailure: (PPGCaptureFailure) -> Unit): PPGCaptureSession {
      prepares++
      return PPGCaptureSession(root, ioDispatcher = dispatcher, consumerDispatcher = dispatcher,
        onFailure = onFailure, onAcceptedRecord = onRecord).also {
        session = it
        it.prepare()
        preparation?.await()
      }
    }
    override fun activate(session: PPGCaptureSession, start: Long, end: Long) {
      session.openWindow(start, end, maximumFrameGapNanos = FingertipSignalConfig.COVERAGE_LOSS_NANOS)
      blockedDuringActivation = session.beginFrame(start) == -1L
    }
    override suspend fun discard(session: PPGCaptureSession) { session.discardPrepared(); discards++ }
    override suspend fun finish(session: PPGCaptureSession?): FingertipFinishResult {
      finishes++
      var artifact: com.healthcvapp.acquisition.ppg.model.PPGArtifact? = null
      var fileError: PPGCaptureFailure? = null
      try {
        if (session?.hasFormalWindow == true) artifact = session.stop(100_000, fingertipConfiguration())
        else session?.discardPrepared()
      } catch (error: Throwable) { fileError = error as? PPGCaptureFailure ?: throw error }
      val resource = if (closeFails) PPGCaptureFailure("CAMERA_CLOSE_FAILED", "受控资源释放失败。") else null
      return FingertipFinishResult(artifact, fileError, resource, resource == null)
    }
    fun frame(now: Long) {
      val current = session ?: return
      val index = current.beginFrame(now)
      if (index < 0) return
      val sensorTime = now + BASE
      current.offerPpgFrame(fingertipRecord(index, sensorTime), sensorTime)
      current.offerCaptureMetadata(fingertipMetadata(sensorTime))
    }
  }

  private companion object {
    const val MS = 1_000_000L
    const val BASE = 10_000_000_000L
    val FULL = FingertipCoverage(100.0, FingertipCoverage.State.COMPLETE)
  }
}
