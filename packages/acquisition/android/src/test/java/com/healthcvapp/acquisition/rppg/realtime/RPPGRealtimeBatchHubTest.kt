/** 验证实时订阅的分段、尾批、丢批和持久化隔离。 */

package com.healthcvapp.acquisition.rppg.realtime

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
import com.healthcvapp.acquisition.rppg.model.RPPGPulseSample
import com.healthcvapp.acquisition.rppg.model.RPPGSessionDescriptor
import com.healthcvapp.acquisition.rppg.model.RPPGSessionFinalization
import com.healthcvapp.acquisition.rppg.model.RPPGSessionSource
import com.healthcvapp.acquisition.rppg.model.RPPGSignalStatus
import com.healthcvapp.acquisition.rppg.model.RPPGTerminationReason
import com.healthcvapp.acquisition.rppg.output.RPPGSessionOutput
import com.healthcvapp.acquisition.rppg.session.RPPGSessionRecordDataHub
import com.healthcvapp.acquisition.storage.AcquisitionPaths
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.async
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** 使用有界订阅与本地 CSV 验证实时展示不接管完整记录。 */
class RPPGRealtimeBatchHubTest {
  @Test
  fun `subscriber unsubscribe and no subscribers do not stop pulse persistence`() = runTest {
    withRoot { root ->
      val sessionId = "unsubscribed-session"
      val output = output(root, sessionId)
      output.open()
      val dispatcher = StandardTestDispatcher(testScheduler)
      val realtime = realtimeHub(sessionId, RPPGConfig.EXPERIMENTAL_V2, dispatcher)
      val observed = mutableListOf<RPPGRealtimeBatch>()
      val subscription = realtime.subscribe(observed::add)
      runCurrent()
      assertEquals(1, realtime.subscriberCount)
      subscription.close()
      runCurrent()
      assertEquals(0, realtime.subscriberCount)

      val pipeline = recordHub(output, realtime, dispatcher)
      (0L..2L).forEach { sampleIndex ->
        assertEquals(DataHubOfferResult.ACCEPTED, pipeline.offer(pulse(0L, sampleIndex)))
      }
      val draining = async { pipeline.closeAndDrain() }
      runCurrent()
      draining.await()
      output.close(finalization())

      assertTrue(observed.isEmpty())
      assertEquals(
        listOf(
          "segmentIndex,sampleIndex,timeMs,value",
          "0,0,0,0.1",
          "0,1,50,0.2",
          "0,2,100,0.30000000000000004",
        ),
        AcquisitionPaths(root).rppgPartialPulseFile(sessionId).readLines(),
      )
    }
  }

  @Test
  fun `slow subscriber drops only its own batches while fast subscriber and csv keep all samples`() = runTest {
    withRoot { root ->
      val sessionId = "slow-subscriber-session"
      val config = RPPGConfig.EXPERIMENTAL_V2.copy(realtimeBatchNanos = 50_000_000L)
      val output = output(root, sessionId, config)
      output.open()
      val dispatcher = StandardTestDispatcher(testScheduler)
      val realtime = realtimeHub(sessionId, config, dispatcher, bufferCapacity = 1)
      val pipeline = recordHub(output, realtime, dispatcher)
      val slowEntered = CompletableDeferred<Unit>()
      val releaseSlow = CompletableDeferred<Unit>()
      val slowBatches = mutableListOf<RPPGRealtimeBatch>()
      val fastBatches = mutableListOf<RPPGRealtimeBatch>()
      val slowSubscription = realtime.subscribe { batch ->
        slowBatches.add(batch)
        if (batch.sequence == 0L) {
          slowEntered.complete(Unit)
          releaseSlow.await()
        }
      }
      val fastSubscription = realtime.subscribe(fastBatches::add)
      runCurrent()

      (0L..3L).forEach { sampleIndex ->
        assertEquals(DataHubOfferResult.ACCEPTED, pipeline.offer(pulse(0L, sampleIndex)))
        runCurrent()
      }
      assertTrue(slowEntered.isCompleted)
      assertEquals(listOf(0L, 1L, 2L, 3L), fastBatches.map { it.sequence })
      assertEquals(listOf(0L), slowBatches.map { it.sequence })
      assertEquals(listOf(0.1, 0.2, 0.30000000000000004, 0.4), fastBatches.map { it.values.single() })
      assertTrue(fastBatches.all { it.sessionId == sessionId && it.segmentIndex == 0L })
      assertTrue(fastBatches.all { it.sampleIntervalMs == 50.0 })

      val draining = async { pipeline.closeAndDrain() }
      runCurrent()
      draining.await()
      releaseSlow.complete(Unit)
      runCurrent()
      assertEquals(listOf(0L, 3L), slowBatches.map { it.sequence })
      output.close(finalization())
      slowSubscription.close()
      fastSubscription.close()

      val csvRows = AcquisitionPaths(root).rppgPartialPulseFile(sessionId).readLines()
      assertEquals(5, csvRows.size)
      assertEquals(listOf("0.1", "0.2", "0.30000000000000004", "0.4"), csvRows.drop(1).map { it.substringAfterLast(',') })
    }
  }

