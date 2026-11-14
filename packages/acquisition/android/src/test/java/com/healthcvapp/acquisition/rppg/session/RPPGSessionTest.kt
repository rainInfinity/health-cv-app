/** 验证主动与被动会话共用预览隔离、边界计时、超时和正式结果收尾。 */

package com.healthcvapp.acquisition.rppg.session
import com.healthcvapp.acquisition.camera.model.CameraCapabilityStatus
import com.healthcvapp.acquisition.camera.model.CameraConfig
import com.healthcvapp.acquisition.camera.model.CameraConfigSummary
import com.healthcvapp.acquisition.camera.model.CameraDescriptor
import com.healthcvapp.acquisition.camera.model.CameraExposureConfig
import com.healthcvapp.acquisition.camera.model.CameraExposureMode
import com.healthcvapp.acquisition.camera.model.CameraFacing
import com.healthcvapp.acquisition.camera.model.CameraFocusConfig
import com.healthcvapp.acquisition.camera.model.CameraFocusMode
import com.healthcvapp.acquisition.camera.model.CameraFrameCrop
import com.healthcvapp.acquisition.camera.model.CameraFrameGeometry
import com.healthcvapp.acquisition.camera.model.CameraResolution
import com.healthcvapp.acquisition.camera.model.CameraWhiteBalanceConfig
import com.healthcvapp.acquisition.camera.model.CameraModeCapability
import com.healthcvapp.acquisition.camera.model.CameraWhiteBalanceMode
import com.healthcvapp.acquisition.camera.ownership.CameraUseGuard
import com.healthcvapp.acquisition.pixels.PixelFrameView
import com.healthcvapp.acquisition.rppg.face.FaceReadinessReason
import com.healthcvapp.acquisition.rppg.face.FaceReadinessUpdate
import com.healthcvapp.acquisition.rppg.model.RPPGArtifact
import com.healthcvapp.acquisition.rppg.model.RPPGArtifactFileKind
import com.healthcvapp.acquisition.rppg.model.RPPGConfig
import com.healthcvapp.acquisition.rppg.model.RPPGInstantHeartRate
import com.healthcvapp.acquisition.rppg.model.RPPGSessionDescriptor
import com.healthcvapp.acquisition.rppg.model.RPPGSessionRecord
import com.healthcvapp.acquisition.rppg.model.RPPGSignalStatus
import com.healthcvapp.acquisition.rppg.model.RPPGPulseSample
import com.healthcvapp.acquisition.rppg.model.RPPGTerminationReason
import com.healthcvapp.acquisition.rppg.model.RPPGSessionSource
import com.healthcvapp.acquisition.rppg.output.RPPGArtifactStore
import com.healthcvapp.acquisition.rppg.output.RPPGSessionOutput
import com.healthcvapp.acquisition.rppg.roi.RppgRgbMean
import com.healthcvapp.acquisition.rppg.runtime.RPPGActiveRuntime
import com.healthcvapp.acquisition.rppg.runtime.RPPGActiveSessionFactory
import com.healthcvapp.acquisition.storage.csv.BatchWriterFactory
import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.util.ArrayDeque
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** 覆盖主动会话从预览到正式结果发布的用户可见状态转换。 */
@OptIn(ExperimentalCoroutinesApi::class)
class RPPGSessionTest {

  /** 相机停帧也必须清除逐搏值，之后的旧处理器结果不得使其复活。 */
  @Test
  fun expiresInstantHeartRateWithoutFramesAndClearsItWhenStopped() = runTest {
    val config = fastConfig()
    withFixture(backgroundScope, testScheduler, config = config, updates = listOf(readyFace())) { fixture ->
      fixture.session.openPreview()
      fixture.session.start()
      fixture.camera.emit(10_000_000_000L)
      runCurrent()
      val first = RPPGInstantHeartRate(
        segmentIndex = 0L,
        previousPeakTimestampNanos = 11_000_000_000L,
        peakTimestampNanos = 12_000_000_000L,
        intervalNanos = 1_000_000_000L,
        heartRateBpm = 60.0,
      )
      fixture.processor.latestInstantHeartRate = first
      fixture.camera.emit(12_000_000_000L)
      assertEquals(first, fixture.session.snapshot.latestInstantHeartRate)

      advanceTimeBy(config.beatDetection.resultTimeoutNanos / 1_000_000L + 250L)
      runCurrent()
      assertEquals(RPPGSessionPhase.MEASURING, fixture.session.snapshot.phase)
      assertTrue(fixture.session.snapshot.latestInstantHeartRate == null)
      fixture.camera.emit(12_050_000_000L)
      assertTrue(fixture.session.snapshot.latestInstantHeartRate == null)

      fixture.processor.latestInstantHeartRate = first.copy(
        previousPeakTimestampNanos = 12_000_000_000L,
        peakTimestampNanos = 13_000_000_000L,
      )
      fixture.camera.emit(13_000_000_000L)
      assertEquals(13_000_000_000L, fixture.session.snapshot.latestInstantHeartRate?.peakTimestampNanos)
      val stopped = fixture.session.stop(RPPGTerminationReason.USER_STOP)
      assertTrue(stopped.accepted)
      assertTrue(stopped.snapshot.latestInstantHeartRate == null)
      assertEquals(RPPGSignalStatus.NO_WAVEFORM, stopped.snapshot.signalStatus)
    }
  }

  @Test
  fun keepsAutoFocusWhenFrontCameraSupportsIt() = runTest {
    withFixture(backgroundScope, testScheduler) { fixture ->
      assertTrue(fixture.session.openPreview().accepted)
      assertEquals(CameraFocusMode.AUTO, fixture.camera.previewConfig?.focus?.mode)
    }
  }

