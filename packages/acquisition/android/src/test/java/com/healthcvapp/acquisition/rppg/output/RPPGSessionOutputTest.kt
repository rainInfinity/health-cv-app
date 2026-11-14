/** 验证 RPPG 三件套的 CSV 数值、空值及统一采集时间轴。 */

package com.healthcvapp.acquisition.rppg.output

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
import com.healthcvapp.acquisition.rppg.model.RPPGConfig
import com.healthcvapp.acquisition.rppg.model.RPPGHeartRateWindow
import com.healthcvapp.acquisition.rppg.model.RPPGPulseSample
import com.healthcvapp.acquisition.rppg.model.RPPGSessionDescriptor
import com.healthcvapp.acquisition.rppg.model.RPPGSessionFinalization
import com.healthcvapp.acquisition.rppg.model.RPPGSessionSource
import com.healthcvapp.acquisition.rppg.model.RPPGSignalStatus
import com.healthcvapp.acquisition.rppg.model.RPPGTerminationReason
import com.healthcvapp.acquisition.storage.AcquisitionPaths
import java.io.File
import java.math.BigDecimal
import java.nio.file.Files
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** 使用真实临时文件验证三份结果能恢复采集时序和来源。 */
class RPPGSessionOutputTest {
  @Test
  fun `writes finite pulse and nullable heart rate rows on one exact sensor timeline`() = runTest {
    withRoot { root ->
      val origin = 9_100_000_000_000_123L
      val firstPulseTime = origin + 1_234_567L
      val secondPulseTime = origin + 51_234_567L
      val thirdPulseTime = origin + 101_234_567L
      val sessionId = "timeline-session"
      val paths = AcquisitionPaths(root)
      val output = RPPGSessionOutput(
        filesDirectory = root,
        session = descriptor(sessionId, RPPGSessionSource.PASSIVE, origin),
        ioDispatcher = Dispatchers.Unconfined,
      )
      output.open()
      output.writeBatch(
        listOf(
          RPPGPulseSample(3L, 10L, firstPulseTime, 0.125),
          RPPGPulseSample(3L, 11L, secondPulseTime, -0.25),
          RPPGHeartRateWindow(3L, firstPulseTime, secondPulseTime, 75.5, true, null, 5.25),
          RPPGHeartRateWindow(3L, origin + 2_234_567L, thirdPulseTime, null, false, "LOW_SNR", null),
          RPPGPulseSample(3L, 12L, thirdPulseTime, 0.5),
          RPPGPulseSample(5L, 13L, origin + 151_234_567L, 0.75),
        ),
      )
      output.close(
        RPPGSessionFinalization(
          finishedAt = "2025-07-20T10:00:30Z",
          termination = RPPGTerminationReason.TARGET_DURATION,
          signalStatus = RPPGSignalStatus.VALID_HEART_RATE,
          cameraSummary = cameraSummary(),
        ),
      )

      val pulseFile = paths.rppgPartialPulseFile(sessionId)
      val heartRateFile = paths.rppgPartialHeartRateFile(sessionId)
      val sessionFile = paths.rppgPartialSessionJsonFile(sessionId)
      val pulseRows = pulseFile.readLines()
      val heartRateRows = heartRateFile.readLines()
      val sessionJson = sessionFile.readText()

      assertEquals(
        listOf(
          "segmentIndex,sampleIndex,timeMs,value",
          "3,10,1.234567,0.125",
          "3,11,51.234567,-0.25",
          "3,12,101.234567,0.5",
          "5,13,151.234567,0.75",
        ),
        pulseRows,
      )
      assertEquals(
        listOf(
          "segmentIndex,windowStartNs,windowEndNs,heartRateBpm,valid,reason,spectralSnrDb",
          "3,$firstPulseTime,$secondPulseTime,75.5,true,,5.25",
          "3,${origin + 2_234_567L},$thirdPulseTime,,false,LOW_SNR,",
        ),
        heartRateRows,
      )
      assertFalse(sessionJson.contains("NaN"))
      assertFalse(sessionJson.contains("Infinity"))
      assertTrue(sessionJson.contains("\"sensorTimeOriginNs\":\"$origin\""))
      assertTrue(sessionJson.contains("\"source\":\"passive\""))
      assertTrue(sessionJson.contains("\"observedFps\":24.0"))
      assertTrue(sessionJson.contains("\"targetFps\":30.0"))
      assertTrue(sessionJson.contains("\"width\":320"))
      assertTrue(
        sessionJson.contains(
          "\"sampleCounts\":{\"pulseSamples\":4,\"heartRateWindows\":2," +
            "\"validHeartRateWindows\":1,\"rejectedHeartRateWindows\":1}",
        ),
      )
      assertTrue(sessionJson.contains("\"firstSampleIndex\":10"))
      assertTrue(sessionJson.contains("\"lastSampleIndex\":12"))
      assertTrue(sessionJson.contains("\"firstTimeNs\":\"$firstPulseTime\""))
      assertTrue(sessionJson.contains("\"lastTimeNs\":\"$thirdPulseTime\""))
      assertTrue(
        sessionJson.contains(
          "\"segmentRanges\":[{\"segmentIndex\":3,\"firstSampleIndex\":10,\"lastSampleIndex\":12," +
            "\"firstTimeNs\":\"$firstPulseTime\",\"lastTimeNs\":\"$thirdPulseTime\",\"sampleCount\":3}," +
            "{\"segmentIndex\":5,\"firstSampleIndex\":13,\"lastSampleIndex\":13," +
            "\"firstTimeNs\":\"${origin + 151_234_567L}\",\"lastTimeNs\":\"${origin + 151_234_567L}\"," +
            "\"sampleCount\":1}]",
        ),
      )
      assertTrue(sessionJson.contains("\"complete\":true"))
      assertFalse(paths.rppgSessionDirectory(sessionId).exists())

      val serializedOrigin = Regex("\\\"sensorTimeOriginNs\\\":\\\"([0-9]+)\\\"")
        .find(sessionJson)!!.groupValues[1].toLong()
      val reconstructedFirstPulse = serializedOrigin + BigDecimal(pulseRows[1].split(',')[2])
        .movePointRight(6)
        .longValueExact()
      assertEquals(firstPulseTime, reconstructedFirstPulse)
      assertEquals(firstPulseTime, heartRateRows[1].split(',')[1].toLong())
      assertEquals(secondPulseTime, heartRateRows[1].split(',')[2].toLong())
    }
  }

