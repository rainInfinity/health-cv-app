/** 验证 CSV 写入器按批次顺序追加八列并在关闭后可读。 */

package com.healthcvapp.acquisition.writers

import com.healthcvapp.acquisition.camera.CameraFrameMetadata
import com.healthcvapp.acquisition.camera.CaptureRecord
import com.healthcvapp.acquisition.processing.PpgRecord
import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlinx.coroutines.test.runTest

class PpgCsvWriterTest {
  @Test
  fun writesOrderedRowsAcrossBatchesAndClosesReadableUtf8File() = runTest {
    val directory = Files.createTempDirectory("ppg-writer").toFile()
    val file = directory.resolve("ppg.csv.part")
    val writer = PpgCsvWriter(file)

    writer.writeBatch(listOf(record(1, 1.25), record(2, 2.5)))
    writer.writeBatch(listOf(record(3, 3.75)))
    writer.close()

    assertEquals(
      listOf(
        "timestamp,timestampFrame,timestampSystem,avgY,avgU,avgV,frameIndex,blockIndex",
        "1.25,2.5,3.75,10.0,128.0,129.0,1,0",
        "2.5,3.75,5.0,10.0,128.0,129.0,2,0",
        "3.75,5.0,6.25,10.0,128.0,129.0,3,0",
      ),
      file.readLines(),
    )
    writer.close()
    assertTrue(runCatching { writer.writeBatch(listOf(record(4, 4.0))) }.exceptionOrNull() is java.io.IOException)
  }

  private fun record(index: Long, timestamp: Double) = CaptureRecord(
    ppg = PpgRecord(
      timestamp = timestamp,
      timestampFrame = timestamp + 1.25,
      timestampSystem = timestamp + 2.5,
      avgY = 10.0,
      avgU = 128.0,
      avgV = 129.0,
      frameIndex = index,
      blockIndex = 0,
    ),
    metadata = CameraFrameMetadata(
      timestampElapsedNanos = (timestamp * NANOS_PER_MILLISECOND).toLong(),
      timestampFrameNanos = ((timestamp + 1.25) * NANOS_PER_MILLISECOND).toLong(),
      timestampSystemNanos = ((timestamp + 2.5) * NANOS_PER_MILLISECOND).toLong(),
      exposureTimeNanos = 5_000_000L,
      durationTimeNanos = 33_000_000L,
      rollingShutterSkewTimeNanos = 2_000_000L,
      iso = 100,
      whiteBalanceMode = 1,
    ),
  )

  private companion object {
    const val NANOS_PER_MILLISECOND = 1_000_000.0
  }
}