  @Test
  fun fallsBackToFixedFocusWhenFrontCameraOnlySupportsOff() = runTest {
    withFixture(backgroundScope, testScheduler) { fixture ->
      fixture.camera.focusModeCapability = CameraModeCapability(
        CameraCapabilityStatus.SUPPORTED,
        listOf(CameraFocusMode.OFF.wireValue),
        emptyList(),
        null,
      )

      assertTrue(fixture.session.openPreview().accepted)
      assertEquals(CameraFocusMode.OFF, fixture.camera.previewConfig?.focus?.mode)
    }
  }

  @Test
  fun preservesAutoRequestWhenFocusCapabilityCannotConfirmFallback() = runTest {
    val unavailableCapabilities = listOf(
      CameraModeCapability(CameraCapabilityStatus.UNKNOWN, null, emptyList(), "AF unavailable"),
      CameraModeCapability(CameraCapabilityStatus.UNSUPPORTED, emptyList(), emptyList(), "AF unsupported"),
    )

    for (focusModeCapability in unavailableCapabilities) {
      val camera = FakeCamera().apply { this.focusModeCapability = focusModeCapability }
      withFixture(backgroundScope, testScheduler, camera = camera) { fixture ->
        assertTrue(fixture.session.openPreview().accepted)
        assertEquals(CameraFocusMode.AUTO, camera.previewConfig?.focus?.mode)
      }
    }
  }
  @Test
  fun analysisOnlySessionPublishesPassiveResultWithoutBindingPreview() = runTest {
    withFixture(
      backgroundScope,
      testScheduler,
      sessionSource = RPPGSessionSource.PASSIVE,
    ) { fixture ->
      val started = fixture.session.startAnalysisOnly("passive-analysis-session")

      assertTrue(started.accepted)
      assertEquals(RPPGSessionPhase.OBSERVING, started.snapshot.phase)
      assertEquals(1, fixture.camera.analysisOnlyOpenCalls)
      assertEquals(null, fixture.camera.previewListener)
      assertEquals(1, fixture.processorCreations.get())

      fixture.camera.emit(10_000_000L)
      val stopped = fixture.session.stop(RPPGTerminationReason.INTERRUPTED)

      assertEquals(RPPGSessionPhase.COMPLETED, stopped.snapshot.phase)
      assertEquals(RPPGTerminationReason.INTERRUPTED, stopped.snapshot.termination)
      assertTrue(fixture.session.resourcesReleased)
      assertPublishedTriplet(
        stopped.snapshot.artifact,
        fixture.root,
        RPPGTerminationReason.INTERRUPTED.wireValue,
        source = RPPGSessionSource.PASSIVE,
      )
      assertTrue(stopped.accepted)
      assertEquals(RPPGSessionSource.PASSIVE, stopped.snapshot.artifact?.source)
      assertEquals(
        RPPGSessionSource.PASSIVE,
        RPPGArtifactStore(fixture.root).listArtifacts(RPPGSessionSource.PASSIVE).single().source,
      )
    }
  }

  /** 首帧前取消相机打开时释放租约且不发布空会话。 */
  @Test
  fun cancellingPassiveOpenBeforeFirstFrameReleasesLeaseWithoutPublishing() = runTest {
    withFixture(
      backgroundScope,
      testScheduler,
      sessionSource = RPPGSessionSource.PASSIVE,
    ) { fixture ->
      val openGate = CompletableDeferred<Unit>()
      fixture.camera.analysisOpenGate = openGate
      val opening = backgroundScope.async {
        fixture.session.startAnalysisOnly("passive-cancel-before-first-frame")
      }
      runCurrent()

      val openingLeaseProbe = CameraUseGuard.tryAcquire("opening-capture-lease")
      assertTrue(openingLeaseProbe == null)
      openingLeaseProbe?.close()
      opening.cancelAndJoin()

      assertTrue(fixture.session.resourcesReleased)
      assertEquals(1, fixture.camera.closeCalls)
      assertTrue(
        RPPGArtifactStore(fixture.root)
          .listArtifacts(RPPGSessionSource.PASSIVE)
          .isEmpty(),
      )
      val replacementLease = checkNotNull(CameraUseGuard.tryAcquire("replacement-capture-lease"))
      replacementLease.close()
    }
  }


