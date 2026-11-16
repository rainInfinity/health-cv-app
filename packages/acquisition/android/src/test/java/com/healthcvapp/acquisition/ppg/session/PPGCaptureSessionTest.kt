/** 验证采集会话等待在途帧、文件消费与终态错误，且会话路径隔离。 */

package com.healthcvapp.acquisition.ppg.session

import com.healthcvapp.acquisition.camera.CameraFrameMetadata
import com.healthcvapp.acquisition.ppg.model.CameraBlockLayout
import com.healthcvapp.acquisition.camera.model.CameraConfig
import com.healthcvapp.acquisition.camera.model.CameraConfigAdjustment
import com.healthcvapp.acquisition.camera.model.CameraConfigSummary
import com.healthcvapp.acquisition.camera.model.CameraExposureConfig
import com.healthcvapp.acquisition.camera.model.CameraExposureMode
import com.healthcvapp.acquisition.camera.model.CameraFocusConfig
import com.healthcvapp.acquisition.camera.model.CameraFocusMode
import com.healthcvapp.acquisition.camera.model.CameraFrameCrop
import com.healthcvapp.acquisition.camera.model.CameraFrameGeometry
import com.healthcvapp.acquisition.camera.model.CameraResolution
import com.healthcvapp.acquisition.camera.model.CameraWhiteBalanceConfig
import com.healthcvapp.acquisition.camera.model.CameraWhiteBalanceMode
import com.healthcvapp.acquisition.ppg.model.PPGConfigSummary
import com.healthcvapp.acquisition.ppg.model.PPGArtifactFileKind
import com.healthcvapp.acquisition.ppg.model.PPGCaptureRecord
import com.healthcvapp.acquisition.ppg.model.PPGFrameRecord
import com.healthcvapp.acquisition.ppg.output.FrameCsvEncoder
import com.healthcvapp.acquisition.ppg.output.PPGCsvEncoder
import com.healthcvapp.acquisition.ppg.output.PPGSessionOutput
import com.healthcvapp.acquisition.storage.AcquisitionFileStore
import com.healthcvapp.acquisition.storage.csv.BatchWriter
import com.healthcvapp.acquisition.storage.csv.BatchWriterFactory
import com.healthcvapp.acquisition.storage.csv.CsvBatchWriter
import java.io.File
import java.io.IOException
import java.nio.file.Files
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class PPGCaptureSessionTest {
  @Test
  fun stopWaitsForInFlightFrameAndTailBatchBeforeReturningArtifact() = runTest {
    val directory = Files.createTempDirectory("capture-stop").toFile()
    val dispatcher = StandardTestDispatcher(testScheduler)
    val enteredPpgWrite = CompletableDeferred<Unit>()
    val finishPpgWrite = CompletableDeferred<Unit>()
    val enteredFrameWrite = CompletableDeferred<Unit>()
    val finishFrameWrite = CompletableDeferred<Unit>()
    val session = session(
      directory,
      "session-one",
      dispatcher,
      frameWriterFactory = { file ->
        val delegate = frameCsvWriter(file)
        object : BatchWriter<PPGCaptureRecord> {
          override suspend fun writeBatch(records: List<PPGCaptureRecord>) {
            enteredFrameWrite.complete(Unit)
            finishFrameWrite.await()
            delegate.writeBatch(records)
          }
          override fun close() = delegate.close()
        }
      },
    ) { file ->
      val delegate = ppgCsvWriter(file)
      object : BatchWriter<PPGCaptureRecord> {
        override suspend fun writeBatch(records: List<PPGCaptureRecord>) {
          enteredPpgWrite.complete(Unit)
          finishPpgWrite.await()
          delegate.writeBatch(records)
        }
        override fun close() = delegate.close()
      }
    }
    start(session)
    val frameIndex = session.beginFrame(101)
    assertEquals(0L, frameIndex)

    val stop = async { session.stop(finishedAtMillis = 500) }
    runCurrent()
    assertFalse(stop.isCompleted)
    offerFrame(session, frameIndex)
    runCurrent()
    assertTrue(enteredPpgWrite.isCompleted)
    assertFalse(stop.isCompleted)

    finishPpgWrite.complete(Unit)
    runCurrent()
    assertTrue(enteredFrameWrite.isCompleted)
    assertFalse(stop.isCompleted)
    assertFalse(directory.resolve("acquisition/ppg/session-one/ppg.csv").exists())
    assertFalse(directory.resolve("acquisition/ppg/session-one/frame.csv").exists())

    finishFrameWrite.complete(Unit)
    runCurrent()
    val artifact = stop.await()
    val repeatedArtifact = session.stop(finishedAtMillis = 600)
    assertSame(artifact, repeatedArtifact)
    assertFalse(session.fail(PPGCaptureFailure("CAMERA_INTERRUPTED", "相机已在完成后中断。")))
    assertEquals(null, session.terminalFailure)

    assertEquals("session-one", artifact.sessionId)
    assertEquals(listOf(PPGArtifactFileKind.PPG, PPGArtifactFileKind.FRAME), artifact.files.map { it.kind })
    val ppgFile = File(artifact.files.first { it.kind == PPGArtifactFileKind.PPG }.path)
    val frameFile = File(artifact.files.first { it.kind == PPGArtifactFileKind.FRAME }.path)
    assertTrue(ppgFile.isFile)
    assertTrue(frameFile.isFile)
    assertEquals(500L, artifact.finishedAtMillis)
    assertEquals(2, ppgFile.readLines().size)
    assertEquals(2, frameFile.readLines().size)
    assertFalse(File(ppgFile.path + ".part").exists())
    assertFalse(File(frameFile.path + ".part").exists())
  }

  /** 验证完成产物保留冻结配置、真实几何和分块布局。 */
  @Test
  fun completedArtifactCarriesFrozenConfigurationAndBlockLayout() = runTest {
    val directory = Files.createTempDirectory("capture-summary").toFile()
    val dispatcher = StandardTestDispatcher(testScheduler)
    val layout = CameraBlockLayout(rows = 2, columns = 3)
    val config = CameraConfig(
      cameraId = "1",
      targetResolution = CameraResolution(width = 720.0, height = 720.0),
      targetFps = 30.0,
      torchEnabled = false,
      exposure = CameraExposureConfig(
        mode = CameraExposureMode.AUTO,
        compensationIndex = 0.0,
        timeNanos = null,
        iso = null,
        locked = true,
      ),
      whiteBalance = CameraWhiteBalanceConfig(mode = CameraWhiteBalanceMode.AUTO, locked = true),
      focus = CameraFocusConfig(mode = CameraFocusMode.AUTO, distanceDiopters = null),
    )
    val summary = PPGConfigSummary(
      cameraSummary = CameraConfigSummary(
        cameraId = "1",
        requestedConfig = config,
        submittedConfig = config.copy(
          targetResolution = CameraResolution(width = 1024.0, height = 768.0),
        ),
        adjustments = listOf(
          CameraConfigAdjustment(
            field = "targetResolution",
            requestedValue = "720x720",
            submittedValue = "1024x768",
            reason = "该相机的预览与分析组合选择了可用候选尺寸。",
          ),
        ),
        actualFrame = CameraFrameGeometry(
          width = 1024,
          height = 768,
          crop = CameraFrameCrop(left = 0, top = 0, width = 1024, height = 768),
          sensorOrientationDegrees = 270,
          mirrored = false,
        ),
        observedFps = 24.0,
      ),
      blockLayout = layout,
    )
    val session = session(directory, "summary", dispatcher, blockLayout = layout)
    start(session)
    offerFrame(session, session.beginFrame(101))
    offerFrame(session, session.beginFrame(102))

    val artifact = session.stop(finishedAtMillis = 500, cameraConfigSummary = summary)
    val ppgFile = File(artifact.files.first { it.kind == PPGArtifactFileKind.PPG }.path)
    val frameFile = File(artifact.files.first { it.kind == PPGArtifactFileKind.FRAME }.path)
    val ppgRows = ppgFile.readLines().drop(1).map { it.split(',') }
    val frameRows = frameFile.readLines().drop(1).map { it.split(',') }

    assertEquals(summary, artifact.cameraConfigSummary)
    assertEquals(12, ppgRows.size)
    assertEquals(2, frameRows.size)
    assertEquals(
      listOf("0", "1", "2", "3", "4", "5", "0", "1", "2", "3", "4", "5"),
      ppgRows.map { it[7] },
    )
    assertEquals(
      listOf("0", "1"),
      ppgRows.chunked(6).map { rows ->
        assertEquals(1, rows.map { it[1] }.distinct().size)
        assertEquals(1, rows.map { it[2] }.distinct().size)
        assertEquals(1, rows.map { it[6] }.distinct().size)
        rows.first()[6]
      },
    )
    assertEquals(frameRows.map { it[1] }, ppgRows.chunked(6).map { it.first()[1] })

    assertTrue(ppgFile.isFile)
    assertTrue(frameFile.isFile)
    assertFalse(File(ppgFile.path + ".part").exists())
    assertFalse(File(frameFile.path + ".part").exists())
  }

  @Test
  fun writesPairedRecordsToBothCsvFilesInFrameOrder() = runTest {
    val directory = Files.createTempDirectory("capture-paired-order").toFile()
    val dispatcher = StandardTestDispatcher(testScheduler)
    val session = session(directory, "paired-order", dispatcher)
    start(session)
    val firstRecord = record(0, 1_000_000L)
    val secondRecord = record(1, 2_000_000L)
    session.offerCaptureMetadata(secondRecord.metadata)
    session.offerCaptureMetadata(firstRecord.metadata)
    val firstFrame = session.beginFrame(101)
    val secondFrame = session.beginFrame(102)
    assertEquals(0L, firstFrame)
    assertEquals(1L, secondFrame)
    session.offerPpgFrame(secondRecord.ppg, 2_000_000L)
    session.offerPpgFrame(firstRecord.ppg, 1_000_000L)

    val artifact = session.stop(finishedAtMillis = 500)
    val ppgFile = File(artifact.files.first { it.kind == PPGArtifactFileKind.PPG }.path)
    val frameFile = File(artifact.files.first { it.kind == PPGArtifactFileKind.FRAME }.path)

    assertEquals(
      listOf(
        "timestamp,timestampFrame,timestampSystem,avgY,avgU,avgV,frameIndex,blockIndex",
        "0.0,1.0,2.0,10.0,127.0,129.0,0,0",
        "1.0,2.0,3.0,10.0,127.0,129.0,1,0",
      ),
      ppgFile.readLines(),
    )
    assertEquals(
      listOf(
        "timestamp,timestampFrame,timestampSystem,exposureTime,durationTime,rollingShutterSkewTime,iso,whiteBalanceMode",
        "4.0,1.0,5.0,5000000,33000000,2000000,100,1",
        "5.0,2.0,6.0,5000000,33000000,2000000,100,1",
      ),
      frameFile.readLines(),
    )
  }

  @Test
  fun oldSessionCallbackCannotWriteIntoNextSessionAndFilesRemainDistinct() = runTest {
    val directory = Files.createTempDirectory("capture-isolation").toFile()
    val dispatcher = StandardTestDispatcher(testScheduler)
    val first = session(directory, "first", dispatcher)
    start(first)
    val oldFrame = first.beginFrame(101)
    offerFrame(first, oldFrame)
    val firstArtifact = first.stop(200)

    val second = session(directory, "second", dispatcher)
    start(second)
    first.finishFrame(oldFrame, record(oldFrame, timestampNanos = 99_000_000L))
    val newFrame = second.beginFrame(301)
    offerFrame(second, newFrame)
    val secondArtifact = second.stop(400)

    assertFalse(firstArtifact.files.first { it.kind == PPGArtifactFileKind.PPG }.path == secondArtifact.files.first { it.kind == PPGArtifactFileKind.PPG }.path)
    assertEquals(2, File(firstArtifact.files.first { it.kind == PPGArtifactFileKind.PPG }.path).readLines().size)
    assertEquals(2, File(secondArtifact.files.first { it.kind == PPGArtifactFileKind.PPG }.path).readLines().size)
    assertTrue(File(firstArtifact.files.first { it.kind == PPGArtifactFileKind.FRAME }.path).isFile)
    assertTrue(File(secondArtifact.files.first { it.kind == PPGArtifactFileKind.FRAME }.path).isFile)
  }

  @Test
  fun queueCapacityFailureNeverReturnsACompletedArtifact() = runTest {
    val directory = Files.createTempDirectory("capture-overflow").toFile()
    val dispatcher = StandardTestDispatcher(testScheduler)
    val finishWrite = CompletableDeferred<Unit>()
    val session = session(directory, "overflow", dispatcher, capacity = 1, batchSize = 1) { file ->
      val delegate = ppgCsvWriter(file)
      object : BatchWriter<PPGCaptureRecord> {
        override suspend fun writeBatch(records: List<PPGCaptureRecord>) {
          finishWrite.await()
          delegate.writeBatch(records)
        }
        override fun close() = delegate.close()
      }
    }
    start(session)
    val firstFrame = session.beginFrame(101)
    offerFrame(session, firstFrame)
    runCurrent()
    val secondFrame = session.beginFrame(102)
    offerFrame(session, secondFrame)

    assertEquals("DATAHUB_CAPACITY_EXCEEDED", session.terminalFailure?.code)
    val stop = async { runCatching { session.stop(500) } }
    runCurrent()
    assertFalse(stop.isCompleted)
    finishWrite.complete(Unit)
    runCurrent()
    val outcome = stop.await()

    assertTrue(outcome.isFailure)
    assertFalse(File(directory.resolve("acquisition/ppg/overflow/ppg.csv").path).exists())
    assertNotNull(session.terminalFailure)
    advanceUntilIdle()
  }
  @Test
  fun pixelProcessingFailureNeverReturnsACompletedArtifact() = runTest {
    val directory = Files.createTempDirectory("capture-pixel-failure").toFile()
    val dispatcher = StandardTestDispatcher(testScheduler)
    val session = session(directory, "pixel-failure", dispatcher)
    start(session)

    val frameIndex = session.beginFrame(101)
    session.finishFrame(frameIndex, record = null, processingError = IllegalStateException("invalid frame"))
    runCurrent()
    val outcome = runCatching { session.stop(500) }

    assertTrue(outcome.isFailure)
    assertEquals("PIXEL_PROCESSING_FAILED", session.terminalFailure?.code)
    assertFalse(directory.resolve("acquisition/ppg/pixel-failure/ppg.csv").exists())
  }

  @Test
  fun stopFailsBoundedlyWhenFormalFrameHasNoMatchingCameraResult() = runTest {
    val directory = Files.createTempDirectory("capture-unmatched").toFile()
    val dispatcher = StandardTestDispatcher(testScheduler)
    val session = session(directory, "unmatched", dispatcher)
    start(session)

    val frameIndex = session.beginFrame(101)
    val frameRecord = record(frameIndex)
    session.offerPpgFrame(frameRecord.ppg, checkNotNull(frameRecord.metadata.timestampFrameNanos))
    val stop = async { runCatching { session.stop(500) } }
    runCurrent()
    assertFalse(stop.isCompleted)

    advanceTimeBy(1_000)
    runCurrent()
    val outcome = stop.await()

    assertTrue(outcome.isFailure)
    assertEquals("FRAME_METADATA_UNMATCHED", (outcome.exceptionOrNull() as PPGCaptureFailure).code)
    assertFalse(directory.resolve("acquisition/ppg/unmatched/ppg.csv").exists())
    assertFalse(directory.resolve("acquisition/ppg/unmatched/frame.csv").exists())
  }


  @Test
  fun writerFailureClosesResourcesAndDoesNotPromotePartialFile() = runTest {
    val directory = Files.createTempDirectory("capture-write-failure").toFile()
    val dispatcher = StandardTestDispatcher(testScheduler)
    var writerClosed = false
    val session = session(directory, "write-failure", dispatcher) { file ->
      val delegate = ppgCsvWriter(file)
      object : BatchWriter<PPGCaptureRecord> {
        override suspend fun writeBatch(records: List<PPGCaptureRecord>) {
          throw IOException("disk full")
        }
        override fun close() {
          delegate.close()
          writerClosed = true
        }
      }
    }
    start(session)
    val frameIndex = session.beginFrame(101)
    offerFrame(session, frameIndex)
    runCurrent()
    advanceUntilIdle()

    val outcome = runCatching { session.stop(500) }

    assertTrue(outcome.isFailure)
    assertEquals("FILE_WRITE_FAILED", session.terminalFailure?.code)
    assertTrue(writerClosed)
    assertFalse(directory.resolve("acquisition/ppg/write-failure/ppg.csv").exists())
  }
  @Test
  fun frameWriterFailureNeverPublishesEitherCompletedCsv() = runTest {
    val directory = Files.createTempDirectory("capture-frame-write-failure").toFile()
    val dispatcher = StandardTestDispatcher(testScheduler)
    var frameWriterClosed = false
    val session = session(
      directory,
      "frame-write-failure",
      dispatcher,
      frameWriterFactory = { file ->
        val delegate = frameCsvWriter(file)
        object : BatchWriter<PPGCaptureRecord> {
          override suspend fun writeBatch(records: List<PPGCaptureRecord>) {
            throw IOException("disk full")
          }
          override fun close() {
            delegate.close()
            frameWriterClosed = true
          }
        }
      },
    )
    start(session)
    val frameIndex = session.beginFrame(101)
    offerFrame(session, frameIndex)
    runCurrent()
    advanceUntilIdle()

    val outcome = runCatching { session.stop(500) }

    assertTrue(outcome.isFailure)
    assertEquals("FILE_WRITE_FAILED", session.terminalFailure?.code)
    assertTrue(frameWriterClosed)
    assertFalse(directory.resolve("acquisition/ppg/frame-write-failure/ppg.csv").exists())
    assertFalse(directory.resolve("acquisition/ppg/frame-write-failure/frame.csv").exists())
  }

  private suspend fun start(session: PPGCaptureSession) {
    session.start(startedAtElapsedNanos = 100, startedAtMillis = 50)
  }

  private fun session(
    directory: File,
    id: String,
    dispatcher: TestDispatcher,
    blockLayout: CameraBlockLayout = CameraBlockLayout(rows = 1, columns = 1),
    capacity: Int = 4,
    batchSize: Int = 4,
    frameWriterFactory: (File) -> BatchWriter<PPGCaptureRecord> = ::frameCsvWriter,
    writerFactory: (File) -> BatchWriter<PPGCaptureRecord> = ::ppgCsvWriter,
  ) = PPGCaptureSession(
    filesDirectory = directory,
    sessionId = id,
    blockLayout = blockLayout,
    output = PPGSessionOutput(
      filesDirectory = directory,
      sessionId = id,
      ppgWriterFactory = BatchWriterFactory(writerFactory),
      frameWriterFactory = BatchWriterFactory(frameWriterFactory),
      ioDispatcher = dispatcher,
    ),
    ioDispatcher = dispatcher,
    consumerDispatcher = dispatcher,
    capacity = capacity,
    batchSize = batchSize,
    flushIntervalMillis = 10_000,
  )

  private fun ppgCsvWriter(file: File): BatchWriter<PPGCaptureRecord> =
    CsvBatchWriter(AcquisitionFileStore().createNewOutput(file), PPGCsvEncoder)

  private fun frameCsvWriter(file: File): BatchWriter<PPGCaptureRecord> =
    CsvBatchWriter(AcquisitionFileStore().createNewOutput(file), FrameCsvEncoder)

  private fun offerFrame(session: PPGCaptureSession, frameIndex: Long) {
    val record = record(frameIndex, blockLayout = session.blockLayout)
    val sensorTimestampNanos = checkNotNull(record.metadata.timestampFrameNanos)
    session.offerPpgFrame(record.ppg, sensorTimestampNanos)
    session.offerCaptureMetadata(record.metadata)
  }

  private fun record(
    index: Long,
    timestampNanos: Long = (index + 1) * NANOS_PER_MILLISECOND,
    blockLayout: CameraBlockLayout = CameraBlockLayout(rows = 1, columns = 1),
  ) = PPGCaptureRecord(
    ppg = PPGFrameRecord(
      timestamp = index.toDouble(),
      timestampFrame = timestampNanos.toDouble() / NANOS_PER_MILLISECOND,
      timestampSystem = index.toDouble() + 2,
      frameIndex = index,
      blockLayout = blockLayout,
      averagesYuv = DoubleArray(blockLayout.rows * blockLayout.columns * 3) {
        when (it % 3) {
          0 -> 10.0
          1 -> 127.0
          else -> 129.0
        }
      },
    ),
    metadata = CameraFrameMetadata(
      timestampElapsedNanos = timestampNanos + 3_000_000L,
      timestampFrameNanos = timestampNanos,
      timestampSystemNanos = timestampNanos + 4_000_000L,
      exposureTimeNanos = 5_000_000L,
      durationTimeNanos = 33_000_000L,
      rollingShutterSkewTimeNanos = 2_000_000L,
      iso = 100,
      whiteBalanceMode = 1,
    ),
  )

  private companion object {
    const val NANOS_PER_MILLISECOND = 1_000_000L
  }
}
