/** 验证 Face Landmarker 坐标映射对 crop、旋转和镜像的处理。 */
package com.healthcvapp.acquisition.rppg.face

import com.healthcvapp.acquisition.pixels.PixelCropRect
import com.healthcvapp.acquisition.pixels.PixelFrameView
import com.healthcvapp.acquisition.pixels.PixelPlane
import java.nio.ByteBuffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FaceLandmarkerInputGeometryTest {
  @Test
  fun mapsInputPixelsAndNormalizedEdgesAcrossAllRightAngleRotations() {
    val expectedPixels = mapOf(
      0 to (1 to 2),
      90 to (1 to 4),
      180 to (4 to 4),
      270 to (4 to 2),
    )
    val expectedEdges = mapOf(
      0 to (1.0 to 2.0),
      90 to (1.0 to 5.0),
      180 to (5.0 to 5.0),
      270 to (5.0 to 2.0),
    )
    val expectedOppositePixels = mapOf(
      0 to (4 to 4),
      90 to (4 to 2),
      180 to (1 to 2),
      270 to (1 to 4),
    )
    val expectedOppositeEdges = mapOf(
      0 to (5.0 to 5.0),
      90 to (5.0 to 2.0),
      180 to (1.0 to 2.0),
      270 to (1.0 to 5.0),
    )

    for (rotation in listOf(0, 90, 180, 270)) {
      val geometry = FaceLandmarkerInputGeometry.from(frame(rotationDegrees = rotation))
      val expectedPixel = expectedPixels.getValue(rotation)
      val expectedEdge = expectedEdges.getValue(rotation)
      val expectedOppositePixel = expectedOppositePixels.getValue(rotation)
      val expectedOppositeEdge = expectedOppositeEdges.getValue(rotation)

      assertEquals(expectedPixel.first, geometry.sourcePixelX(0, 0))
      assertEquals(expectedPixel.second, geometry.sourcePixelY(0, 0))
      assertEquals(expectedEdge.first, geometry.sourcePoint(FaceLandmarkerPoint(0f, 0f))!!.x, 0.0)
      assertEquals(expectedEdge.second, geometry.sourcePoint(FaceLandmarkerPoint(0f, 0f))!!.y, 0.0)
      assertEquals(
        expectedOppositePixel.first,
        geometry.sourcePixelX(geometry.inputWidth - 1, geometry.inputHeight - 1),
      )
      assertEquals(
        expectedOppositePixel.second,
        geometry.sourcePixelY(geometry.inputWidth - 1, geometry.inputHeight - 1),
      )
      val oppositeEdge = geometry.sourcePoint(FaceLandmarkerPoint(1f, 1f))!!
      assertEquals(expectedOppositeEdge.first, oppositeEdge.x, 0.0)
      assertEquals(expectedOppositeEdge.second, oppositeEdge.y, 0.0)
      if (rotation == 90 || rotation == 270) {
        assertEquals(3, geometry.inputWidth)
        assertEquals(4, geometry.inputHeight)
      } else {
        assertEquals(4, geometry.inputWidth)
        assertEquals(3, geometry.inputHeight)
      }
    }
  }

  @Test
  fun mirrorIsAppliedToInputAndInvertedWhenMappingBack() {
    val geometry = FaceLandmarkerInputGeometry.from(frame(rotationDegrees = 90, mirrored = true))

    assertEquals(1, geometry.sourcePixelX(0, 0))
    assertEquals(2, geometry.sourcePixelY(0, 0))
    val sourcePoint = geometry.sourcePoint(FaceLandmarkerPoint(0f, 0f))!!
    assertEquals(1.0, sourcePoint.x, 0.0)
    assertEquals(2.0, sourcePoint.y, 0.0)
  }

  @Test
  fun rejectsNonFiniteAndOutOfRangeLandmarks() {
    val geometry = FaceLandmarkerInputGeometry.from(frame())

    assertNull(geometry.sourcePoint(FaceLandmarkerPoint(Float.NaN, 0.5f)))
    assertNull(geometry.sourcePoint(FaceLandmarkerPoint(-0.01f, 0.5f)))
    assertNull(geometry.sourcePoint(FaceLandmarkerPoint(0.5f, 1.01f)))
  }

  private fun frame(
    rotationDegrees: Int = 0,
    mirrored: Boolean = false,
  ) = PixelFrameView(
    width = 8,
    height = 8,
    cropRect = PixelCropRect(left = 1, top = 2, right = 5, bottom = 5),
    rotationDegrees = rotationDegrees,
    mirrored = mirrored,
    colorSpace = null,
    sessionId = "geometry-test",
    frameIndex = 0,
    timestampFrameNanos = 1,
    processingElapsedNanos = 2,
    timestampSystemNanos = 3,
    yPlane = PixelPlane(ByteBuffer.allocate(64), 0, 8, 8, 8, 1),
    uPlane = PixelPlane(ByteBuffer.allocate(16), 0, 4, 4, 4, 1),
    vPlane = PixelPlane(ByteBuffer.allocate(16), 0, 4, 4, 4, 1),
  )
}
