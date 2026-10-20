/** 验证 frame.csv 旧版表头、时间单位、缺失值和批次顺序。 */

package com.healthcvapp.acquisition.writers

import com.healthcvapp.acquisition.camera.CameraFrameMetadata
import com.healthcvapp.acquisition.camera.CaptureRecord
import com.healthcvapp.acquisition.processing.PpgRecord
import java.nio.file.Files
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class FrameCsvWriterTest {
  @Test
  fun writesLegacyColumnsAndKeepsNanosecondFieldsAndFrameOrder() = runTest {
    val directory = Files.createTempDirectory("frame-writer").toFile()
    val file = directory.resolve("frame.csv.part")
    val writer = FrameCsvWriter(file)

    writer.writeBatch(listOf(record(3, 9_500_250_000L), record(4, 9_533_583_333L)))
    writer.close()

    assertEquals(
      listOf(
        "timestamp,timestampFrame,timestampSystem,exposureTime,durationTime,rollingShutterSkewTime,iso,whiteBalanceMode",
        "1000.5,9500.25,2000.75,8000000,33333333,0,0,2",
        "1000.5,9533.583333,2000.75,8000000,33333333,0,0,2",
      ),
      file.readLines(),
    )
  }

  private fun record(frameIndex: Long, sensorTimestampNanos: Long): CaptureRecord {
    val metadata = CameraFrameMetadata(
      timestampElapsedNanos = 1_000_500_000L,
      timestampFrameNanos = sensorTimestampNanos,
      timestampSystemNanos = 2_000_750_000L,
      exposureTimeNanos = 8_000_000L,
      durationTimeNanos = 33_333_333L,
      rollingShutterSkewTimeNanos = 0L,
      iso = 0,
      whiteBalanceMode = 2,
    )
    return CaptureRecord(
      ppg = PpgRecord(
        timestamp = 1_000.5,
        timestampFrame = sensorTimestampNanos / NANOS_PER_MILLISECOND,
        timestampSystem = 2_000.75,
        avgY = 10.0,
        avgU = 127.0,
        avgV = 129.0,
        frameIndex = frameIndex,
        blockIndex = 0,
      ),
      metadata = metadata,
    )
  }

  private companion object {
    const val NANOS_PER_MILLISECOND = 1_000_000.0
  }
}
