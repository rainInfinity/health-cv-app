/** 用真实直接缓冲布局对照原读取路径，验证共享三平面副本的颜色、寻址与借用期限。 */
package com.healthcvapp.acquisition.rppg.face

import com.healthcvapp.acquisition.pixels.PixelCropRect
import com.healthcvapp.acquisition.pixels.PixelFrameView
import com.healthcvapp.acquisition.pixels.PixelPlane
import com.healthcvapp.acquisition.rppg.roi.RppgFramePixels
import com.healthcvapp.acquisition.rppg.roi.RppgRoiSampler
import java.nio.ByteBuffer
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class RppgYuvFrameBufferTest {
  @Test
  fun bulkCopyMatchesDirectReadingAcrossOffsetsStridesCropRotationAndMirror() {
    val copied = RppgYuvFrameBuffer()
    try {
      for (rotation in listOf(0, 90, 180, 270)) {
        for (mirrored in listOf(false, true)) {
          val frame = frame(rotation, mirrored)
          val planes = listOf(frame.yPlane, frame.uPlane, frame.vPlane)
          val positions = planes.map { it.buffer.position() }
          val limits = planes.map { it.buffer.limit() }
          val geometry = FaceLandmarkerInputGeometry.from(frame)
          copied.copyFrom(frame)
          val directPixels = RppgFramePixels(frame, geometry, RppgRoiSampler())
          val copiedPixels = RppgFramePixels(frame, geometry, RppgRoiSampler(), copied)
          for (y in 0 until geometry.inputHeight) {
            for (x in 0 until geometry.inputWidth) {
              assertEquals("旋转 $rotation，镜像 $mirrored，输入像素 ($x, $y)",
                directPixels.argbAt(x, y), copiedPixels.argbAt(x, y))
            }
          }
          val polygons = listOf(
            listOf(point(0f, 0f), point(1f, 0f), point(1f, 1f), point(0f, 1f)),
            listOf(point(0.1f, 0.1f), point(0.9f, 0.2f), point(0.8f, 0.9f), point(0.2f, 0.8f)),
            listOf(point(-0.1f, 0.1f), point(1.1f, 0.1f), point(1.1f, 0.9f), point(-0.1f, 0.9f)),
            listOf(point(0f, 0f), point(1f, 0f), point(1f, 1f), point(0.7f, 1f),
              point(0.7f, 0.4f), point(0.3f, 0.4f), point(0.3f, 1f), point(0f, 1f)),
          )
          for (polygon in polygons) {
            assertEquals(directPixels.samplePolygon(polygon, 0.0), copiedPixels.samplePolygon(polygon, 0.0))
          }
          for ((outputWidth, outputHeight) in listOf(
            geometry.inputWidth to geometry.inputHeight,
            3 to 2,
            5 to 4,
          )) {
            val directArgb = IntArray(outputWidth * outputHeight)
            val copiedArgb = IntArray(outputWidth * outputHeight)
            FaceLandmarkerFramePixelConverter.fillArgb(frame, geometry, outputWidth, outputHeight, directArgb)
            FaceLandmarkerFramePixelConverter.fillArgb(frame, geometry, outputWidth, outputHeight, copiedArgb, copied)
            assertArrayEquals(directArgb, copiedArgb)
          }
          assertEquals(positions, planes.map { it.buffer.position() })
          assertEquals(limits, planes.map { it.buffer.limit() })
          copiedPixels.expire()
          directPixels.expire()
          copied.releaseFrame()
          frame.expire()
        }
      }
    } finally {
      copied.close()
    }
  }

  @Test
  fun refusesExpiredReleasedReboundAndClosedFramesEvenWhileCopiedBytesRemain() {
    val copied = RppgYuvFrameBuffer()
    val frame = frame()
    val geometry = FaceLandmarkerInputGeometry.from(frame)
    copied.copyFrom(frame)
    val scopedPixels = RppgFramePixels(frame, geometry, RppgRoiSampler(), copied)
    scopedPixels.expire()
    assertThrows(IllegalStateException::class.java) { scopedPixels.argbAt(0, 0) }
    copied.releaseFrame()
    assertThrows(IllegalStateException::class.java) { copied.argbAt(frame, 1, 1) }

    copied.copyFrom(frame)
    val releasedPixels = RppgFramePixels(frame, geometry, RppgRoiSampler(), copied)
    frame.expire()
    assertThrows(IllegalStateException::class.java) { releasedPixels.argbAt(0, 0) }
    assertThrows(IllegalStateException::class.java) { copied.copyFrom(frame) }

    val firstFrame = frame()
    copied.copyFrom(firstFrame)
    val firstGeometry = FaceLandmarkerInputGeometry.from(firstFrame)
    val previousPixels = RppgFramePixels(firstFrame, firstGeometry, RppgRoiSampler(), copied)
    val nextFrame = frame(rotation = 90, mirrored = true)
    copied.copyFrom(nextFrame)
    assertThrows(IllegalStateException::class.java) { previousPixels.argbAt(0, 0) }
    val nextGeometry = FaceLandmarkerInputGeometry.from(nextFrame)
    val currentPixels = RppgFramePixels(nextFrame, nextGeometry, RppgRoiSampler(), copied)
    val directPixels = RppgFramePixels(nextFrame, nextGeometry, RppgRoiSampler())
    assertEquals(directPixels.argbAt(0, 0), currentPixels.argbAt(0, 0))
    copied.close()
    assertThrows(IllegalStateException::class.java) { currentPixels.argbAt(0, 0) }
  }

  @Test
  fun rejectsTruncatedPlanesWithoutUsingStaleCacheOrReadingBeyondCrop() {
    val copied = RppgYuvFrameBuffer()
    try {
      val valid = frame()
      copied.copyFrom(valid)
      assertThrows(IndexOutOfBoundsException::class.java) { copied.argbAt(valid, 0, 1) }
      assertThrows(IndexOutOfBoundsException::class.java) { copied.argbAt(valid, 8, 1) }
      for (planeIndex in 0..2) {
        val truncated = frame()
        val plane = listOf(truncated.yPlane, truncated.uPlane, truncated.vPlane)[planeIndex]
        val lastColumn = if (planeIndex == 0) truncated.cropRect.right - 1 else (truncated.cropRect.right - 1) / 2
        val lastRow = if (planeIndex == 0) truncated.cropRect.bottom - 1 else (truncated.cropRect.bottom - 1) / 2
        plane.buffer.limit(plane.baseOffset + lastRow * plane.rowStrideBytes + lastColumn * plane.pixelStrideBytes)
        assertThrows(IndexOutOfBoundsException::class.java) { copied.copyFrom(truncated) }
        assertThrows(IllegalStateException::class.java) { copied.argbAt(valid, 1, 1) }
        val geometry = FaceLandmarkerInputGeometry.from(truncated)
        assertThrows(IllegalStateException::class.java) {
          FaceLandmarkerFramePixelConverter.fillArgb(truncated, geometry, 3, 2, IntArray(6), copied)
        }
        copied.copyFrom(valid)
      }
    } finally {
      copied.close()
    }
  }

  private fun point(x: Float, y: Float) = FaceLandmarkerPoint(x, y)

  /** 奇数帧和非零奇数裁剪原点，三平面使用不同的偏移、步长与只读直接缓冲。 */
  private fun frame(rotation: Int = 0, mirrored: Boolean = false): PixelFrameView = PixelFrameView(
    width = 9,
    height = 7,
    cropRect = PixelCropRect(1, 1, 8, 6),
    rotationDegrees = rotation,
    mirrored = mirrored,
    colorSpace = null,
    sessionId = "copied-yuv-test",
    frameIndex = 0,
    timestampFrameNanos = 1,
    processingElapsedNanos = 2,
    timestampSystemNanos = 3,
    yPlane = plane(width = 9, height = 7, base = 5, rowStride = 29, pixelStride = 2, seed = 17),
    uPlane = plane(width = 5, height = 4, base = 7, rowStride = 19, pixelStride = 3, seed = 73),
    vPlane = plane(width = 5, height = 4, base = 11, rowStride = 23, pixelStride = 2, seed = 131),
  )

  private fun plane(width: Int, height: Int, base: Int, rowStride: Int, pixelStride: Int, seed: Int): PixelPlane {
    val limit = base + (height - 1) * rowStride + (width - 1) * pixelStride + 1
    val buffer = ByteBuffer.allocateDirect(limit + 13)
    for (row in 0 until height) {
      for (column in 0 until width) {
        buffer.put(base + row * rowStride + column * pixelStride, (seed + row * 37 + column * 23).toByte())
      }
    }
    val readOnly = buffer.asReadOnlyBuffer()
    readOnly.limit(limit)
    readOnly.position(base + 3)
    return PixelPlane(readOnly, base, width, height, rowStride, pixelStride)
  }
}
