/** 验证采集会话等待在途帧、文件消费与终态错误，且会话路径隔离。 */

package com.healthcvapp.acquisition.session

import com.healthcvapp.acquisition.camera.CameraFrameMetadata
import com.healthcvapp.acquisition.camera.CaptureRecord
import com.healthcvapp.acquisition.processing.PpgRecord
import com.healthcvapp.acquisition.writers.FrameBatchWriter
import com.healthcvapp.acquisition.writers.FrameBatchWriterFactory
import com.healthcvapp.acquisition.writers.FrameCsvWriter
import com.healthcvapp.acquisition.writers.PpgBatchWriter
import com.healthcvapp.acquisition.writers.PpgBatchWriterFactory
import com.healthcvapp.acquisition.writers.PpgCsvWriter
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

class CaptureSessionTest {
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
        val delegate = FrameCsvWriter(file)
        object : FrameBatchWriter {
          override suspend fun writeBatch(records: List<CaptureRecord>) {
            enteredFrameWrite.complete(Unit)
            finishFrameWrite.await()
            delegate.writeBatch(records)
          }
          override fun close() = delegate.close()
        }
      },
    ) { file ->
      val delegate = PpgCsvWriter(file)
      object : PpgBatchWriter {
        override suspend fun writeBatch(records: List<CaptureRecord>) {
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
    assertFalse(directory.resolve("acquisition/session-one/ppg.csv").exists())
    assertFalse(directory.resolve("acquisition/session-one/frame.csv").exists())

    finishFrameWrite.complete(Unit)
    runCurrent()
    val artifact = stop.await()
    val repeatedArtifact = session.stop(finishedAtMillis = 600)
    assertSame(artifact, repeatedArtifact)
    assertFalse(session.fail(CaptureFailure("CAMERA_INTERRUPTED", "相机已在完成后中断。")))
    assertEquals(null, session.terminalFailure)

    assertEquals("session-one", artifact.sessionId)
    assertEquals(listOf(SessionFileKind.PPG, SessionFileKind.FRAME), artifact.files.map { it.kind })
    val ppgFile = File(artifact.files.first { it.kind == SessionFileKind.PPG }.path)
    val frameFile = File(artifact.files.first { it.kind == SessionFileKind.FRAME }.path)
    assertTrue(ppgFile.isFile)
    assertTrue(frameFile.isFile)
    assertEquals(500L, artifact.finishedAtMillis)
    assertEquals(2, ppgFile.readLines().size)
    assertEquals(2, frameFile.readLines().size)
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
    session.offerPpgRecord(secondRecord.ppg, 2_000_000L)
    session.offerPpgRecord(firstRecord.ppg, 1_000_000L)

    val artifact = session.stop(finishedAtMillis = 500)
    val ppgFile = File(artifact.files.first { it.kind == SessionFileKind.PPG }.path)
    val frameFile = File(artifact.files.first { it.kind == SessionFileKind.FRAME }.path)

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

    assertFalse(firstArtifact.files.first { it.kind == SessionFileKind.PPG }.path == secondArtifact.files.first { it.kind == SessionFileKind.PPG }.path)
    assertEquals(2, File(firstArtifact.files.first { it.kind == SessionFileKind.PPG }.path).readLines().size)
    assertEquals(2, File(secondArtifact.files.first { it.kind == SessionFileKind.PPG }.path).readLines().size)
    assertTrue(File(firstArtifact.files.first { it.kind == SessionFileKind.FRAME }.path).isFile)
    assertTrue(File(secondArtifact.files.first { it.kind == SessionFileKind.FRAME }.path).isFile)
  }

  @Test
  fun queueCapacityFailureNeverReturnsACompletedArtifact() = runTest {
    val directory = Files.createTempDirectory("capture-overflow").toFile()
    val dispatcher = StandardTestDispatcher(testScheduler)
    val finishWrite = CompletableDeferred<Unit>()
    val session = session(directory, "overflow", dispatcher, capacity = 1, batchSize = 1) { file ->
      val delegate = PpgCsvWriter(file)
      object : PpgBatchWriter {
        override suspend fun writeBatch(records: List<CaptureRecord>) {
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
    assertFalse(File(directory.resolve("acquisition/overflow/ppg.csv").path).exists())
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
    assertFalse(directory.resolve("acquisition/pixel-failure/ppg.csv").exists())
  }

  @Test
  fun stopFailsBoundedlyWhenFormalFrameHasNoMatchingCameraResult() = runTest {
    val directory = Files.createTempDirectory("capture-unmatched").toFile()
    val dispatcher = StandardTestDispatcher(testScheduler)
    val session = session(directory, "unmatched", dispatcher)
    start(session)

    val frameIndex = session.beginFrame(101)
    val frameRecord = record(frameIndex)
    session.offerPpgRecord(frameRecord.ppg, checkNotNull(frameRecord.metadata.timestampFrameNanos))
    val stop = async { runCatching { session.stop(500) } }
    runCurrent()
    assertFalse(stop.isCompleted)

    advanceTimeBy(1_000)
    runCurrent()
    val outcome = stop.await()

    assertTrue(outcome.isFailure)
    assertEquals("FRAME_METADATA_UNMATCHED", (outcome.exceptionOrNull() as CaptureFailure).code)
    assertFalse(directory.resolve("acquisition/unmatched/ppg.csv").exists())
    assertFalse(directory.resolve("acquisition/unmatched/frame.csv").exists())
  }


  @Test
  fun writerFailureClosesResourcesAndDoesNotPromotePartialFile() = runTest {
    val directory = Files.createTempDirectory("capture-write-failure").toFile()
    val dispatcher = StandardTestDispatcher(testScheduler)
    var writerClosed = false
    val session = session(directory, "write-failure", dispatcher) { file ->
      val delegate = PpgCsvWriter(file)
      object : PpgBatchWriter {
        override suspend fun writeBatch(records: List<CaptureRecord>) {
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
    assertFalse(directory.resolve("acquisition/write-failure/ppg.csv").exists())
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
        val delegate = FrameCsvWriter(file)
        object : FrameBatchWriter {
          override suspend fun writeBatch(records: List<CaptureRecord>) {
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
    assertFalse(directory.resolve("acquisition/frame-write-failure/ppg.csv").exists())
    assertFalse(directory.resolve("acquisition/frame-write-failure/frame.csv").exists())
  }

  private suspend fun start(session: CaptureSession) {
    session.start(startedAtElapsedNanos = 100, startedAtMillis = 50)
  }

  private fun session(
    directory: File,
    id: String,
    dispatcher: TestDispatcher,
    capacity: Int = 4,
    batchSize: Int = 4,
    frameWriterFactory: (File) -> FrameBatchWriter = { FrameCsvWriter(it) },
    writerFactory: (File) -> PpgBatchWriter = { PpgCsvWriter(it) },
  ) = CaptureSession(
    filesDirectory = directory,
    sessionId = id,
    writerFactory = PpgBatchWriterFactory(writerFactory),
    frameWriterFactory = FrameBatchWriterFactory(frameWriterFactory),
    ioDispatcher = dispatcher,
    consumerDispatcher = dispatcher,
    capacity = capacity,
    batchSize = batchSize,
    flushIntervalMillis = 10_000,
  )

  private fun offerFrame(session: CaptureSession, frameIndex: Long) {
    val record = record(frameIndex)
    val sensorTimestampNanos = checkNotNull(record.metadata.timestampFrameNanos)
    session.offerPpgRecord(record.ppg, sensorTimestampNanos)
    session.offerCaptureMetadata(record.metadata)
  }

  private fun record(
    index: Long,
    timestampNanos: Long = (index + 1) * NANOS_PER_MILLISECOND,
  ) = CaptureRecord(
    ppg = PpgRecord(
      timestamp = index.toDouble(),
      timestampFrame = timestampNanos.toDouble() / NANOS_PER_MILLISECOND,
      timestampSystem = index.toDouble() + 2,
      avgY = 10.0,
      avgU = 127.0,
      avgV = 129.0,
      frameIndex = index,
      blockIndex = 0,
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