  @Test
  fun previewDoesNotLoadProcessorAndStartIgnoresPreviousFrameGeneration() = runTest {
    withFixture(backgroundScope, testScheduler) { fixture ->
      assertFalse(fixture.session.start().accepted)
      val opened = fixture.session.openPreview()
      assertTrue(opened.accepted)
      assertEquals(RPPGSessionPhase.PREVIEW, fixture.session.snapshot.phase)
      assertEquals(0, fixture.processorCreations.get())
      assertTrue(fixture.root.listFiles().isNullOrEmpty())
      assertFalse(fixture.session.openPreview().accepted)
      assertTrue(fixture.session.start().accepted)
      assertEquals(1, fixture.processorCreations.get())
      assertFalse(fixture.session.start().accepted)

      val oldPreviewListener = checkNotNull(fixture.camera.previewListener)
      fixture.camera.emit(4_000_000_000L, oldPreviewListener)
      fixture.camera.emit(7_000_000_000L)
      fixture.camera.emit(7_050_000_000L)
      runCurrent()

      assertEquals(listOf(7_000_000_000L, 7_050_000_000L), fixture.processor.observedTimestamps)
      val result = fixture.session.stop(RPPGTerminationReason.USER_STOP)
      assertTrue(result.accepted)
      assertEquals(RPPGSessionPhase.COMPLETED, result.snapshot.phase)
      assertEquals(RPPGSignalStatus.NO_WAVEFORM, result.snapshot.signalStatus)
      val metadata = artifactFile(result.snapshot.artifact, RPPGArtifactFileKind.SESSION_JSON).readText()
      assertTrue(metadata.contains("\"sensorTimeOriginNs\":\"7000000000\""))

      assertPublishedTriplet(result.snapshot.artifact, fixture.root, RPPGTerminationReason.USER_STOP.wireValue)
    }
  }
  @Test
  fun activeRuntimeOwnsPreviewSubscriptionAndPageLeaveTermination() = runTest {
    val root = Files.createTempDirectory("rppg-active-runtime").toFile()
    val camera = FakeCamera()
    val processor = FakeProcessor(listOf(noFace()))
    val creations = java.util.concurrent.atomic.AtomicInteger()
    val dispatcher = UnconfinedTestDispatcher(testScheduler)
    val runtime = RPPGActiveRuntime(
      sessionFactory = RPPGActiveSessionFactory { sessionScope, onSnapshot ->
        RPPGSession(
          filesDirectory = root,
          config = fastConfig(),
          cameraSourceFactory = { camera },
          processorFactory = RPPGSessionProcessorFactory { _, _ ->
            creations.incrementAndGet()
            processor
          },
          scope = sessionScope,
          clock = TestClock(testScheduler),
          processorDispatcher = dispatcher,
          ioDispatcher = dispatcher,
          recordConsumerDispatcher = dispatcher,
          realtimeDispatcher = dispatcher,
          onSnapshot = onSnapshot,
        )
      },
      parentScope = backgroundScope,
    )
    val subscription = runtime.subscribeRealtime { }
    try {
      assertFalse(runtime.start().accepted)
      assertTrue(runtime.openPreview().accepted)
      assertTrue(root.listFiles().isNullOrEmpty())
      assertTrue(runtime.start().accepted)
      assertEquals(1, creations.get())
      camera.emit(30_000_000_000L)
      runCurrent()

      val result = runtime.close()
      assertTrue(result.accepted)
      assertEquals(RPPGSessionPhase.CLOSED, runtime.snapshot.phase)
      assertEquals(RPPGTerminationReason.PAGE_LEFT, runtime.snapshot.termination)
      assertNotNull(runtime.snapshot.artifact)
      assertPublishedTriplet(
        runtime.snapshot.artifact,
        root,
        RPPGTerminationReason.PAGE_LEFT.wireValue,
      )
      assertFalse(runtime.start().accepted)
    } finally {
      subscription.close()
      runtime.close()
      root.deleteRecursively()
    }
  }

  @Test
  fun realtimeSubscriptionFollowsReplacementSessions() = runTest {
    val root = Files.createTempDirectory("rppg-realtime-replacement").toFile()
    val cameras = mutableListOf<FakeCamera>()
    val deliveredSessionIds = mutableListOf<String>()
    val dispatcher = UnconfinedTestDispatcher(testScheduler)
    val runtime = RPPGActiveRuntime(
      sessionFactory = RPPGActiveSessionFactory { sessionScope, onSnapshot ->
        val camera = FakeCamera()
        cameras.add(camera)
        RPPGSession(
          filesDirectory = root,
          config = fastConfig(),
          cameraSourceFactory = { camera },
          processorFactory = RPPGSessionProcessorFactory { _, _ ->
            FakeProcessor(listOf(readyFace()), emitPulseSamples = true)
          },
          scope = sessionScope,
          clock = TestClock(testScheduler),
          processorDispatcher = dispatcher,
          ioDispatcher = dispatcher,
          recordConsumerDispatcher = dispatcher,
          realtimeDispatcher = dispatcher,
          onSnapshot = onSnapshot,
        )
      },
      parentScope = backgroundScope,
    )
    val subscription = runtime.subscribeRealtime { batch ->
      deliveredSessionIds.add(batch.sessionId)
    }
    val expectedSessionIds = mutableListOf<String>()
    try {
      repeat(2) { sessionIndex ->
        assertTrue(runtime.openPreview().accepted)
        assertTrue(runtime.start().accepted)
        expectedSessionIds.add(checkNotNull(runtime.snapshot.sessionId))
        val frameOriginNanos = 30_000_000_000L + sessionIndex * 1_000_000_000L
        cameras.last().emit(frameOriginNanos)
        runCurrent()
        cameras.last().emit(frameOriginNanos + 50_000_000L)
        runCurrent()
        val result = runtime.stop()
        assertTrue(result.accepted)
        assertEquals(
          3,
          artifactFile(result.snapshot.artifact, RPPGArtifactFileKind.PULSE).readLines().size,
        )
        runCurrent()
      }

      assertEquals(expectedSessionIds, deliveredSessionIds.distinct())
    } finally {
      subscription.close()
      runtime.close()
      root.deleteRecursively()
    }
  }

  /** 宿主暂停必须发布真实后台原因、完整产物并释放相机，不能只冻结页面计时。 */
  @Test
  fun hostPauseStopsActiveRuntimeWithBackgroundReason() = runTest {
    withFixture(backgroundScope, testScheduler, updates = listOf(readyFace())) { fixture ->
      val runtime = RPPGActiveRuntime(
        sessionFactory = RPPGActiveSessionFactory { _, _ -> fixture.session },
        parentScope = backgroundScope,
      )
      try {
        assertTrue(runtime.openPreview().accepted)
        assertTrue(runtime.start().accepted)
        fixture.camera.emit(40_000_000_000L)
        runCurrent()
        assertEquals(RPPGSessionPhase.MEASURING, runtime.snapshot.phase)

        val stopping = checkNotNull(runtime.onHostPause())
        runCurrent()
        stopping.join()
        assertEquals(RPPGSessionPhase.COMPLETED, runtime.snapshot.phase)
        assertEquals(RPPGTerminationReason.APP_BACKGROUND, runtime.snapshot.termination)
        assertTrue(fixture.session.resourcesReleased)
        assertPublishedTriplet(runtime.snapshot.artifact, fixture.root, RPPGTerminationReason.APP_BACKGROUND.wireValue)
        val lease = checkNotNull(CameraUseGuard.tryAcquire("after-host-pause"))
        lease.close()
      } finally {
        runtime.close()
      }
    }
  }

