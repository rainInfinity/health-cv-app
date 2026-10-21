/** 验证传感器 CSV 临时文件、完成发布和失败隔离。 */

package com.healthcvapp.acquisition.sensors.output

import com.healthcvapp.acquisition.sensors.model.SensorCaptureFailure
import com.healthcvapp.acquisition.sensors.model.SensorConfig
import com.healthcvapp.acquisition.sensors.model.SensorKind
import com.healthcvapp.acquisition.sensors.model.SensorSample
import com.healthcvapp.acquisition.storage.AcquisitionFileStore
import com.healthcvapp.acquisition.storage.AcquisitionPaths
import com.healthcvapp.acquisition.storage.csv.BatchWriter
import com.healthcvapp.acquisition.storage.csv.BatchWriterFactory
import java.io.File
import java.io.IOException
import java.nio.file.Files
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** 在真实临时目录中验证不同类型和会话均独立发布。 */
class SensorSessionOutputTest {
  @Test
  fun `writes every type header and axis values to isolated session files`() = runTest {
    withTemporaryDirectory { root ->
      val outputs = SensorKind.entries.associateWith { kind -> output(root, kind, "session-1") }
      val nextSession = output(root, SensorKind.ACCELEROMETER, "session-2")
      val allOutputs = outputs.values + nextSession
      allOutputs.forEach { current ->
        current.open()
        current.writeBatch(listOf(sample()))
        current.close()
      }
      val artifacts = outputs.mapValues { (_, current) -> current.publish(10L, 20L) }
      val nextArtifact = nextSession.publish(10L, 20L)
      val expectedHeaders = mapOf(
        SensorKind.ACCELEROMETER to "timestamp,timestampEvent,timestampSystem,accX,accY,accZ",
        SensorKind.GYROSCOPE to "timestamp,timestampEvent,timestampSystem,gyrX,gyrY,gyrZ",
        SensorKind.MAGNETOMETER to "timestamp,timestampEvent,timestampSystem,magX,magY,magZ",
        SensorKind.GRAVITY to "timestamp,timestampEvent,timestampSystem,graX,graY,graZ",
      )

      val paths = artifacts.values.map { artifact ->
        val lines = File(artifact.path).readLines()
        assertEquals(1L, artifact.sampleCount)
        assertEquals(expectedHeaders.getValue(artifact.kind), lines[0])
        assertEquals("2000.001234,2000.002345,2000.003456,11.25,22.5,33.75", lines[1])
        artifact.path
      }
      assertEquals(4, paths.toSet().size)
      assertFalse(paths.contains(nextArtifact.path))
      assertEquals(1L, nextArtifact.sampleCount)
    }
  }

  @Test
  fun `rejects empty sessions without promoting a header only file`() = runTest {
    withTemporaryDirectory { root ->
      val current = output(root, SensorKind.GRAVITY, "empty-session")
      current.open()
      current.close()

      val error = assertThrows(SensorCaptureFailure::class.java) { current.publish(1L, 2L) }
      val paths = AcquisitionPaths(root)
      assertEquals("SENSOR_NO_SAMPLES", error.code)
      assertTrue(paths.sensorPartialFile(SensorKind.GRAVITY, "empty-session").isFile)
      assertFalse(paths.sensorCompletedFile(SensorKind.GRAVITY, "empty-session").exists())
    }
  }

  @Test
  fun `refuses to overwrite an existing completion path`() = runTest {
    withTemporaryDirectory { root ->
      val current = output(root, SensorKind.MAGNETOMETER, "existing-session")
      current.open()
      current.writeBatch(listOf(sample()))
      current.close()
      val completed = AcquisitionPaths(root).sensorCompletedFile(SensorKind.MAGNETOMETER, "existing-session")
      completed.parentFile?.mkdirs()
      completed.writeText("keep")

      val error = assertThrows(SensorCaptureFailure::class.java) { current.publish(1L, 2L) }

      assertEquals("FILE_FINALIZATION_FAILED", error.code)
      assertEquals("keep", completed.readText())
      assertTrue(AcquisitionPaths(root).sensorPartialFile(SensorKind.MAGNETOMETER, "existing-session").isFile)
    }
  }

  @Test
  fun `a writer close failure prevents publication`() = runTest {
    withTemporaryDirectory { root ->
      val fileStore = AcquisitionFileStore()
      val factory = BatchWriterFactory<SensorSample> { file ->
        val stream = fileStore.createNewOutput(file)
        object : BatchWriter<SensorSample> {
          override suspend fun writeBatch(records: List<SensorSample>) = Unit
          override fun close() {
            stream.close()
            throw IOException("close failed")
          }
        }
      }
      val current = SensorSessionOutput(
        filesDirectory = root,
        kind = SensorKind.ACCELEROMETER,
        sessionId = "close-failure",
        config = config(SensorKind.ACCELEROMETER),
        writerFactory = factory,
        ioDispatcher = Dispatchers.Unconfined,
      )
      current.open()
      current.writeBatch(listOf(sample()))

      val closeError = try {
        current.close()
        throw AssertionError("关闭失败必须阻止产物发布。")
      } catch (error: SensorCaptureFailure) {
        error
      }
      val error = assertThrows(SensorCaptureFailure::class.java) { current.publish(1L, 2L) }

      assertEquals("FILE_FINALIZATION_FAILED", closeError.code)
      assertEquals("FILE_FINALIZATION_FAILED", error.code)
      assertFalse(AcquisitionPaths(root).sensorCompletedFile(SensorKind.ACCELEROMETER, "close-failure").exists())
    }
  }

  /** 使用固定类型和合法采样间隔构造输出。 */
  private fun output(root: File, kind: SensorKind, sessionId: String) = SensorSessionOutput(
    filesDirectory = root,
    kind = kind,
    sessionId = sessionId,
    config = config(kind),
    ioDispatcher = Dispatchers.Unconfined,
  )

  /** 构造通过配置边界验证的请求。 */
  private fun config(kind: SensorKind) = SensorConfig.fromRequest(kind.wireName, 20_000.0)

  /** 构造三种时间和三轴均互异的有效样本。 */
  private fun sample() = SensorSample(2_000_001_234, 2_000_002_345, 2_000_003_456, 11.25f, 22.5f, 33.75f)

  /** 在临时根目录运行文件行为并清理测试产物。 */
  private inline fun withTemporaryDirectory(block: (File) -> Unit) {
    val root = Files.createTempDirectory("sensor-session-output").toFile()
    try {
      block(root)
    } finally {
      root.deleteRecursively()
    }
  }
}
