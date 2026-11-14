/** 验证模型输入降采样不会改变同帧 ROI 的原分辨率采样。 */
package com.healthcvapp.acquisition.rppg.face

import android.graphics.Bitmap
import com.healthcvapp.acquisition.pixels.PixelCropRect
import com.healthcvapp.acquisition.pixels.PixelFrameView
import com.healthcvapp.acquisition.pixels.PixelPlane
import com.healthcvapp.acquisition.rppg.roi.RppgFramePixels
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test
import java.nio.ByteBuffer

class FaceLandmarkerInputConverterInstrumentedTest {
  @Test
  fun reusesReducedModelBitmapAndSamplesFullResolutionRgbFrame() {
    val converter = FaceLandmarkerInputConverter(maximumModelInputDimensionPx = 4)
    var reusableBitmap: Bitmap? = null
    try {
      repeat(2) {
        val frame = frame()
        try {
          converter.withInput(frame) { bitmap, rgbFrame ->
            assertEquals(2, bitmap.width)
            assertEquals(4, bitmap.height)
            assertEquals(4, rgbFrame.geometry.inputWidth)
            assertEquals(8, rgbFrame.geometry.inputHeight)
            val sample = rgbFrame.samplePolygon(
              listOf(
                FaceLandmarkerPoint(0f, 0f),
                FaceLandmarkerPoint(1f, 0f),
                FaceLandmarkerPoint(1f, 1f),
                FaceLandmarkerPoint(0f, 1f),
              ),
            )
            assertEquals(32, checkNotNull(sample).pixelCount)
            reusableBitmap?.let { assertSame(it, bitmap) } ?: run { reusableBitmap = bitmap }
          }
        } finally {
          frame.expire()
        }
      }
    } finally {
      converter.close()
    }
  }

  private fun frame(): PixelFrameView {
    val width = 8
    val height = 4
    return PixelFrameView(
      width = width,
      height = height,
      cropRect = PixelCropRect(left = 0, top = 0, right = width, bottom = height),
      rotationDegrees = 90,
      mirrored = false,
      colorSpace = null,
      sessionId = "input-scale-test",
      frameIndex = 0,
      timestampFrameNanos = 1,
      processingElapsedNanos = 2,
      timestampSystemNanos = 3,
      yPlane = PixelPlane(ByteBuffer.allocate(width * height), 0, width, height, width, 1),
      uPlane = PixelPlane(ByteBuffer.allocate((width / 2) * (height / 2)), 0, width / 2, height / 2, width / 2, 1),
      vPlane = PixelPlane(ByteBuffer.allocate((width / 2) * (height / 2)), 0, width / 2, height / 2, width / 2, 1),
    )
  }
}
