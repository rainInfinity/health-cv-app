/** 验证非偶数帧尺寸的 4:2:0 色度边界只计入实际色度样本。 */

package com.healthcvapp.acquisition.ppg.pixels

import com.healthcvapp.acquisition.ppg.processing.PixelStatisticsExtractor
import java.nio.ByteBuffer
import org.junit.Assert.assertEquals
import org.junit.Test

class PixelStatisticsSamplingTest {
  @Test
  fun oddFrameDimensionsCountEachChromaCellOnce() {
    val frame = PixelFrameView(
      width = 3,
      height = 3,
      cropRect = PixelCropRect(0, 0, 3, 3),
      rotationDegrees = 0,
      mirrored = false,
      colorSpace = null,
      sessionId = "odd-frame",
      frameIndex = 0,
      timestampFrameNanos = 0,
      processingElapsedNanos = 0,
      timestampSystemNanos = 0,
      yPlane = PixelPlane(ByteBuffer.wrap(ByteArray(9) { 10 }), 0, 3, 3, 3, 1),
      uPlane = PixelPlane(ByteBuffer.wrap(byteArrayOf(10, 20, 30, 40)), 0, 2, 2, 2, 1),
      vPlane = PixelPlane(ByteBuffer.wrap(byteArrayOf(50, 60, 70, 80)), 0, 2, 2, 2, 1),
    )

    val stats = PixelStatisticsExtractor().extract(frame)

    assertEquals(9L, stats.ySampleCount)
    assertEquals(4L, stats.uSampleCount)
    assertEquals(4L, stats.vSampleCount)
    assertEquals(25.0, stats.avgU, 0.0)
    assertEquals(65.0, stats.avgV, 0.0)
  }
}
