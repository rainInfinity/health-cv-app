/** 验证 PPG 编码器在通用 writer 中保持旧 CSV 协议。 */

package com.healthcvapp.acquisition.ppg.output

import com.healthcvapp.acquisition.camera.CameraFrameMetadata
import com.healthcvapp.acquisition.ppg.model.CameraBlockLayout
import com.healthcvapp.acquisition.ppg.model.PPGCaptureRecord
import com.healthcvapp.acquisition.ppg.model.PPGFrameRecord
import com.healthcvapp.acquisition.storage.AcquisitionFileStore
import com.healthcvapp.acquisition.storage.csv.CsvBatchWriter
import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlinx.coroutines.test.runTest

class PPGCsvEncoderTest {
  @Test
  fun writesOrderedRowsAcrossBatchesAndClosesReadableUtf8File() = runTest {
    val directory = Files.createTempDirectory("ppg-writer").toFile()
    val file = directory.resolve("ppg.csv.part")
    val writer = CsvBatchWriter(AcquisitionFileStore().createNewOutput(file), PPGCsvEncoder)

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
  @Test
  fun `one paired frame encodes all blocks in row-major order`() = runTest {
    val directory = Files.createTempDirectory("ppg-multi-block-writer").toFile()
    val file = directory.resolve("ppg.csv.part")
    val writer = CsvBatchWriter(AcquisitionFileStore().createNewOutput(file), PPGCsvEncoder)

    writer.writeBatch(
      listOf(
        record(
          index = 7,
          timestamp = 7.0,
          layout = CameraBlockLayout(rows = 2, columns = 3),
          averagesYuv = doubleArrayOf(
            10.0, 120.0, 130.0,
            11.0, 121.0, 131.0,
            12.0, 122.0, 132.0,
            13.0, 123.0, 133.0,
            14.0, 124.0, 134.0,
            15.0, 125.0, 135.0,
          ),
        ),
      ),
    )
    writer.close()

    assertEquals(
      listOf(
        "timestamp,timestampFrame,timestampSystem,avgY,avgU,avgV,frameIndex,blockIndex",
        "7.0,8.25,9.5,10.0,120.0,130.0,7,0",
        "7.0,8.25,9.5,11.0,121.0,131.0,7,1",
        "7.0,8.25,9.5,12.0,122.0,132.0,7,2",
        "7.0,8.25,9.5,13.0,123.0,133.0,7,3",
        "7.0,8.25,9.5,14.0,124.0,134.0,7,4",
        "7.0,8.25,9.5,15.0,125.0,135.0,7,5",
      ),
      file.readLines(),
    )
  }
  private fun record(
    index: Long,
    timestamp: Double,
    layout: CameraBlockLayout = CameraBlockLayout(rows = 1, columns = 1),
    averagesYuv: DoubleArray = doubleArrayOf(10.0, 128.0, 129.0),
  ) = PPGCaptureRecord(
    ppg = PPGFrameRecord(
      timestamp = timestamp,
      timestampFrame = timestamp + 1.25,
      timestampSystem = timestamp + 2.5,
      frameIndex = index,
      blockLayout = layout,
      averagesYuv = averagesYuv,
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
