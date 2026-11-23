/** 验证 RPPG 会话 DataHub 的容量、尾批与技术失败收尾。 */

package com.healthcvapp.acquisition.rppg.session

import com.healthcvapp.acquisition.camera.model.CameraConfig
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
import com.healthcvapp.acquisition.pipeline.DataHubOfferResult
import com.healthcvapp.acquisition.rppg.model.RPPGConfig
import com.healthcvapp.acquisition.rppg.model.RPPGInstantHeartRate
import com.healthcvapp.acquisition.rppg.model.RPPGPulseSample
import com.healthcvapp.acquisition.rppg.model.RPPGSessionDescriptor
import com.healthcvapp.acquisition.rppg.model.RPPGSessionFinalization
import com.healthcvapp.acquisition.rppg.model.RPPGSessionSource
import com.healthcvapp.acquisition.rppg.model.RPPGSignalStatus
import com.healthcvapp.acquisition.rppg.model.RPPGTerminationReason
import com.healthcvapp.acquisition.rppg.output.RPPGSessionOutput
import com.healthcvapp.acquisition.storage.AcquisitionPaths
import com.healthcvapp.acquisition.storage.csv.BatchWriter
import com.healthcvapp.acquisition.storage.csv.BatchWriterFactory
import java.io.File
import java.io.IOException
import java.nio.file.Files
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/** 使用真实会话输出验证队列关闭与文件可见性的关系。 */
class RPPGSessionRecordDataHubTest {
  @Test
  fun `in-flight write consumes capacity and overflow fails without complete metadata`() = runTest {
    withRoot { root ->
      val enteredWriter = CompletableDeferred<Unit>()
      val releaseWriter = CompletableDeferred<Unit>()
      val failures = mutableListOf<RPPGRecordPipelineFailure>()
      val sessionId = "capacity-session"
      val output = output(root, sessionId) {
        object : BatchWriter<RPPGPulseSample> {
          override suspend fun writeBatch(records: List<RPPGPulseSample>) {
            enteredWriter.complete(Unit)
            releaseWriter.await()
          }

          override fun close() = Unit
        }
      }
      output.open()
      val pipeline = RPPGSessionRecordDataHub(
        output = output,
        capacity = 1,
        batchSize = 1,
        intervalMillis = 60_000,
        consumerDispatcher = StandardTestDispatcher(testScheduler),
        onFailure = failures::add,
      )

      assertEquals(DataHubOfferResult.ACCEPTED, pipeline.offer(pulse(0L)))
      runCurrent()
      assertTrue(enteredWriter.isCompleted)
      assertEquals(DataHubOfferResult.CAPACITY_EXCEEDED, pipeline.offer(pulse(1L)))
      val failure = pipeline.failure as RPPGRecordPipelineFailure
      assertEquals("DATAHUB_CAPACITY_EXCEEDED", failure.code)
      assertEquals(listOf(failure), failures)

      releaseWriter.complete(Unit)
      val draining = async { runCatching { pipeline.closeAndDrain() } }
      runCurrent()
      assertSame(failure, draining.await().exceptionOrNull())
      assertSame(failure, runCatching { output.close(finalization()) }.exceptionOrNull())
      assertFalse(AcquisitionPaths(root).rppgPartialSessionJsonFile(sessionId).exists())
    }
  }

  @Test
  fun `consumer write failure reaches session and prevents final metadata`() = runTest {
    withRoot { root ->
      val writeFailure = IOException("disk full")
      val failures = mutableListOf<RPPGRecordPipelineFailure>()
      val sessionId = "write-failure-session"
      val output = output(root, sessionId) {
        object : BatchWriter<RPPGPulseSample> {
          override suspend fun writeBatch(records: List<RPPGPulseSample>) {
            throw writeFailure
          }

          override fun close() = Unit
        }
      }
      output.open()
      val pipeline = RPPGSessionRecordDataHub(
        output = output,
        capacity = 4,
        batchSize = 1,
        consumerDispatcher = StandardTestDispatcher(testScheduler),
        onFailure = failures::add,
      )

      assertEquals(DataHubOfferResult.ACCEPTED, pipeline.offer(pulse(0L)))
      runCurrent()
      val failure = pipeline.failure as RPPGRecordPipelineFailure
      assertEquals("FILE_WRITE_FAILED", failure.code)
      assertSame(writeFailure, failure.cause)
      assertEquals(listOf(failure), failures)

      val draining = async { runCatching { pipeline.closeAndDrain() } }
      runCurrent()
      assertSame(failure, draining.await().exceptionOrNull())
      assertTrue(runCatching { output.close(finalization()) }.exceptionOrNull() is IOException)
      assertFalse(AcquisitionPaths(root).rppgPartialSessionJsonFile(sessionId).exists())
    }
  }

