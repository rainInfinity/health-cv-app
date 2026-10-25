/** 验证 Camera2 结果按精确传感器时间戳有界配对并保持帧序。 */

package com.healthcvapp.acquisition.ppg.correlation

import com.healthcvapp.acquisition.ppg.camera.CameraFrameMetadata
import com.healthcvapp.acquisition.ppg.model.PPGCaptureRecord
import com.healthcvapp.acquisition.ppg.model.CameraBlockLayout
import com.healthcvapp.acquisition.ppg.model.PPGFrameRecord
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FrameMetadataCorrelatorTest {
  @Test
  fun outOfOrderResultsMatchExactTimestampsAndReleaseInFrameOrder() {
    val correlator = FrameMetadataCorrelator(capacity = 4)

    assertEquals(emptyList<PPGCaptureRecord>(), correlator.offerMetadata(metadata(2_000_000_000L)).records)
    assertEquals(emptyList<PPGCaptureRecord>(), correlator.offerMetadata(metadata(1_000_000_000L)).records)
    assertEquals(emptyList<PPGCaptureRecord>(), correlator.offerPpgFrame(record(1, 2_000_000_000L), 2_000_000_000L).records)

    val update = correlator.offerPpgFrame(record(0, 1_000_000_000L), 1_000_000_000L)

    assertNull(update.failure)
    assertEquals(listOf(0L, 1L), update.records.map { it.ppg.frameIndex })
    assertEquals(listOf(1_000_000_000L, 2_000_000_000L), update.records.map { it.metadata.timestampFrameNanos })
    assertEquals(update.records.map { it.ppg.timestampFrame }, update.records.map {
      checkNotNull(it.metadata.timestampFrameNanos) / 1_000_000.0
    })
    assertEquals(listOf(6, 6), update.records.map { it.ppg.blockCount })
  }

  @Test
  fun duplicateFrameIndexRejectsTheWholeMultiBlockFrame() {
    val correlator = FrameMetadataCorrelator(capacity = 4)
    val completeFrame = record(0, 1_000_000_000L)

    assertEquals(
      emptyList<PPGCaptureRecord>(),
      correlator.offerPpgFrame(completeFrame, 1_000_000_000L).records,
    )
    val duplicate = correlator.offerPpgFrame(
      record(0, 2_000_000_000L),
      2_000_000_000L,
    )

    assertEquals("FRAME_METADATA_DUPLICATE_FRAME", duplicate.failure?.code)
    assertArrayEquals(longArrayOf(0L), duplicate.failedFrameIndexes)
    assertEquals(emptyList<PPGCaptureRecord>(), duplicate.records)
  }
  @Test
  fun nearbyButDifferentTimestampNeverProducesAPair() {
    val correlator = FrameMetadataCorrelator(capacity = 4)
    correlator.offerPpgFrame(record(0, 1_000_000_000L), 1_000_000_000L)

    val unmatched = correlator.offerMetadata(metadata(1_000_000_001L))
    val stopped = correlator.finish()

    assertEquals(emptyList<PPGCaptureRecord>(), unmatched.records)
    assertEquals("FRAME_METADATA_UNMATCHED", stopped.failure?.code)
    assertArrayEquals(longArrayOf(0L), stopped.failedFrameIndexes)
    assertEquals(emptyList<PPGCaptureRecord>(), stopped.records)
  }
  @Test
  fun missingSensorTimestampFailsWithoutInventingACorrelationKey() {
    val correlator = FrameMetadataCorrelator(capacity = 4)

    val update = correlator.offerMetadata(metadata(1_000_000_000L).copy(timestampFrameNanos = null))

    assertEquals("FRAME_METADATA_TIMESTAMP_MISSING", update.failure?.code)
    assertEquals(emptyList<PPGCaptureRecord>(), update.records)
  }

  @Test
  fun cacheOverflowFailsEveryOutstandingFormalFrame() {
    val correlator = FrameMetadataCorrelator(capacity = 1)
    correlator.offerPpgFrame(record(0, 1_000_000_000L), 1_000_000_000L)

    val overflow = correlator.offerPpgFrame(record(1, 2_000_000_000L), 2_000_000_000L)

    assertEquals("FRAME_METADATA_CAPACITY_EXCEEDED", overflow.failure?.code)
    assertArrayEquals(longArrayOf(0L, 1L), overflow.failedFrameIndexes)
  }

  private fun record(frameIndex: Long, timestampNanos: Long) = PPGFrameRecord(
    timestamp = frameIndex.toDouble(),
    timestampFrame = timestampNanos / 1_000_000.0,
    timestampSystem = frameIndex.toDouble() + 2,
    frameIndex = frameIndex,
    blockLayout = CameraBlockLayout(rows = 2, columns = 3),
    averagesYuv = DoubleArray(18) { it.toDouble() },
  )

  private fun metadata(timestampNanos: Long) = CameraFrameMetadata(
    timestampElapsedNanos = 11_000_000L,
    timestampFrameNanos = timestampNanos,
    timestampSystemNanos = 12_000_000L,
    exposureTimeNanos = 5_000_000L,
    durationTimeNanos = 33_000_000L,
    rollingShutterSkewTimeNanos = 2_000_000L,
    iso = 100,
    whiteBalanceMode = 1,
  )
}