  /** 宿主销毁关闭本 runtime 并保存离页原因，之后的命令不能恢复旧会话。 */
  @Test
  fun hostDestroyClosesActiveRuntimeAndReleasesOwnership() = runTest {
    withFixture(backgroundScope, testScheduler, updates = listOf(readyFace())) { fixture ->
      val runtime = RPPGActiveRuntime(
        sessionFactory = RPPGActiveSessionFactory { _, _ -> fixture.session },
        parentScope = backgroundScope,
      )
      try {
        assertTrue(runtime.openPreview().accepted)
        assertTrue(runtime.start().accepted)
        fixture.camera.emit(41_000_000_000L)
        runCurrent()

        val closing = checkNotNull(runtime.onHostDestroy())
        runCurrent()
        closing.join()
        assertEquals(RPPGSessionPhase.CLOSED, runtime.snapshot.phase)
        assertEquals(RPPGTerminationReason.PAGE_LEFT, runtime.snapshot.termination)
        assertTrue(fixture.session.resourcesReleased)
        assertFalse(runtime.start().accepted)
        assertPublishedTriplet(runtime.snapshot.artifact, fixture.root, RPPGTerminationReason.PAGE_LEFT.wireValue)
        val lease = checkNotNull(CameraUseGuard.tryAcquire("after-host-destroy"))
        lease.close()
      } finally {
        runtime.close()
      }
    }
  }


  @Test
  fun readyFrameStartsFreshMeasurementAndTargetDurationIsNotExtendedByMissingFace() = runTest {
    withFixture(
      scope = backgroundScope,
      scheduler = testScheduler,
      config = fastConfig(targetDurationNanos = 100_000_000L),
      updates = listOf(noFace(), readyFace(), noFace()),
    ) { fixture ->
      fixture.session.openPreview()
      fixture.session.start()
      fixture.camera.emit(10_000_000_000L)
      runCurrent()
      fixture.camera.emit(10_050_000_000L)
      assertEquals(RPPGSessionPhase.MEASURING, fixture.session.snapshot.phase)
      assertEquals(listOf(10_050_000_000L), fixture.processor.acceptedTimestamps)
      val measurementStart = fixture.session.snapshot.measurementStartedAtElapsedNanos

      advanceTimeBy(99L)
      runCurrent()
      fixture.camera.emit(10_100_000_000L)
      assertEquals(RPPGSessionPhase.MEASURING, fixture.session.snapshot.phase)
      assertEquals(listOf(10_050_000_000L, 10_100_000_000L), fixture.processor.acceptedTimestamps)
      assertEquals(measurementStart, fixture.session.snapshot.measurementStartedAtElapsedNanos)

      advanceTimeBy(1L)
      runCurrent()
      assertEquals(RPPGSessionPhase.COMPLETED, fixture.session.snapshot.phase)
      assertEquals(RPPGTerminationReason.TARGET_DURATION, fixture.session.snapshot.termination)
      assertEquals(RPPGSignalStatus.NO_WAVEFORM, fixture.session.snapshot.signalStatus)
      assertTrue(fixture.processor.closed)
    }
  }

  @Test
  fun observationTimeoutWithFramesPublishesHeaderOnlyNoWaveformResult() = runTest {
    withFixture(
      scope = backgroundScope,
      scheduler = testScheduler,
      config = fastConfig(observationTimeoutNanos = 100_000_000L),
      updates = listOf(noFace()),
      sessionSource = RPPGSessionSource.PASSIVE,
    ) { fixture ->
      fixture.session.openPreview()
      fixture.session.start()
      fixture.camera.emit(20_000_000_000L)
      runCurrent()
      advanceTimeBy(100L)
      runCurrent()

      val state = fixture.session.snapshot
      assertEquals(RPPGSessionPhase.COMPLETED, state.phase)
      assertEquals(RPPGTerminationReason.OBSERVATION_TIMEOUT, state.termination)
      assertEquals(RPPGSignalStatus.NO_WAVEFORM, state.signalStatus)
      val pulseFile = artifactFile(state.artifact, RPPGArtifactFileKind.PULSE)
      val heartRateFile = artifactFile(state.artifact, RPPGArtifactFileKind.HEART_RATE)
      assertEquals(1, pulseFile.readLines().size)
      assertEquals(1, heartRateFile.readLines().size)
      assertPublishedTriplet(
        state.artifact,
        fixture.root,
        RPPGTerminationReason.OBSERVATION_TIMEOUT.wireValue,
        source = RPPGSessionSource.PASSIVE,
      )
      val sessionJson = artifactFile(state.artifact, RPPGArtifactFileKind.SESSION_JSON).readText()
      assertTrue(sessionJson.contains("\"source\":\"passive\""))
      assertTrue(sessionJson.contains("\"signalStatus\":\"no_waveform\""))
      assertTrue(sessionJson.contains("\"segmentRanges\":[]"))
      assertTrue(sessionJson.contains("\"complete\":true"))
    }
  }

  @Test
  fun observationTimeoutWithoutFramesFailsAndDoesNotPublishAnEmptySession() = runTest {
    withFixture(
      scope = backgroundScope,
      scheduler = testScheduler,
      config = fastConfig(observationTimeoutNanos = 100_000_000L),
      updates = listOf(noFace()),
    ) { fixture ->
      fixture.session.openPreview()
      fixture.session.start()
      advanceTimeBy(100L)
      runCurrent()

      val state = fixture.session.snapshot
      assertEquals(RPPGSessionPhase.FAILED, state.phase)
      assertEquals("NO_CAMERA_FRAMES", state.error?.code)
      assertTrue(state.artifact == null)
      assertFalse(fixture.root.walkTopDown().any { it.isFile })
    }
  }

