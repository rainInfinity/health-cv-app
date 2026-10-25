/** 验证 frame CSV 编码器保留列顺序、时间单位和缺失值含义。 */

package com.healthcvapp.acquisition.ppg.output

import com.healthcvapp.acquisition.ppg.camera.CameraFrameMetadata
import com.healthcvapp.acquisition.ppg.model.CameraBlockLayout
import com.healthcvapp.acquisition.ppg.model.PPGCaptureRecord
import com.healthcvapp.acquisition.ppg.model.PPGFrameRecord
import com.healthcvapp.acquisition.storage.AcquisitionFileStore
import com.healthcvapp.acquisition.storage.csv.CsvBatchWriter
import java.io.IOException
import java.nio.file.Files
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
class FrameCsvEncoderTest {
  @Test
  fun writesLegacyColumnsAndKeepsNanosecondFieldsAndFrameOrder() = runTest {
    val directory = Files.createTempDirectory("frame-writer").toFile()
    val file = directory.resolve("frame.csv.part")
    val writer = CsvBatchWriter(AcquisitionFileStore().createNewOutput(file), FrameCsvEncoder)

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

  @Test
  fun `missing optional camera values retain legacy zero encoding`() = runTest {
    val directory = Files.createTempDirectory("frame-missing-values").toFile()
    val file = directory.resolve("frame.csv.part")
    val writer = CsvBatchWriter(AcquisitionFileStore().createNewOutput(file), FrameCsvEncoder)

    writer.writeBatch(listOf(record(5, 9_534_000_000L, missingOptionalFields = true)))
    writer.close()

    assertEquals(
      listOf(
        "timestamp,timestampFrame,timestampSystem,exposureTime,durationTime,rollingShutterSkewTime,iso,whiteBalanceMode",
        "1000.5,9534.0,2000.75,0,0,0,0,0",
      ),
      file.readLines(),
    )
  }

  @Test
  fun `missing sensor timestamp remains an encoding failure`() {
    val record = record(6, 9_534_000_000L)
    val missingTimestamp = record.copy(metadata = record.metadata.copy(timestampFrameNanos = null))

    assertThrows(IOException::class.java) {
      FrameCsvEncoder.appendRow(missingTimestamp, 0, StringBuilder())
    }
    Unit
  }

  private fun record(
    frameIndex: Long,
    sensorTimestampNanos: Long,
    missingOptionalFields: Boolean = false,
  ): PPGCaptureRecord {
    val metadata = CameraFrameMetadata.fromCaptureResult(
      timestampElapsedNanos = 1_000_500_000L,
      timestampFrameNanos = sensorTimestampNanos,
      timestampSystemNanos = 2_000_750_000L,
      exposureTimeNanos = if (missingOptionalFields) null else 8_000_000L,
      durationTimeNanos = if (missingOptionalFields) null else 33_333_333L,
      rollingShutterSkewTimeNanos = if (missingOptionalFields) null else 0L,
      iso = if (missingOptionalFields) null else 0,
      whiteBalanceMode = if (missingOptionalFields) null else 2,
    )
    return PPGCaptureRecord(
      ppg = PPGFrameRecord(
        timestamp = 1_000.5,
        timestampFrame = sensorTimestampNanos / NANOS_PER_MILLISECOND,
        timestampSystem = 2_000.75,
        frameIndex = frameIndex,
        blockLayout = CameraBlockLayout(rows = 1, columns = 1),
        averagesYuv = doubleArrayOf(10.0, 127.0, 129.0),
      ),
      metadata = metadata,
    )
  }

  private companion object {
    const val NANOS_PER_MILLISECOND = 1_000_000.0
  }
}