  @Test
  fun `normal user stop drains the tail and writes an interrupted session`() = runTest {
    withRoot { root ->
      val sessionId = "user-stop-session"
      val paths = AcquisitionPaths(root)
      val output = output(root, sessionId)
      output.open()
      val pipeline = RPPGSessionRecordDataHub(
        output = output,
        capacity = 4,
        batchSize = 3,
        intervalMillis = 60_000,
        consumerDispatcher = StandardTestDispatcher(testScheduler),
      )
      assertEquals(DataHubOfferResult.ACCEPTED, pipeline.offer(pulse(0L)))

      val draining = async { pipeline.closeAndDrain() }
      runCurrent()
      draining.await()
      assertTrue(pipeline.failure == null)
      assertEquals(DataHubOfferResult.CLOSED, pipeline.offer(pulse(1L)))
      pipeline.closeAndDrain()
      output.close(
        finalization(
          termination = RPPGTerminationReason.USER_STOP,
          signalStatus = RPPGSignalStatus.NO_VALID_HEART_RATE,
        ),
      )

      assertEquals(
        listOf("segmentIndex,sampleIndex,timeMs,value", "0,0,0,0.25"),
        paths.rppgPartialPulseFile(sessionId).readLines(),
      )
      val metadata = paths.rppgPartialSessionJsonFile(sessionId).readText()
      assertTrue(metadata.contains("\"termination\":\"user_stop\""))
      assertTrue(metadata.contains("\"signalStatus\":\"no_valid_heart_rate\""))
      assertTrue(metadata.contains("\"pulseSamples\":1"))
      assertTrue(metadata.contains("\"complete\":true"))
    }
  }

  @Test
  fun `ordered tail preserves every beat in a batch without promoting spectral status`() = runTest {
    withRoot { root ->
      val sessionId = "beat-tail-session"
      val paths = AcquisitionPaths(root)
      val output = output(root, sessionId)
      output.open()
      val pipeline = RPPGSessionRecordDataHub(
        output = output,
        capacity = 8,
        batchSize = 8,
        intervalMillis = 60_000,
        consumerDispatcher = StandardTestDispatcher(testScheduler),
      )
      val secondPeak = SENSOR_TIME_ORIGIN + 1_000_000_000L
      val thirdPeak = secondPeak + 1_000_000_000L
      val records = listOf(
        RPPGPulseSample(0L, 0L, SENSOR_TIME_ORIGIN, 0.25),
        RPPGPulseSample(0L, 1L, secondPeak, 0.5),
        RPPGInstantHeartRate(0L, SENSOR_TIME_ORIGIN, secondPeak, 1_000_000_000L, 60.0),
        RPPGPulseSample(0L, 2L, thirdPeak, 0.75),
        RPPGInstantHeartRate(0L, secondPeak, thirdPeak, 1_000_000_000L, 60.0),
      )
      records.forEach { assertEquals(DataHubOfferResult.ACCEPTED, pipeline.offer(it)) }
      val draining = async { pipeline.closeAndDrain() }
      runCurrent()
      draining.await()
      output.close(finalization())
      assertEquals(
        listOf(
          "segmentIndex,previousPeakTimestampNs,peakTimestampNs,intervalNs,heartRateBpm",
          "0,$SENSOR_TIME_ORIGIN,$secondPeak,1000000000,60.0",
          "0,$secondPeak,$thirdPeak,1000000000,60.0",
        ),
        paths.rppgPartialBeatFile(sessionId).readLines(),
      )
      val metadata = paths.rppgPartialSessionJsonFile(sessionId).readText()
      assertTrue(metadata.contains("\"schemaVersion\":\"rppg-session-v2\""))
      assertTrue(metadata.contains("\"signalStatus\":\"no_valid_heart_rate\""))
      assertTrue(metadata.contains("\"heartRateWindows\":0,\"validHeartRateWindows\":0"))
    }
  }