  /** 并发停止共用关闭屏障，只发布一次且关闭期间拒绝旧帧。 */
  @Test
  fun concurrentStopsShareCloseBarrierAndPublishOneTriplet() = runTest {
    withFixture(backgroundScope, testScheduler) { fixture ->
      fixture.session.openPreview()
      fixture.session.start()
      fixture.camera.emit(11_000_000_000L)
      runCurrent()
      val oldListener = checkNotNull(fixture.camera.formalListener)
      val closeEntered = CompletableDeferred<Unit>()
      val closeGate = CompletableDeferred<Unit>()
      fixture.camera.closeEntered = closeEntered
      fixture.camera.closeGate = closeGate

      val userStop = backgroundScope.async {
        fixture.session.stop(RPPGTerminationReason.USER_STOP)
      }
      val pageStop = backgroundScope.async {
        fixture.session.stop(RPPGTerminationReason.PAGE_LEFT)
      }
      runCurrent()
      closeEntered.await()
      assertEquals(1, fixture.camera.closeCalls)

      fixture.camera.emit(11_050_000_000L, oldListener)
      assertEquals(listOf(11_000_000_000L), fixture.processor.observedTimestamps)
      closeGate.complete(Unit)
      runCurrent()

      assertTrue(userStop.await().accepted)
      assertTrue(pageStop.await().accepted)
      assertEquals(1, fixture.camera.closeCalls)
      val reason = checkNotNull(fixture.session.snapshot.termination)
      assertTrue(
        reason == RPPGTerminationReason.USER_STOP ||
          reason == RPPGTerminationReason.PAGE_LEFT,
      )
      assertPublishedTriplet(fixture.session.snapshot.artifact, fixture.root, reason.wireValue)
    }
  }

  /** 目标到达与重复关闭共用终态屏障，旧帧不能重复处理或释放后续租约。 */
  @Test
  fun passiveTargetAndRepeatedCloseShareOneTerminalBarrier() = runTest {
    withFixture(
      scope = backgroundScope,
      scheduler = testScheduler,
      config = fastConfig(targetDurationNanos = 100_000_000L),
      updates = listOf(noFace(), readyFace()),
      sessionSource = RPPGSessionSource.PASSIVE,
    ) { fixture ->
      assertTrue(fixture.session.startAnalysisOnly("passive-target-close-race").accepted)
      fixture.camera.emit(30_000_000_000L)
      runCurrent()
      fixture.camera.emit(30_050_000_000L)
      runCurrent()
      assertEquals(RPPGSessionPhase.MEASURING, fixture.session.snapshot.phase)
      val oldListener = checkNotNull(fixture.camera.formalListener)
      val closeEntered = CompletableDeferred<Unit>()
      val closeGate = CompletableDeferred<Unit>()
      fixture.camera.closeEntered = closeEntered
      fixture.camera.closeGate = closeGate

      advanceTimeBy(100L)
      runCurrent()
      closeEntered.await()
      val firstClose = backgroundScope.async { fixture.session.close() }
      val repeatedClose = backgroundScope.async { fixture.session.close() }
      runCurrent()
      fixture.camera.emit(30_100_000_000L, oldListener)
      assertEquals(
        listOf(30_000_000_000L, 30_050_000_000L),
        fixture.processor.observedTimestamps,
      )

      closeGate.complete(Unit)
      runCurrent()
      assertTrue(firstClose.await().accepted)
      assertTrue(repeatedClose.await().accepted)

      assertEquals(RPPGSessionPhase.CLOSED, fixture.session.snapshot.phase)
      assertEquals(RPPGTerminationReason.TARGET_DURATION, fixture.session.snapshot.termination)
      assertEquals(1, fixture.camera.closeCalls)
      assertEquals(2, fixture.processor.observedTimestamps.size)
      assertPublishedTriplet(
        fixture.session.snapshot.artifact,
        fixture.root,
        RPPGTerminationReason.TARGET_DURATION.wireValue,
        source = RPPGSessionSource.PASSIVE,
      )
      val replacementLease = checkNotNull(CameraUseGuard.tryAcquire("post-close-capture-lease"))
      replacementLease.close()
    }
  }


  /** 宿主后台沿用合法中断收尾并发布三件套。 */
  @Test
  fun hostBackgroundPublishesInterruptedTriplet() = runTest {
    withFixture(backgroundScope, testScheduler) { fixture ->
      fixture.session.openPreview()
      fixture.session.start()
      fixture.camera.emit(12_000_000_000L)
      runCurrent()

      fixture.camera.stopHost()
      runCurrent()

      assertEquals(RPPGSessionPhase.COMPLETED, fixture.session.snapshot.phase)
      assertEquals(RPPGTerminationReason.APP_BACKGROUND, fixture.session.snapshot.termination)
      assertPublishedTriplet(
        fixture.session.snapshot.artifact,
        fixture.root,
        RPPGTerminationReason.APP_BACKGROUND.wireValue,
      )
    }
  }


