/** 验证额头／双颊区域边界、无效区域拒绝和有效面积加权。 */
package com.healthcvapp.acquisition.rppg.roi

import com.google.mediapipe.tasks.components.containers.NormalizedLandmark
import com.healthcvapp.acquisition.pixels.PixelCropRect
import com.healthcvapp.acquisition.pixels.PixelFrameView
import com.healthcvapp.acquisition.pixels.PixelPlane
import com.healthcvapp.acquisition.rppg.face.FaceLandmarkerInputGeometry
import java.nio.ByteBuffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class FaceRoiRegionsTest {
  @Test
  fun threeInternalRegionsAreSampledAndCombinedByValidPixelCount() {
    val landmarks = faceLandmarks()
    val regions = FaceRoiRegions.fromLandmarks(landmarks)!!
    val frame = frame()
    val geometry = FaceLandmarkerInputGeometry.from(frame)
    val pixels = IntArray(geometry.inputWidth * geometry.inputHeight)
    for (y in 0 until geometry.inputHeight) {
      for (x in 0 until geometry.inputWidth) {
        val nx = (x + 0.5) / geometry.inputWidth
        val ny = (y + 0.5) / geometry.inputHeight
        pixels[y * geometry.inputWidth + x] = when {
          nx in 0.308..0.692 && ny in 0.272..0.356 -> RED
          nx in 0.272..0.428 && ny in 0.524..0.62 -> GREEN
          nx in 0.572..0.728 && ny in 0.524..0.62 -> BLUE
          else -> BLACK
        }
      }
    }
    val rgbFrame = RppgFramePixels(frame, pixels, geometry, RppgRoiSampler())

    val samples = regions.sample(rgbFrame, minimumCoverageFraction = 0.95)

    assertNotNull(samples)
    val forehead = samples!!.forehead
    val leftCheek = samples.leftCheek
    val rightCheek = samples.rightCheek
    val combined = samples.combined
    assertEquals(255.0, forehead.red, 0.0)
    assertEquals(0.0, forehead.green, 0.0)
    assertEquals(255.0, leftCheek.green, 0.0)
    assertEquals(255.0, rightCheek.blue, 0.0)
    val total = forehead.pixelCount + leftCheek.pixelCount + rightCheek.pixelCount
    assertEquals(total, combined.pixelCount)
    assertEquals(forehead.pixelCount * 255.0 / total, combined.red, 1e-9)
    assertEquals(leftCheek.pixelCount * 255.0 / total, combined.green, 1e-9)
    assertEquals(rightCheek.pixelCount * 255.0 / total, combined.blue, 1e-9)
  }

  @Test
  fun rejectsMissingTopologyAndOverlappingInvalidFaceRegions() {
    assertNull(FaceRoiRegions.fromLandmarks(faceLandmarks().take(467)))
    val invalid = faceLandmarks().toMutableList()
    invalid[13] = NormalizedLandmark.create(0.5f, 0.4f, 0f)
    assertNull(FaceRoiRegions.fromLandmarks(invalid))
  }

  private fun faceLandmarks(): List<NormalizedLandmark> {
    val landmarks = MutableList(478) { NormalizedLandmark.create(0.5f, 0.5f, 0f) }
    landmarks[10] = point(0.5f, 0.2f)
    landmarks[152] = point(0.5f, 0.8f)
    landmarks[234] = point(0.2f, 0.5f)
    landmarks[454] = point(0.8f, 0.5f)
    landmarks[1] = point(0.5f, 0.5f)
    listOf(46, 53, 52, 65, 55, 70, 63, 105, 66, 107, 276, 283, 282, 295, 285, 300, 293, 334, 296, 336)
      .forEach { landmarks[it] = point(0.5f, 0.38f) }
    listOf(144, 145, 153, 154, 155, 373, 374, 380, 381, 382)
      .forEach { landmarks[it] = point(0.5f, 0.5f) }
    landmarks[13] = point(0.5f, 0.65f)
    landmarks[61] = point(0.4f, 0.66f)
    landmarks[291] = point(0.6f, 0.66f)
    return landmarks
  }

  private fun point(x: Float, y: Float) = NormalizedLandmark.create(x, y, 0f)

  private fun frame() = PixelFrameView(
    width = 100,
    height = 100,
    cropRect = PixelCropRect(0, 0, 100, 100),
    rotationDegrees = 0,
    mirrored = false,
    colorSpace = null,
    sessionId = "roi-test",
    frameIndex = 0,
    timestampFrameNanos = 1,
    processingElapsedNanos = 2,
    timestampSystemNanos = 3,
    yPlane = PixelPlane(ByteBuffer.allocate(10_000), 0, 100, 100, 100, 1),
    uPlane = PixelPlane(ByteBuffer.allocate(2_500), 0, 50, 50, 50, 1),
    vPlane = PixelPlane(ByteBuffer.allocate(2_500), 0, 50, 50, 50, 1),
  )

  private companion object {
    const val BLACK = -0x1000000
    const val RED = -0x10000
    const val GREEN = -0xff0100
    const val BLUE = -0xffff01
  }
}