  @Test
  fun `segment changes manual flush and close flush partial batches without crossing segments`() = runTest {
    val sessionId = "segment-batches"
    val realtime = realtimeHub(sessionId, RPPGConfig.EXPERIMENTAL_V2, StandardTestDispatcher(testScheduler))
    val batches = mutableListOf<RPPGRealtimeBatch>()
    val subscription = realtime.subscribe(batches::add)
    runCurrent()

    realtime.offer(pulse(0L, 0L))
    realtime.offer(pulse(0L, 1L))
    realtime.flushPending()
    realtime.offer(pulse(0L, 2L))
    realtime.offer(pulse(1L, 3L))
    realtime.close()
    runCurrent()

    assertEquals(listOf(0L, 1L, 2L), batches.map { it.sequence })
    assertEquals(listOf(0L, 0L, 1L), batches.map { it.segmentIndex })
    assertEquals(listOf(0.0, 100.0, 150.0), batches.map { it.startTimeMs })
    assertEquals(listOf(listOf(0.1, 0.2), listOf(0.30000000000000004), listOf(0.4)), batches.map { it.values })
    assertTrue(batches.all { it.values.isNotEmpty() })
    subscription.close()
  }

  /** 构造独立配置的实时展示队列。 */
  private fun realtimeHub(
    sessionId: String,
    config: RPPGConfig,
    dispatcher: CoroutineDispatcher,
    bufferCapacity: Int = 4,
  ) = RPPGRealtimeBatchHub(
    sessionId = sessionId,
    sensorTimeOriginNanos = SENSOR_TIME_ORIGIN,
    config = config,
    subscriberBufferCapacity = bufferCapacity,
    subscriberDispatcher = dispatcher,
  )

  /** 构造将完整记录送入 DataHub 并可选分发同源波形的流水线。 */
  private fun recordHub(
    output: RPPGSessionOutput,
    realtime: RPPGRealtimeBatchHub,
    dispatcher: CoroutineDispatcher,
  ) = RPPGSessionRecordDataHub(
    output = output,
    capacity = 8,
    batchSize = 1,
    intervalMillis = 60_000,
    consumerDispatcher = dispatcher,
    realtimeBatchHub = realtime,
  )

  /** 构造以指定算法参数打开的会话输出。 */
  private fun output(root: File, sessionId: String, config: RPPGConfig = RPPGConfig.EXPERIMENTAL_V2) =
    RPPGSessionOutput(
      filesDirectory = root,
      session = RPPGSessionDescriptor(
        schemaVersion = "rppg-session-v2",
        algorithmVersion = "rppg-realtime-v1",
        sessionId = sessionId,
        source = RPPGSessionSource.ACTIVE,
        sensorTimeOriginNanos = SENSOR_TIME_ORIGIN,
        startedAt = "2025-07-20T10:00:00Z",
        config = config,
      ),
      ioDispatcher = kotlinx.coroutines.Dispatchers.Unconfined,
    )

  /** 构造有实际相机摘要的合法无有效 HR 结束状态。 */
  private fun finalization() = RPPGSessionFinalization(
    finishedAt = "2025-07-20T10:00:05Z",
    termination = RPPGTerminationReason.USER_STOP,
    signalStatus = RPPGSignalStatus.NO_VALID_HEART_RATE,
    cameraSummary = cameraSummary(),
  )

  /** 构造时间递增且片段、序号可控的有限样本。 */
  private fun pulse(segmentIndex: Long, sampleIndex: Long) = RPPGPulseSample(
    segmentIndex = segmentIndex,
    sampleIndex = sampleIndex,
    timestampNanos = SENSOR_TIME_ORIGIN + sampleIndex * 50_000_000L,
    value = 0.1 * (sampleIndex + 1L),
  )

  /** 构造实际帧尺寸、方向和观测 FPS。 */
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

  /** 在本地临时目录运行并清理测试产物。 */
  private inline fun withRoot(block: (File) -> Unit) {
    val root = Files.createTempDirectory("rppg-realtime-batches").toFile()
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