  /** 相机源报告中断时转为技术失败，不能伪造已完成的测量结果。 */
  @Test
  fun cameraInterruptionNeverPublishesCompleteArtifact() = runTest {
    withFixture(backgroundScope, testScheduler) { fixture ->
      fixture.session.openPreview()
      fixture.session.start()
      fixture.camera.emit(12_500_000_000L)
      runCurrent()

      fixture.camera.interrupt("CAMERA_DISCONNECTED", "camera disconnected")
      runCurrent()

      assertEquals(RPPGSessionPhase.FAILED, fixture.session.snapshot.phase)
      assertEquals("CAMERA_DISCONNECTED", fixture.session.snapshot.error?.code)
      assertTrue(fixture.session.snapshot.artifact == null)
      assertTrue(fixture.session.resourcesReleased)
      assertTrue(RPPGArtifactStore(fixture.root).listArtifacts().isEmpty())
    }
  }
  /** 上一被动会话的迟到回调不能恢复等待或释放新会话的相机租约。 */
  @Test
  fun staleCallbacksFromPreviousSessionDoNotAffectReplacementSession() = runTest {
    withFixture(
      backgroundScope,
      testScheduler,
      sessionSource = RPPGSessionSource.PASSIVE,
    ) { previous ->
      assertTrue(previous.session.startAnalysisOnly("previous-passive-session").accepted)
      previous.camera.emit(13_000_000_000L)
      runCurrent()
      val staleListener = checkNotNull(previous.camera.formalListener)
      assertTrue(previous.session.stop(RPPGTerminationReason.USER_STOP).accepted)

      withFixture(
        scope = backgroundScope,
        scheduler = testScheduler,
        camera = previous.camera,
        sessionSource = RPPGSessionSource.PASSIVE,
      ) { current ->
        assertTrue(current.session.startAnalysisOnly("current-passive-session").accepted)
        current.camera.emit(20_000_000_000L)
        runCurrent()
        val beforeLateCallbacks = current.session.snapshot

        current.camera.emit(99_000_000_000L, staleListener)
        staleListener.onInterrupted("LATE_CAMERA_ERROR", "旧会话的迟到中断。")
        runCurrent()

        assertEquals(listOf(20_000_000_000L), current.processor.observedTimestamps)
        assertEquals(beforeLateCallbacks, current.session.snapshot)
        val lateCallbackLeaseProbe = CameraUseGuard.tryAcquire("late-callback-lease")
        assertTrue(lateCallbackLeaseProbe == null)
        lateCallbackLeaseProbe?.close()
        val result = current.session.stop(RPPGTerminationReason.USER_STOP)
        assertTrue(result.accepted)
        val metadata = artifactFile(result.snapshot.artifact, RPPGArtifactFileKind.SESSION_JSON).readText()
        assertTrue(metadata.contains("\"sensorTimeOriginNs\":\"20000000000\""))
        val replacementLease = checkNotNull(CameraUseGuard.tryAcquire("after-stale-callback-lease"))
        replacementLease.close()
      }
    }
  }

  /** 相机占用失败已无待释放资源，首次关闭成功且不清除历史错误或其他所有者租约。 */
  @Test
  fun closeAfterBusyFailureSucceedsWithoutReleasingOtherOwner() = runTest {
    withFixture(backgroundScope, testScheduler) { fixture ->
      val owner = checkNotNull(CameraUseGuard.tryAcquire("busy-close-owner"))
      try {
        val opened = fixture.session.openPreview()
        assertFalse(opened.accepted)
        assertEquals("CAMERA_BUSY", opened.commandError?.code)
        assertTrue(fixture.session.resourcesReleased)
        assertFalse(fixture.session.stop().accepted)

        val closed = fixture.session.close()
        assertTrue(closed.accepted)
        assertTrue(closed.commandError == null)
        assertEquals(RPPGSessionPhase.CLOSED, closed.snapshot.phase)
        assertEquals(opened.snapshot.error, closed.snapshot.error)
        val probe = CameraUseGuard.tryAcquire("busy-close-probe")
        probe?.close()
        assertTrue(probe == null)
      } finally {
        owner.close()
      }
    }
  }

  /** 相机关闭失败时保留本会话租约；重试释放后也不能发布技术失败产物。 */
  @Test
  fun cameraCloseFailureRetainsLeaseAndNeverPublishesAfterRetry() = runTest {
    withFixture(backgroundScope, testScheduler) { fixture ->
      fixture.session.openPreview()
      fixture.session.start()
      fixture.camera.emit(14_000_000_000L)
      runCurrent()
      fixture.camera.closeFailure = IOException("camera close failed")

      val firstStop = fixture.session.stop(RPPGTerminationReason.USER_STOP)
      assertFalse(firstStop.accepted)
      assertEquals(RPPGSessionPhase.FAILED, firstStop.snapshot.phase)
      assertFalse(fixture.session.resourcesReleased)
      assertTrue(firstStop.snapshot.artifact == null)
      assertTrue(CameraUseGuard.tryAcquire("other-owner-before-retry") == null)

      fixture.camera.closeFailure = null
      val retry = fixture.session.stop(RPPGTerminationReason.USER_STOP)
      assertFalse(retry.accepted)
      assertTrue(fixture.session.resourcesReleased)
      assertTrue(retry.snapshot.artifact == null)
      assertTrue(RPPGArtifactStore(fixture.root).listArtifacts().isEmpty())

      val unrelatedLease = checkNotNull(CameraUseGuard.tryAcquire("unrelated-owner"))
      try {
        assertTrue(CameraUseGuard.tryAcquire("third-owner") == null)
        assertFalse(fixture.session.stop().accepted)
        assertTrue(CameraUseGuard.tryAcquire("third-owner") == null)
      } finally {
        unrelatedLease.close()
      }
    }
  }

  /** 人脸算法异常须成为技术失败，不能发布成功三件套。 */
  @Test
  fun algorithmFailureNeverPublishesCompleteArtifact() = runTest {
    withFixture(
      scope = backgroundScope,
      scheduler = testScheduler,
      updates = listOf(noFace(), readyFace()),
    ) { fixture ->
      fixture.processor.beginFailure = IllegalStateException("algorithm failed")
      fixture.session.openPreview()
      fixture.session.start()
      fixture.camera.emit(15_000_000_000L)
      runCurrent()
      fixture.camera.emit(15_050_000_000L)
      runCurrent()

      assertEquals(RPPGSessionPhase.FAILED, fixture.session.snapshot.phase)
      assertTrue(fixture.session.snapshot.artifact == null)
      assertTrue(fixture.session.resourcesReleased)
      assertTrue(RPPGArtifactStore(fixture.root).listArtifacts().isEmpty())
    }
  }

  /** CSV 初始化异常须传播到会话终态，且不能留下可查询的完成产物。 */
  @Test
  fun outputInitializationFailureNeverPublishesCompleteArtifact() = runTest {
    withFixture(
      scope = backgroundScope,
      scheduler = testScheduler,
      outputFactory = { directory, descriptor, dispatcher ->
        RPPGSessionOutput(
          filesDirectory = directory,
          session = descriptor,
          pulseWriterFactory = BatchWriterFactory<RPPGPulseSample> {
            throw IOException("pulse writer open failed")
          },
          ioDispatcher = dispatcher,
        )
      },
    ) { fixture ->
      fixture.session.openPreview()
      fixture.session.start()
      fixture.camera.emit(16_000_000_000L)
      runCurrent()

      assertEquals(RPPGSessionPhase.FAILED, fixture.session.snapshot.phase)
      assertTrue(fixture.session.snapshot.artifact == null)
      assertTrue(fixture.session.resourcesReleased)
      assertTrue(RPPGArtifactStore(fixture.root).listArtifacts().isEmpty())
    }
  }


