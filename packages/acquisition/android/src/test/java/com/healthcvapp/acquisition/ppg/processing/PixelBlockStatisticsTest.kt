/** 验证网格内 Y/U/V 均值、色度共享边界和全帧提示稳定性。 */

package com.healthcvapp.acquisition.ppg.processing

import com.healthcvapp.acquisition.ppg.model.CameraBlockLayout
import com.healthcvapp.acquisition.ppg.pixels.PixelCropRect
import com.healthcvapp.acquisition.ppg.pixels.PixelFrameView
import com.healthcvapp.acquisition.ppg.pixels.PixelPlane
import java.nio.ByteBuffer
import org.junit.Assert.assertEquals
import org.junit.Test

class PixelBlockStatisticsTest {
  @Test
  fun `uses actual crop pixels and shared interleaved chroma cells for every block`() {
    val frame = paddedInterleavedFrame()
    val extractor = PixelStatisticsExtractor()
    val grid = extractor.extractFrame(frame, CameraBlockLayout(rows = 2, columns = 3))

    assertEquals(23.0, grid.fullFrame.avgY, 0.0)
    assertEquals(35.0, grid.fullFrame.avgU, 0.0)
    assertEquals(135.0, grid.fullFrame.avgV, 0.0)
    assertEquals(15L, grid.fullFrame.ySampleCount)
    assertEquals(6L, grid.fullFrame.uSampleCount)
    assertEquals(6L, grid.fullFrame.vSampleCount)

    val blocks = checkNotNull(grid.blocks)
    assertEquals(2, blocks.rows)
    assertEquals(3, blocks.columns)
    assertAverages(blocks, 0, 16.5, 30.0, 130.0)
    assertAverages(blocks, 1, 18.5, 40.0, 140.0)
    assertAverages(blocks, 2, 20.0, 45.0, 145.0)
    assertAverages(blocks, 3, 31.5, 45.0, 145.0)
    assertAverages(blocks, 4, 33.5, 55.0, 155.0)
    assertAverages(blocks, 5, 35.0, 60.0, 160.0)

    val oneBlock = extractor.extractFrame(frame, CameraBlockLayout(rows = 1, columns = 1))
    assertEquals(grid.fullFrame, oneBlock.fullFrame)
    assertAverages(checkNotNull(oneBlock.blocks), 0, 23.0, 35.0, 135.0)
  }

  private fun assertAverages(
    blocks: PixelBlockStatistics,
    blockIndex: Int,
    avgY: Double,
    avgU: Double,
    avgV: Double,
  ) {
    assertEquals(avgY, blocks.averageY(blockIndex), 0.0)
    assertEquals(avgU, blocks.averageU(blockIndex), 0.0)
    assertEquals(avgV, blocks.averageV(blockIndex), 0.0)
  }

  private fun paddedInterleavedFrame(): PixelFrameView {
    val width = 7
    val height = 5
    val crop = PixelCropRect(left = 1, top = 1, right = 6, bottom = 4)
    val yBuffer = ByteBuffer.allocate(100)
    val uvBuffer = ByteBuffer.allocate(40)
    for (index in 0 until yBuffer.limit()) yBuffer.put(index, 0x7F.toByte())
    for (index in 0 until uvBuffer.limit()) uvBuffer.put(index, 0x7F.toByte())

    for (y in 0 until height) {
      for (x in 0 until width) yBuffer.put(3 + y * 16 + x * 2, (y * 10 + x).toByte())
    }
    val uValues = arrayOf(
      intArrayOf(10, 20, 30, 40),
      intArrayOf(40, 50, 60, 70),
      intArrayOf(70, 80, 90, 100),
    )
    for (chromaY in 0 until 3) {
      for (chromaX in 0 until 4) {
        val offset = 2 + chromaY * 10 + chromaX * 2
        val u = uValues[chromaY][chromaX]
        uvBuffer.put(offset, u.toByte())
        uvBuffer.put(offset + 1, (u + 100).toByte())
      }
    }

    return PixelFrameView(
      width = width,
      height = height,
      cropRect = crop,
      rotationDegrees = 0,
      mirrored = false,
      colorSpace = null,
      sessionId = "block-statistics",
      frameIndex = 0,
      timestampFrameNanos = 1_000,
      processingElapsedNanos = 2_000,
      timestampSystemNanos = 3_000,
      yPlane = PixelPlane(yBuffer, 3, width, height, 16, 2),
      uPlane = PixelPlane(uvBuffer, 2, 4, 3, 10, 2),
      vPlane = PixelPlane(uvBuffer, 3, 4, 3, 10, 2),
    )
  }
}
