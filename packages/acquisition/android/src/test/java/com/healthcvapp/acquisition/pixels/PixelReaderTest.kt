/** 验证像素读取遵循各平面的实际 stride、偏移与裁剪区域。 */

package com.healthcvapp.acquisition.pixels

import java.nio.ByteBuffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class PixelReaderTest {
  @Test
  fun readsPaddedPlanesAndSharedInterleavedChromaAtNonzeroCropOffset() {
    val yBuffer = ByteBuffer.allocate(24)
    for (row in 0 until 4) {
      for (column in 0 until 4) {
        yBuffer.put(1 + row * 6 + column, (row * 10 + column).toByte())
      }
    }
    yBuffer.position(1)

    val sharedChroma = ByteBuffer.allocate(8)
    val chromaValues = byteArrayOf(10.toByte(), 110.toByte(), 20.toByte(), 120.toByte(), 30.toByte(), 130.toByte(), 40.toByte(), 140.toByte())
    for (index in chromaValues.indices) sharedChroma.put(index, chromaValues[index])

    val frame = frame(
      crop = PixelCropRect(left = 1, top = 1, right = 4, bottom = 4),
      yPlane = PixelPlane(yBuffer, baseOffset = 1, width = 4, height = 4, rowStrideBytes = 6, pixelStrideBytes = 1),
      uPlane = PixelPlane(sharedChroma, baseOffset = 0, width = 2, height = 2, rowStrideBytes = 4, pixelStrideBytes = 2),
      vPlane = PixelPlane(sharedChroma, baseOffset = 1, width = 2, height = 2, rowStrideBytes = 4, pixelStrideBytes = 2),
    )
    val reader = PixelReader(frame)

    assertEquals(22, reader.readY(2, 2))
    assertEquals(10, reader.readU(1, 1))
    assertEquals(20, reader.readU(2, 1))
    assertEquals(120, reader.readV(2, 1))
    assertEquals(140, reader.readV(3, 3))
    assertEquals(1, yBuffer.position())
    assertThrows(IndexOutOfBoundsException::class.java) { reader.readY(0, 1) }
  }

  @Test
  fun retainedReaderCannotAccessPixelsAfterBorrowEnds() {
    val frame = frame(
      crop = PixelCropRect(0, 0, 2, 2),
      yPlane = plane(ByteBuffer.wrap(byteArrayOf(1, 2, 3, 4)), 2, 2, 2, 1),
      uPlane = plane(ByteBuffer.wrap(byteArrayOf(5)), 1, 1, 1, 1),
      vPlane = plane(ByteBuffer.wrap(byteArrayOf(6)), 1, 1, 1, 1),
    )
    val reader = PixelReader(frame)
    frame.expire()

    assertThrows(IllegalStateException::class.java) { reader.readY(0, 0) }
  }

  private fun frame(
    crop: PixelCropRect,
    yPlane: PixelPlane,
    uPlane: PixelPlane,
    vPlane: PixelPlane,
  ) = PixelFrameView(
    width = yPlane.width,
    height = yPlane.height,
    cropRect = crop,
    rotationDegrees = 0,
    mirrored = false,
    colorSpace = null,
    sessionId = "session",
    frameIndex = 0,
    timestampFrameNanos = 1,
    processingElapsedNanos = 2,
    timestampSystemNanos = 3,
    yPlane = yPlane,
    uPlane = uPlane,
    vPlane = vPlane,
  )

  private fun plane(
    buffer: ByteBuffer,
    width: Int,
    height: Int,
    rowStride: Int,
    pixelStride: Int,
  ) = PixelPlane(
    buffer = buffer,
    baseOffset = 0,
    width = width,
    height = height,
    rowStrideBytes = rowStride,
    pixelStrideBytes = pixelStride,
  )
}
