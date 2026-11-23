/** 验证 RPPG 目录原子发布、重开扫描、来源过滤和失败保留。 */

package com.healthcvapp.acquisition.rppg.output

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
import com.healthcvapp.acquisition.rppg.model.RPPGArtifactFileKind
import com.healthcvapp.acquisition.rppg.model.RPPGConfig
import com.healthcvapp.acquisition.rppg.model.RPPGSessionDescriptor
import com.healthcvapp.acquisition.rppg.model.RPPGSessionFinalization
import com.healthcvapp.acquisition.rppg.model.RPPGSessionSource
import com.healthcvapp.acquisition.rppg.model.RPPGSignalStatus
import com.healthcvapp.acquisition.rppg.model.RPPGTerminationReason
import com.healthcvapp.acquisition.storage.AcquisitionPaths
import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.util.concurrent.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** 通过真实本地目录验证已发布产物与临时结果的可见性边界。 */
class RPPGArtifactStoreTest {
  @Test
  fun `publishes complete directory and a new store discovers sources`() = runTest {
    withRoot { root ->
      val store = RPPGArtifactStore(root)
      val paths = AcquisitionPaths(root)
      writeCompleteOutput(root, "active-session", RPPGSessionSource.ACTIVE)
      val active = store.publish("active-session")

      assertFalse(paths.rppgPartialSessionDirectory("active-session").exists())
      assertTrue(paths.rppgSessionDirectory("active-session").isDirectory)
      assertEquals(
        listOf(
          RPPGArtifactFileKind.SESSION_JSON,
          RPPGArtifactFileKind.PULSE,
          RPPGArtifactFileKind.HEART_RATE,
          RPPGArtifactFileKind.INSTANT_HEART_RATE,
        ),
        active.files.map { it.kind },
      )
      assertTrue(active.files.all { File(it.path).isFile && it.sizeBytes > 0L })
      assertEquals(listOf(active), RPPGArtifactStore(root).listArtifacts())

      writeCompleteOutput(root, "passive-session", RPPGSessionSource.PASSIVE)
      val passive = store.publish("passive-session")
      assertEquals(listOf(active), store.listArtifacts())
      assertEquals(listOf(passive), store.listArtifacts(RPPGSessionSource.PASSIVE))
      assertEquals(listOf(active, passive), store.listArtifacts(source = null))
    }
  }

  @Test
  fun `temporary and incomplete final directories remain invisible`() = runTest {
    withRoot { root ->
      val store = RPPGArtifactStore(root)
      val paths = AcquisitionPaths(root)
      val sessionId = "unfinished-session"
      writeCompleteOutput(root, sessionId, RPPGSessionSource.ACTIVE)

      assertTrue(store.listArtifacts().isEmpty())
      val metadata = paths.rppgPartialSessionJsonFile(sessionId)
      metadata.writeText(metadata.readText().replace("\"complete\":true", "\"complete\":false"))
      assertThrows(IOException::class.java) { store.publish(sessionId) }
      assertFalse(paths.rppgSessionDirectory(sessionId).exists())
      assertTrue(paths.rppgPartialSessionDirectory(sessionId).isDirectory)

      val publishedId = "missing-file-session"
      writeCompleteOutput(root, publishedId, RPPGSessionSource.ACTIVE)
      store.publish(publishedId)
      assertTrue(paths.rppgHeartRateFile(publishedId).delete())
      assertTrue(store.listArtifacts().isEmpty())
    }
  }

  @Test
  fun `publication failure and duplicate session preserve previous result`() = runTest {
    withRoot { root ->
      val store = RPPGArtifactStore(root)
      val paths = AcquisitionPaths(root)
      val sessionId = "history-session"
      writeCompleteOutput(root, sessionId, RPPGSessionSource.ACTIVE)
      val original = store.publish(sessionId)
      val originalMetadata = paths.rppgSessionJsonFile(sessionId).readText()
      val originalPulse = paths.rppgPulseFile(sessionId).readText()

      writeCompleteOutput(root, sessionId, RPPGSessionSource.PASSIVE)
      assertThrows(IOException::class.java) { store.publish(sessionId) }
      assertEquals(originalMetadata, paths.rppgSessionJsonFile(sessionId).readText())
      assertEquals(originalPulse, paths.rppgPulseFile(sessionId).readText())
      assertEquals(listOf(original), store.listArtifacts())

      val cancelledId = "cancelled-session"
      writeCompleteOutput(root, cancelledId, RPPGSessionSource.ACTIVE)
      assertThrows(CancellationException::class.java) {
        store.publish(cancelledId) { false }
      }
      assertTrue(paths.rppgPartialSessionDirectory(cancelledId).isDirectory)
      assertFalse(paths.rppgSessionDirectory(cancelledId).exists())
      assertEquals(listOf(original), store.listArtifacts())
    }
  }

