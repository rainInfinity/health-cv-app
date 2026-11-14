/** 验证多边形裁剪覆盖率阈值与有效像素读取。 */
package com.healthcvapp.acquisition.rppg.roi

import com.healthcvapp.acquisition.pixels.PixelCropRect
import com.healthcvapp.acquisition.pixels.PixelFrameView
import com.healthcvapp.acquisition.pixels.PixelPlane
import com.healthcvapp.acquisition.rppg.face.FaceLandmarkerInputGeometry
import com.healthcvapp.acquisition.rppg.face.FaceLandmarkerPoint
import java.nio.ByteBuffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RppgRoiCoverageTest {
  @Test
  fun acceptsAtLeastNinetyFivePercentCoverageAndRejectsLargerClipping() {
    val source = frame()
    val geometry = FaceLandmarkerInputGeometry.from(source)
    val pixels = RppgFramePixels(source, IntArray(10_000) { 0xFF102030.toInt() }, geometry, RppgRoiSampler())
    val slightlyClipped = listOf(
      FaceLandmarkerPoint(-0.01f, 0f),
      FaceLandmarkerPoint(1f, 0f),
      FaceLandmarkerPoint(1f, 1f),
      FaceLandmarkerPoint(-0.01f, 1f),
    )

    val accepted = pixels.samplePolygon(slightlyClipped, minimumCoverageFraction = 0.95)!!
    assertEquals(0.9900990099, accepted.coverageFraction, 1e-8)
    assertEquals(10_000, accepted.pixelCount)
    assertNull(pixels.samplePolygon(slightlyClipped, minimumCoverageFraction = 0.995))
  }

  private fun frame() = PixelFrameView(
    width = 100,
    height = 100,
    cropRect = PixelCropRect(0, 0, 100, 100),
    rotationDegrees = 0,
    mirrored = false,
    colorSpace = null,
    sessionId = "coverage-test",
    frameIndex = 0,
    timestampFrameNanos = 1,
    processingElapsedNanos = 2,
    timestampSystemNanos = 3,
    yPlane = PixelPlane(ByteBuffer.allocate(10_000), 0, 100, 100, 100, 1),
    uPlane = PixelPlane(ByteBuffer.allocate(2_500), 0, 50, 50, 50, 1),
    vPlane = PixelPlane(ByteBuffer.allocate(2_500), 0, 50, 50, 50, 1),
  )
}