  /** 构造带可替换脉搏 writer 的输出器。 */
  private fun output(
    root: File,
    sessionId: String,
    pulseWriter: (File) -> BatchWriter<RPPGPulseSample> = { file ->
      com.healthcvapp.acquisition.storage.AcquisitionFileStore()
        .createNewOutput(file)
        .let { stream ->
          com.healthcvapp.acquisition.storage.csv.CsvBatchWriter(
            stream,
            com.healthcvapp.acquisition.rppg.output.RPPGPulseCsvEncoder(SENSOR_TIME_ORIGIN),
          )
        }
    },
  ): RPPGSessionOutput = RPPGSessionOutput(
    filesDirectory = root,
    session = RPPGSessionDescriptor(
      schemaVersion = "rppg-session-v2",
      algorithmVersion = "rppg-realtime-v1",
      sessionId = sessionId,
      source = RPPGSessionSource.ACTIVE,
      sensorTimeOriginNanos = SENSOR_TIME_ORIGIN,
      startedAt = "2025-07-20T10:00:00Z",
      config = RPPGConfig.EXPERIMENTAL_V2,
    ),
    pulseWriterFactory = BatchWriterFactory(pulseWriter),
    ioDispatcher = Dispatchers.Unconfined,
  )

  /** 构造标注真实相机帧及 FPS 的正常结束信息。 */
  private fun finalization(
    termination: RPPGTerminationReason = RPPGTerminationReason.USER_STOP,
    signalStatus: RPPGSignalStatus = RPPGSignalStatus.NO_VALID_HEART_RATE,
  ) = RPPGSessionFinalization(
    finishedAt = "2025-07-20T10:00:05Z",
    termination = termination,
    signalStatus = signalStatus,
    cameraSummary = cameraSummary(),
  )

  /** 构造一条位于会话时间原点之后的有限脉搏样本。 */
  private fun pulse(sampleIndex: Long) = RPPGPulseSample(
    segmentIndex = 0L,
    sampleIndex = sampleIndex,
    timestampNanos = SENSOR_TIME_ORIGIN + sampleIndex * 50_000_000L,
    value = 0.25,
  )

  /** 构造最小有效相机协商摘要。 */
  private fun cameraSummary(): CameraConfigSummary {
    val cameraConfig = CameraConfig(
      cameraId = "front-0",
      targetResolution = CameraResolution(640.0, 480.0),
      targetFps = 30.0,
      torchEnabled = false,
      exposure = CameraExposureConfig(CameraExposureMode.AUTO, null, null, null, false),
      whiteBalance = CameraWhiteBalanceConfig(CameraWhiteBalanceMode.AUTO, false),
      focus = CameraFocusConfig(CameraFocusMode.AUTO, null),
    )
    return CameraConfigSummary(
      cameraId = "front-0",
      requestedConfig = cameraConfig,
      submittedConfig = cameraConfig,
      adjustments = emptyList(),
      actualFrame = CameraFrameGeometry(
        width = 640,
        height = 480,
        crop = CameraFrameCrop(0, 0, 640, 480),
        sensorOrientationDegrees = 90,
        mirrored = true,
      ),
      observedFps = 30.0,
    )
  }

  /** 在临时根目录运行并清理落盘文件。 */
  private inline fun withRoot(block: (File) -> Unit) {
    val root = Files.createTempDirectory("rppg-record-hub").toFile()
    try {
      block(root)
    } finally {
      root.deleteRecursively()
    }
  }

  private companion object {
    const val SENSOR_TIME_ORIGIN = 9_100_000_000_000_123L
  }
}
