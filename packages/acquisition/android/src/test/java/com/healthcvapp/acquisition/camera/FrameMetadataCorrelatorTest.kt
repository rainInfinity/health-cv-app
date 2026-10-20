/** 验证 Camera2 结果按精确传感器时间戳有界配对并保持帧序。 */

package com.healthcvapp.acquisition.camera

import com.healthcvapp.acquisition.processing.PpgRecord
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FrameMetadataCorrelatorTest {
  @Test
  fun outOfOrderResultsMatchExactTimestampsAndReleaseInFrameOrder() {
    val correlator = FrameMetadataCorrelator(capacity = 4)

    assertEquals(emptyList<CaptureRecord>(), correlator.offerMetadata(metadata(2_000_000_000L)).records)
    assertEquals(emptyList<CaptureRecord>(), correlator.offerMetadata(metadata(1_000_000_000L)).records)
    assertEquals(emptyList<CaptureRecord>(), correlator.offerPpg(record(1, 2_000_000_000L), 2_000_000_000L).records)

    val update = correlator.offerPpg(record(0, 1_000_000_000L), 1_000_000_000L)

    assertNull(update.failure)
    assertEquals(listOf(0L, 1L), update.records.map { it.ppg.frameIndex })
    assertEquals(listOf(1_000_000_000L, 2_000_000_000L), update.records.map { it.metadata.timestampFrameNanos })
    assertEquals(update.records.map { it.ppg.timestampFrame }, update.records.map {
      checkNotNull(it.metadata.timestampFrameNanos) / 1_000_000.0
    })
  }

  @Test
  fun nearbyButDifferentTimestampNeverProducesAPair() {
    val correlator = FrameMetadataCorrelator(capacity = 4)
    correlator.offerPpg(record(0, 1_000_000_000L), 1_000_000_000L)

    val unmatched = correlator.offerMetadata(metadata(1_000_000_001L))
    val stopped = correlator.finish()

    assertEquals(emptyList<CaptureRecord>(), unmatched.records)
    assertEquals("FRAME_METADATA_UNMATCHED", stopped.failure?.code)
    assertArrayEquals(longArrayOf(0L), stopped.failedFrameIndexes)
    assertEquals(emptyList<CaptureRecord>(), stopped.records)
  }
  @Test
  fun missingSensorTimestampFailsWithoutInventingACorrelationKey() {
    val correlator = FrameMetadataCorrelator(capacity = 4)

    val update = correlator.offerMetadata(metadata(1_000_000_000L).copy(timestampFrameNanos = null))

    assertEquals("FRAME_METADATA_TIMESTAMP_MISSING", update.failure?.code)
    assertEquals(emptyList<CaptureRecord>(), update.records)
  }

  @Test
  fun cacheOverflowFailsEveryOutstandingFormalFrame() {
    val correlator = FrameMetadataCorrelator(capacity = 1)
    correlator.offerPpg(record(0, 1_000_000_000L), 1_000_000_000L)

    val overflow = correlator.offerPpg(record(1, 2_000_000_000L), 2_000_000_000L)

    assertEquals("FRAME_METADATA_CAPACITY_EXCEEDED", overflow.failure?.code)
    assertArrayEquals(longArrayOf(0L, 1L), overflow.failedFrameIndexes)
  }

  private fun record(frameIndex: Long, timestampNanos: Long) = PpgRecord(
    timestamp = frameIndex.toDouble(),
    timestampFrame = timestampNanos / 1_000_000.0,
    timestampSystem = frameIndex.toDouble() + 2,
    avgY = 10.0,
    avgU = 127.0,
    avgV = 129.0,
    frameIndex = frameIndex,
    blockIndex = 0,
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