  @Test
  fun `legacy v1 triplet stays queryable without fabricating beat file`() = runTest {
    withRoot { root ->
      val paths = AcquisitionPaths(root)
      val sessionId = "legacy-v1"
      writeCompleteOutput(root, sessionId, RPPGSessionSource.PASSIVE, schemaVersion = "rppg-session-v1")
      val artifact = RPPGArtifactStore(root).publish(sessionId)
      assertEquals("2025-07-20T10:00:00Z", artifact.startedAt)
      assertEquals(
        listOf(RPPGArtifactFileKind.SESSION_JSON, RPPGArtifactFileKind.PULSE, RPPGArtifactFileKind.HEART_RATE),
        artifact.files.map { it.kind },
      )
      assertFalse(paths.rppgBeatFile(sessionId).exists())
      assertEquals(listOf(artifact), RPPGArtifactStore(root).listArtifacts(RPPGSessionSource.PASSIVE))
    }
  }

  @Test
  fun `v2 missing beat file cannot publish and becomes invisible after loss`() = runTest {
    withRoot { root ->
      val paths = AcquisitionPaths(root)
      val store = RPPGArtifactStore(root)
      val incomplete = "missing-beat-before-publish"
      writeCompleteOutput(root, incomplete, RPPGSessionSource.ACTIVE)
      assertTrue(paths.rppgPartialBeatFile(incomplete).delete())
      assertThrows(IOException::class.java) { store.publish(incomplete) }
      assertFalse(paths.rppgSessionDirectory(incomplete).exists())
      assertTrue(paths.rppgPartialSessionDirectory(incomplete).isDirectory)

      val published = "missing-beat-after-publish"
      writeCompleteOutput(root, published, RPPGSessionSource.ACTIVE)
      store.publish(published)
      assertTrue(paths.rppgBeatFile(published).delete())
      assertTrue(RPPGArtifactStore(root).listArtifacts().isEmpty())
    }
  }

  @Test
  fun `history sorts by session start rather than identifier with stable ties`() = runTest {
    withRoot { root ->
      val store = RPPGArtifactStore(root)
      writeCompleteOutput(root, "z-oldest", RPPGSessionSource.PASSIVE, startedAt = "2025-07-20T10:00:00Z")
      writeCompleteOutput(root, "a-latest", RPPGSessionSource.PASSIVE, startedAt = "2025-07-20T10:00:01.000Z")
      writeCompleteOutput(root, "m-same-time-b", RPPGSessionSource.PASSIVE, startedAt = "2025-07-20T10:00:00.100Z")
      writeCompleteOutput(root, "m-same-time-a", RPPGSessionSource.PASSIVE, startedAt = "2025-07-20T10:00:00.1Z")
      listOf("a-latest", "m-same-time-b", "z-oldest", "m-same-time-a").forEach { store.publish(it) }
      assertEquals(
        listOf("z-oldest", "m-same-time-a", "m-same-time-b", "a-latest"),
        RPPGArtifactStore(root).listArtifacts(RPPGSessionSource.PASSIVE).map { it.sessionId },
      )
    }
  }

  /** 打开并定稿无波形会话，保留当前格式要求的仅含表头 CSV。 */
  private suspend fun writeCompleteOutput(
    root: File,
    sessionId: String,
    source: RPPGSessionSource,
    schemaVersion: String = "rppg-session-v2",
    startedAt: String = "2025-07-20T10:00:00Z",
  ) {
    val output = RPPGSessionOutput(
      filesDirectory = root,
      session = RPPGSessionDescriptor(
        schemaVersion = schemaVersion,
        algorithmVersion = "rppg-realtime-v1",
        sessionId = sessionId,
        source = source,
        sensorTimeOriginNanos = SENSOR_TIME_ORIGIN,
        startedAt = startedAt,
        config = RPPGConfig.EXPERIMENTAL_V2,
      ),
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
  }

  /** 构造相机实际帧摘要，避免测试把请求尺寸当成实际尺寸。 */
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

  /** 在真实临时根目录运行并清理所有会话文件。 */
  private inline fun withRoot(block: (File) -> Unit) {
    val root = Files.createTempDirectory("rppg-artifact-store").toFile()
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