  /** 构造短时测试参数，算法边界仍沿用版本化实验基线。 */
  private fun fastConfig(
    observationTimeoutNanos: Long = 5_000_000_000L,
    targetDurationNanos: Long = 30_000_000_000L,
  ) = RPPGConfig.EXPERIMENTAL_V1.copy(
    observationTimeoutNanos = observationTimeoutNanos,
    targetMeasurementDurationNanos = targetDurationNanos,
    faceReadiness = RPPGConfig.EXPERIMENTAL_V1.faceReadiness.copy(
      requiredContinuousNanos = 50_000_000L,
    ),
  )

  /** 构造未找到合格人脸的测试观察帧。 */
  private fun noFace() = FaceReadinessUpdate(
    ready = false,
    reason = FaceReadinessReason.NO_FACE,
    continuousNanos = 0L,
    faceWidthFraction = null,
    pose = null,
    roiSamples = null,
    rgbSample = null,
  )

  /** 构造连续就绪已经满足的测试观察帧。 */
  private fun readyFace() = FaceReadinessUpdate(
    ready = true,
    reason = FaceReadinessReason.READY,
    continuousNanos = 50_000_000L,
    faceWidthFraction = 0.5,
    pose = null,
    roiSamples = null,
    rgbSample = null,
  )

  /** 查找已发布产物中的指定文件。 */
  private fun artifactFile(
    artifact: RPPGArtifact?,
    kind: RPPGArtifactFileKind,
  ): File {
    val path = artifact?.files?.firstOrNull { it.kind == kind }?.path
    assertNotNull(path)
    return File(checkNotNull(path))
  }

  /** 核验完整三件套、结束原因及按来源过滤的本地查询。 */
  private suspend fun assertPublishedTriplet(
    artifact: RPPGArtifact?,
    root: File,
    termination: String,
    source: RPPGSessionSource = RPPGSessionSource.ACTIVE,
  ) {
    assertNotNull(artifact)
    val published = checkNotNull(artifact)
    assertEquals(
      setOf(
        RPPGArtifactFileKind.SESSION_JSON,
        RPPGArtifactFileKind.PULSE,
        RPPGArtifactFileKind.HEART_RATE,
      ),
      published.files.map { it.kind }.toSet(),
    )
    val metadata = artifactFile(published, RPPGArtifactFileKind.SESSION_JSON).readText()
    assertTrue(metadata.contains("\"termination\":\"$termination\""))
    assertEquals(1, RPPGArtifactStore(root).listArtifacts(source).size)
  }
  /** 在临时应用目录中构造可控相机、处理器和单调测试时钟。 */
  private suspend fun withFixture(
    scope: CoroutineScope,
    scheduler: TestCoroutineScheduler,
    config: RPPGConfig = fastConfig(),
    updates: List<FaceReadinessUpdate> = listOf(noFace()),
    camera: FakeCamera = FakeCamera(),
    sessionSource: RPPGSessionSource = RPPGSessionSource.ACTIVE,
    outputFactory: (File, RPPGSessionDescriptor, CoroutineDispatcher) -> RPPGSessionOutput =
      { directory, descriptor, dispatcher ->
        RPPGSessionOutput(directory, descriptor, ioDispatcher = dispatcher)
      },
    block: suspend (Fixture) -> Unit,
  ) {
    val root = Files.createTempDirectory("rppg-active-session").toFile()
    val processor = FakeProcessor(updates)
    val processorCreations = java.util.concurrent.atomic.AtomicInteger()
    val processorFactory = RPPGSessionProcessorFactory { _, _ ->
      processorCreations.incrementAndGet()
      processor
    }
    val dispatcher = UnconfinedTestDispatcher(scheduler)
    val fixture = Fixture(
      root = root,
      camera = camera,
      processor = processor,
      processorCreations = processorCreations,
      session = RPPGSession(
        filesDirectory = root,
        config = config,
        cameraSourceFactory = { camera },
        processorFactory = processorFactory,
        scope = scope,
        sessionSource = sessionSource,
        clock = TestClock(scheduler),
        processorDispatcher = dispatcher,
        ioDispatcher = dispatcher,
        recordConsumerDispatcher = dispatcher,
        realtimeDispatcher = dispatcher,
        outputFactory = outputFactory,
      ),
    )
    try {
      block(fixture)
    } finally {
      fixture.session.stop(RPPGTerminationReason.PAGE_LEFT)
      root.deleteRecursively()
    }
  }

  private data class Fixture(
    val root: File,
    val camera: FakeCamera,
    val processor: FakeProcessor,
    val processorCreations: java.util.concurrent.atomic.AtomicInteger,
    val session: RPPGSession,
  )

  
  /** 使用测试调度器作为 Android elapsedRealtime 的单调原点。 */
  private class TestClock(private val scheduler: TestCoroutineScheduler) : RPPGSessionClock {
    override fun elapsedRealtimeNanos(): Long = scheduler.currentTime * 1_000_000L

    override fun wallClockIso8601(): String = "2025-01-01T00:00:00.000Z"
  }

  /** 只保留回调的前摄假源，便于在代次切换后主动触发旧监听器。 */
  private class FakeCamera : RPPGSessionCameraSource {
    private val descriptor = CameraDescriptor("front-0", CameraFacing.FRONT, 90)
    var focusModeCapability = CameraModeCapability(
      CameraCapabilityStatus.SUPPORTED,
      listOf(CameraFocusMode.AUTO.wireValue, CameraFocusMode.OFF.wireValue),
      emptyList(),
      null,
    )
    var previewConfig: CameraConfig? = null
      private set
    private var currentListener: RPPGSessionCameraListener? = null
    var previewListener: RPPGSessionCameraListener? = null
      private set