  @Test
  fun `empty result keeps header-only csv and preserves active and passive source`() = runTest {
    withRoot { root ->
      listOf(RPPGSessionSource.ACTIVE, RPPGSessionSource.PASSIVE).forEach { source ->
        val sessionId = "empty-${source.wireValue}"
        val paths = AcquisitionPaths(root)
        val output = RPPGSessionOutput(
          filesDirectory = root,
          session = descriptor(sessionId, source, SENSOR_TIME_ORIGIN),
          ioDispatcher = Dispatchers.Unconfined,
        )
        output.open()
        output.close(
          RPPGSessionFinalization(
            finishedAt = "2025-07-20T10:00:05Z",
            termination = RPPGTerminationReason.OBSERVATION_TIMEOUT,
            signalStatus = RPPGSignalStatus.NO_WAVEFORM,
            cameraSummary = cameraSummary(),
          ),
        )

        assertEquals(listOf("segmentIndex,sampleIndex,timeMs,value"), paths.rppgPartialPulseFile(sessionId).readLines())
        assertEquals(
          listOf("segmentIndex,windowStartNs,windowEndNs,heartRateBpm,valid,reason,spectralSnrDb"),
          paths.rppgPartialHeartRateFile(sessionId).readLines(),
        )
        assertTrue(paths.rppgPartialSessionJsonFile(sessionId).readText().contains("\"source\":\"${source.wireValue}\""))
        assertTrue(paths.rppgPartialSessionJsonFile(sessionId).readText().contains("\"signalStatus\":\"no_waveform\""))
      }
    }
  }

  @Test
  fun `records reject non-finite amplitudes and zero as an invalid heart rate`() {
    assertThrows(IllegalArgumentException::class.java) {
      RPPGPulseSample(0L, 0L, SENSOR_TIME_ORIGIN, Double.NaN)
    }
    assertThrows(IllegalArgumentException::class.java) {
      RPPGHeartRateWindow(0L, SENSOR_TIME_ORIGIN, SENSOR_TIME_ORIGIN, 0.0, false, "LOW_SNR", null)
    }
  }

  /** 构造包含请求值、实际帧几何与实测 FPS 差异的相机摘要。 */
  private fun cameraSummary(): CameraConfigSummary {
    val requested = CameraConfig(
      cameraId = "front-0",
      targetResolution = CameraResolution(640.0, 480.0),
      targetFps = 30.0,
      torchEnabled = false,
      exposure = CameraExposureConfig(CameraExposureMode.AUTO, null, null, null, false),
      whiteBalance = CameraWhiteBalanceConfig(CameraWhiteBalanceMode.AUTO, false),
      focus = CameraFocusConfig(CameraFocusMode.AUTO, null),
    )
    val submitted = requested.copy(
      targetResolution = CameraResolution(320.0, 240.0),
      targetFps = 24.0,
    )
    return CameraConfigSummary(
      cameraId = "front-0",
      requestedConfig = requested,
      submittedConfig = submitted,
      adjustments = listOf(
        CameraConfigAdjustment("targetResolution", "640x480", "320x240", "unsupported size"),
      ),
      actualFrame = CameraFrameGeometry(
        width = 320,
        height = 240,
        crop = CameraFrameCrop(0, 0, 320, 240),
        sensorOrientationDegrees = 90,
        mirrored = true,
      ),
      observedFps = 24.0,
    )
  }

  /** 构造使用显式配置快照和时间原点的会话描述。 */
  private fun descriptor(
    sessionId: String,
    source: RPPGSessionSource,
    origin: Long,
  ) = RPPGSessionDescriptor(
    schemaVersion = "rppg-session-v1",
    algorithmVersion = "rppg-realtime-v1",
    sessionId = sessionId,
    source = source,
    sensorTimeOriginNanos = origin,
    startedAt = "2025-07-20T10:00:00Z",
    config = RPPGConfig.EXPERIMENTAL_V1,
  )

  /** 在真实临时根目录中运行用例并清理生成文件。 */
  private inline fun withRoot(block: (File) -> Unit) {
    val root = Files.createTempDirectory("rppg-session-output").toFile()
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
