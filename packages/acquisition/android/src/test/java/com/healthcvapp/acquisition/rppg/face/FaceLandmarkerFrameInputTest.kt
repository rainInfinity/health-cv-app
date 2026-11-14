/** 验证 YUV 转换、同帧 ROI 取色与借用期限约束。 */
package com.healthcvapp.acquisition.rppg.face

import java.nio.ByteBuffer
import com.healthcvapp.acquisition.pixels.PixelCropRect
import com.healthcvapp.acquisition.pixels.PixelFrameView
import com.healthcvapp.acquisition.pixels.PixelPlane
import com.healthcvapp.acquisition.rppg.roi.RppgFramePixels
import com.healthcvapp.acquisition.rppg.roi.RppgRoiSampler
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class FaceLandmarkerFrameInputTest {
  @Test
  fun convertsKnownBt601LimitedSamplesAndHonorsCropMirrorAndPlaneStrides() {
    assertEquals(0xFF000000.toInt(), RppgYuvColorConverter.toArgb(16, 128, 128))
    assertEquals(0xFFFFFFFF.toInt(), RppgYuvColorConverter.toArgb(235, 128, 128))
    assertEquals(0xFFFF0000.toInt(), RppgYuvColorConverter.toArgb(81, 90, 240))
    assertEquals("BT601_LIMITED_V1", RppgYuvColorConverter.ASSUMPTION_ID)

    val frame = strideAndCropFixture()
    val geometry = FaceLandmarkerInputGeometry.from(frame)
    val pixels = IntArray(geometry.inputWidth * geometry.inputHeight)
    FaceLandmarkerFramePixelConverter.fillArgb(frame, geometry, pixels)

    assertEquals(0xFF000000.toInt(), pixels[0])
    assertEquals(0xFFFF0000.toInt(), pixels[1])
    assertEquals(0xFF000000.toInt(), pixels[2])
    assertEquals(0xFFFF0000.toInt(), pixels[3])
  }

  @Test
  fun roiMeanUsesSameConvertedFrameAndCountsOnlyPolygonPixelCenters() {
    val frame = strideAndCropFixture()
    val geometry = FaceLandmarkerInputGeometry.from(frame)
    val pixels = IntArray(geometry.inputWidth * geometry.inputHeight)
    FaceLandmarkerFramePixelConverter.fillArgb(frame, geometry, pixels)
    val rgbFrame = RppgFramePixels(frame, pixels, geometry, RppgRoiSampler())
    val fullFramePolygon = listOf(
      FaceLandmarkerPoint(0f, 0f),
      FaceLandmarkerPoint(1f, 0f),
      FaceLandmarkerPoint(1f, 1f),
      FaceLandmarkerPoint(0f, 1f),
    )

    val sample = rgbFrame.samplePolygon(fullFramePolygon)!!
    assertEquals(127.5, sample.red, 0.0)
    assertEquals(0.0, sample.green, 0.0)
    assertEquals(0.0, sample.blue, 0.0)
    assertEquals(4, sample.pixelCount)
    val directSample = RppgFramePixels(frame, geometry, RppgRoiSampler())
      .samplePolygon(fullFramePolygon)!!
    assertEquals(sample.red, directSample.red, 0.0)
    assertEquals(sample.green, directSample.green, 0.0)
    assertEquals(sample.blue, directSample.blue, 0.0)
    assertEquals(sample.pixelCount, directSample.pixelCount)

    val centerPolygon = listOf(
      FaceLandmarkerPoint(0.25f, 0.25f),
      FaceLandmarkerPoint(0.75f, 0.25f),
      FaceLandmarkerPoint(0.75f, 0.75f),
      FaceLandmarkerPoint(0.25f, 0.75f),
    )
    val centerSample = rgbFrame.samplePolygon(centerPolygon)!!
    assertEquals(1, centerSample.pixelCount)
    assertEquals(0.0, centerSample.red, 0.0)
    assertNull(rgbFrame.samplePolygon(fullFramePolygon.dropLast(2)))
    assertNull(
      rgbFrame.samplePolygon(
        listOf(
          FaceLandmarkerPoint(-0.1f, 0f),
          FaceLandmarkerPoint(1f, 0f),
          FaceLandmarkerPoint(1f, 1f),
        ),
      ),
    )
  }

  @Test
  fun convertedFrameCannotReadPixelsAfterItsScopeOrBorrowedImageEnds() {
    val scopedFrame = strideAndCropFixture()
    val geometry = FaceLandmarkerInputGeometry.from(scopedFrame)
    val rgbFrame = RppgFramePixels(
      scopedFrame,
      IntArray(geometry.inputWidth * geometry.inputHeight),
      geometry,
      RppgRoiSampler(),
    )
    val polygon = listOf(
      FaceLandmarkerPoint(0f, 0f),
      FaceLandmarkerPoint(1f, 0f),
      FaceLandmarkerPoint(1f, 1f),
    )
    rgbFrame.expire()

    assertThrows(IllegalStateException::class.java) { rgbFrame.samplePolygon(polygon) }

    val releasedFrame = strideAndCropFixture()
    val releasedGeometry = FaceLandmarkerInputGeometry.from(releasedFrame)
    val releasedRgbFrame = RppgFramePixels(
      releasedFrame,
      IntArray(releasedGeometry.inputWidth * releasedGeometry.inputHeight),
      releasedGeometry,
      RppgRoiSampler(),
    )
    releasedFrame.expire()
    assertThrows(IllegalStateException::class.java) { releasedRgbFrame.samplePolygon(polygon) }
  }

  private fun strideAndCropFixture(): PixelFrameView {
    val yBuffer = ByteBuffer.allocate(12)
    for (row in 0 until 2) {
      yBuffer.put(row * 6 + 1, 81.toByte())
      yBuffer.put(row * 6 + 2, 16.toByte())
    }
    val uBuffer = ByteBuffer.allocate(4)
    uBuffer.put(0, 90.toByte())
    uBuffer.put(2, 128.toByte())
    val vBuffer = ByteBuffer.allocate(4)
    vBuffer.put(0, 240.toByte())
    vBuffer.put(2, 128.toByte())
    return PixelFrameView(
      width = 4,
      height = 2,
      cropRect = PixelCropRect(left = 1, top = 0, right = 3, bottom = 2),
      rotationDegrees = 0,
      mirrored = true,
      colorSpace = null,
      sessionId = "frame-input-test",
      frameIndex = 0,
      timestampFrameNanos = 1,
      processingElapsedNanos = 2,
      timestampSystemNanos = 3,
      yPlane = PixelPlane(yBuffer, 0, 4, 2, 6, 1),
      uPlane = PixelPlane(uBuffer, 0, 2, 1, 4, 2),
      vPlane = PixelPlane(vBuffer, 0, 2, 1, 4, 2),
    )
  }
}