    var formalListener: RPPGSessionCameraListener? = null
      private set
    /** 累计仅分析绑定次数。 */
    var analysisOnlyOpenCalls = 0
      private set
    private var hostStopped: (() -> Unit)? = null
    var closeCalls = 0
      private set
    var closeFailure: Throwable? = null
    var closeEntered: CompletableDeferred<Unit>? = null
    var closeGate: CompletableDeferred<Unit>? = null
    /** 阻塞仅分析相机打开以验证启动取消期间的租约清理。 */
    var analysisOpenGate: CompletableDeferred<Unit>? = null
    override suspend fun listCameras(): List<CameraDescriptor> = listOf(descriptor)

    /** 返回测试用的前摄对焦能力。 */
    override suspend fun getFocusModeCapability(cameraId: String): CameraModeCapability =
      focusModeCapability


    override suspend fun openPreview(
      config: CameraConfig,
      listener: RPPGSessionCameraListener,
      onHostStopped: () -> Unit,
    ): CameraConfigSummary {
      previewListener = listener
      previewConfig = config
      currentListener = listener
      hostStopped = onHostStopped
      return summary(config)
    }
    /** 记录仅分析绑定，确保被动会话不经预览绑定路径。 */
    override suspend fun openAnalysisOnly(
      config: CameraConfig,
      listener: RPPGSessionCameraListener,
      onHostStopped: () -> Unit,
    ): CameraConfigSummary {
      analysisOnlyOpenCalls += 1
      formalListener = listener
      currentListener = listener
      hostStopped = onHostStopped
      analysisOpenGate?.await()
      return summary(config)
    }

    override suspend fun replaceFrameGeneration(
      config: CameraConfig,
      listener: RPPGSessionCameraListener,
      onHostStopped: () -> Unit,
    ): CameraConfigSummary {
      currentListener = listener
      formalListener = listener
      hostStopped = onHostStopped
      return summary(config)
    }

    override suspend fun close() {
      closeCalls += 1
      closeEntered?.complete(Unit)
      closeGate?.await()
      closeFailure?.let { throw it }
      currentListener = null
    }
    /** 模拟宿主主动停止当前相机会话。 */
    fun stopHost() {
      checkNotNull(hostStopped).invoke()
    }

    /** 模拟相机源报告不可恢复中断。 */
    fun interrupt(code: String, message: String) {
      checkNotNull(currentListener).onInterrupted(code, message)
    }

    /** 同步发送一帧并模拟相机源在回调返回后关闭借用帧。 */
    fun emit(timestampNanos: Long, listener: RPPGSessionCameraListener? = currentListener) {
      val active = checkNotNull(listener)
      val frame = FakeFrame(timestampNanos)
      try {
        active.onMetrics(geometry(), 30.0)
        active.onFrame(frame)
      } finally {
        frame.close()
      }
    }

    /** 构造本次绑定请求对应的低频相机摘要。 */
    private fun summary(config: CameraConfig) = CameraConfigSummary(
      cameraId = config.cameraId,
      requestedConfig = config,
      submittedConfig = config,
      adjustments = emptyList(),
      actualFrame = geometry(),
      observedFps = 30.0,
    )
  }

  /** 提供测试帧的采集时间，不分配像素内存。 */
  private class FakeFrame(override val sensorTimestampNanos: Long) : RPPGCameraFrame {
    var closed = false
      private set

    override fun pixelFrameView(
      sessionId: String,
      frameIndex: Long,
      processingElapsedNanos: Long,
      timestampSystemNanos: Long,
    ): PixelFrameView = error("fake processor must not request pixel memory")

    override fun close() {
      check(!closed)
      closed = true
    }
  }

  /** 返回配置要求的固定就绪序列，并记录算法边界接收的帧时间。 */
  private class FakeProcessor(
    updates: List<FaceReadinessUpdate>,
    private val emitPulseSamples: Boolean = false,
  ) : RPPGSessionProcessor {
    private val pendingUpdates = ArrayDeque(updates)
    private var lastUpdate = updates.last()
    val observedTimestamps = mutableListOf<Long>()
    val acceptedTimestamps = mutableListOf<Long>()
    var closed = false
      private set
    override var latestInstantHeartRate: RPPGInstantHeartRate? = null

    /** 模拟恢复处理前清除旧逐搏历史。 */
    override fun resetInstantHeartRate() {
      latestInstantHeartRate = null
    }
    var beginFailure: Throwable? = null

    override fun observe(
      frame: RPPGCameraFrame,
      frameIndex: Long,
      sensorTimeOriginNanos: Long,
    ): FaceReadinessUpdate {
      observedTimestamps.add(frame.sensorTimestampNanos)
      if (pendingUpdates.isNotEmpty()) lastUpdate = pendingUpdates.removeFirst()
      return lastUpdate
    }

    override fun beginMeasurement() {
      beginFailure?.let { throw it }
    }

    override fun acceptMeasurementSample(
      timestampNanos: Long,
      sample: RppgRgbMean?,
      emit: (RPPGSessionRecord) -> Unit,
    ) {
      acceptedTimestamps.add(timestampNanos)
      if (emitPulseSamples) {
        emit(
          RPPGPulseSample(
            segmentIndex = 0L,
            sampleIndex = acceptedTimestamps.lastIndex.toLong(),
            timestampNanos = timestampNanos,
            value = 0.25,
          ),
        )
      }
    }

    override fun finishMeasurement() = Unit

    override fun close() {
      closed = true
    }
  }

  private companion object {
    /** 构造相机摘要中的实际交付几何。 */
    fun geometry() = CameraFrameGeometry(
      width = 640,
      height = 480,
      crop = CameraFrameCrop(0, 0, 640, 480),
      sensorOrientationDegrees = 90,
      mirrored = true,
    )
  }
}
