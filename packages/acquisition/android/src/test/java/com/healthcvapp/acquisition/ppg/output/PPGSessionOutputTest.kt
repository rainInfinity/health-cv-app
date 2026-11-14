/** 验证双 CSV 输出在第二侧失败时收尾并保留原始原因。 */

package com.healthcvapp.acquisition.ppg.output

import com.healthcvapp.acquisition.camera.CameraFrameMetadata
import com.healthcvapp.acquisition.ppg.model.PPGCaptureRecord
import com.healthcvapp.acquisition.ppg.model.CameraBlockLayout
import com.healthcvapp.acquisition.ppg.model.PPGFrameRecord
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
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/** 覆盖打开、写入、关闭与双路径发布的次侧失败。 */
class PPGSessionOutputTest {
  @Test
  fun `second writer open failure closes first writer and preserves original cause`() = runTest {
    withRoot { root ->
      val openFailure = IOException("frame open failed")
      val ppgWriter = TrackingWriter()
      val output = PPGSessionOutput(
        filesDirectory = root,
        sessionId = "open-failure",
        ppgWriterFactory = BatchWriterFactory { ppgWriter },
        frameWriterFactory = BatchWriterFactory { throw openFailure },
        ioDispatcher = Dispatchers.Unconfined,
      )

      val thrown = runCatching { output.open() }.exceptionOrNull()
      output.close()

      assertSame(openFailure, thrown)
      assertEquals(1, ppgWriter.closeCount)
    }
  }

  @Test
  fun `second writer write failure still closes both writers`() = runTest {
    withRoot { root ->
      val writeFailure = IOException("frame write failed")
      val ppgWriter = TrackingWriter()
      val frameWriter = TrackingWriter(writeFailure = writeFailure)
      val output = output(root, "write-failure", ppgWriter, frameWriter)
      output.open()

      val thrown = runCatching { output.writeBatch(listOf(record())) }.exceptionOrNull()
      output.close()

      assertSame(writeFailure, thrown)
      assertEquals(1, ppgWriter.writeCount)
      assertEquals(1, frameWriter.writeCount)
      assertEquals(1, ppgWriter.closeCount)
      assertEquals(1, frameWriter.closeCount)
    }
  }

  @Test
  fun `second writer close failure is reported after both writers are closed`() = runTest {
    withRoot { root ->
      val closeFailure = IOException("frame close failed")
      val ppgWriter = TrackingWriter()
      val frameWriter = TrackingWriter(closeFailure = closeFailure)
      val output = output(root, "close-failure", ppgWriter, frameWriter)
      output.open()

      val thrown = runCatching { output.close() }.exceptionOrNull()
      output.close()

      assertSame(closeFailure, thrown)
      assertEquals(1, ppgWriter.closeCount)
      assertEquals(1, frameWriter.closeCount)
    }
  }

  @Test
  fun `second file promotion failure rolls back first and preserves occupied file`() = runTest {
    withRoot { root ->
      val sessionId = "promotion-failure"
      val paths = AcquisitionPaths(root)
      val output = PPGSessionOutput(root, sessionId, ioDispatcher = Dispatchers.Unconfined)
      output.open()
      output.close()
      paths.frameCompletedFile(sessionId).writeText("existing frame")

      val thrown = runCatching { output.publish(startedAtMillis = 10, finishedAtMillis = 20) }.exceptionOrNull()

      assertTrue(thrown is IOException)
      assertTrue(paths.ppgPartialFile(sessionId).isFile)
      assertFalse(paths.ppgCompletedFile(sessionId).exists())
      assertEquals("existing frame", paths.frameCompletedFile(sessionId).readText())
    }
  }

  private fun output(
    root: File,
    sessionId: String,
    ppgWriter: TrackingWriter,
    frameWriter: TrackingWriter,
  ) = PPGSessionOutput(
    filesDirectory = root,
    sessionId = sessionId,
    ppgWriterFactory = BatchWriterFactory { ppgWriter },
    frameWriterFactory = BatchWriterFactory { frameWriter },
    ioDispatcher = Dispatchers.Unconfined,
  )

  private fun record() = PPGCaptureRecord(
    ppg = PPGFrameRecord(
      timestamp = 1.0,
      timestampFrame = 2.0,
      timestampSystem = 3.0,
      frameIndex = 0,
      blockLayout = CameraBlockLayout(rows = 1, columns = 1),
      averagesYuv = doubleArrayOf(4.0, 5.0, 6.0),
    ),
    metadata = CameraFrameMetadata(1L, 1L, 1L, 1L, 1L, 1L, 1, 1),
  )

  private inline fun withRoot(block: (File) -> Unit) {
    val root = Files.createTempDirectory("ppg-session-output").toFile()
    try {
      block(root)
    } finally {
      root.deleteRecursively()
    }
  }

  private class TrackingWriter(
    private val writeFailure: IOException? = null,
    private val closeFailure: IOException? = null,
  ) : BatchWriter<PPGCaptureRecord> {
    var writeCount = 0
      private set
    var closeCount = 0
      private set

    override suspend fun writeBatch(records: List<PPGCaptureRecord>) {
      writeCount += 1
      writeFailure?.let { throw it }
    }

    override fun close() {
      closeCount += 1
      closeFailure?.let { throw it }
    }
  }
}
