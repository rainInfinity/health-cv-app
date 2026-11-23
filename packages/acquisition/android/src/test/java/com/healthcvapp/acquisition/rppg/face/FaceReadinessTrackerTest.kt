/** 验证无脸、姿态／大小／区域边界和单目标连续就绪。 */
package com.healthcvapp.acquisition.rppg.face

import com.google.mediapipe.tasks.components.containers.NormalizedLandmark
import com.healthcvapp.acquisition.pixels.PixelCropRect
import com.healthcvapp.acquisition.pixels.PixelFrameView
import com.healthcvapp.acquisition.pixels.PixelPlane
import com.healthcvapp.acquisition.rppg.model.RPPGConfig
import com.healthcvapp.acquisition.rppg.roi.RppgFramePixels
import com.healthcvapp.acquisition.rppg.roi.RppgRoiSampler
import java.nio.ByteBuffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FaceReadinessTrackerTest {
  @Test
  fun rejectsNoAmbiguousSmallInvalidAndPoorlyPosedFaces() {
    val tracker = FaceReadinessTracker(limits())
    assertEquals(FaceReadinessReason.NO_FACE, tracker.update(emptyList(), emptyList(), pixels(), 0).reason)
    assertEquals(
      FaceReadinessReason.MULTIPLE_FACES,
      tracker.update(listOf(face(), face()), listOf(identityMatrix(), identityMatrix()), pixels(), 10).reason,
    )
    assertEquals(
      FaceReadinessReason.INVALID_LANDMARKS,
      tracker.update(listOf(face().take(467)), listOf(identityMatrix()), pixels(), 20).reason,
    )
    assertEquals(
      FaceReadinessReason.POSE_UNAVAILABLE,
      tracker.update(listOf(face()), null, pixels(), 30).reason,
    )
    val tooSmall = tracker.update(listOf(face(width = 0.249f)), listOf(identityMatrix()), pixels(), 40)
    assertEquals(FaceReadinessReason.FACE_TOO_SMALL, tooSmall.reason)
    assertNull(tooSmall.rgbSample)
    val turned = tracker.update(listOf(face()), listOf(rotationMatrix(yawDegrees = 20.01)), pixels(), 50)
    assertEquals(FaceReadinessReason.POSE_OUT_OF_RANGE, turned.reason)
    assertNull(turned.rgbSample)

    val invalidRegions = face().toMutableList()
    invalidRegions[13] = point(0.5f, 0.4f)
    val invalidRoi = tracker.update(listOf(invalidRegions), listOf(identityMatrix()), pixels(), 60)
    assertEquals(FaceReadinessReason.ROI_INVALID, invalidRoi.reason)
    assertNull(invalidRoi.rgbSample)
  }

  @Test
  fun acceptsInclusiveFaceSizeAndPoseLimits() {
    val sizeBoundary = FaceReadinessTracker(limits()).update(
      listOf(face(width = 0.25f)),
      listOf(identityMatrix()),
      pixels(),
      0,
    )
    assertEquals(FaceReadinessReason.WAITING_FOR_CONTINUITY, sizeBoundary.reason)
    assertEquals(0.25, sizeBoundary.faceWidthFraction!!, 1e-7)

    val poseBoundary = FaceReadinessTracker(limits()).update(
      listOf(face()),
      listOf(rotationMatrix(yawDegrees = 20.0, pitchDegrees = -20.0, rollDegrees = 25.0)),
      pixels(),
      0,
    )
    assertEquals(FaceReadinessReason.WAITING_FOR_CONTINUITY, poseBoundary.reason)
    assertEquals(20.0, poseBoundary.pose!!.yawDegrees, 1e-4)
    assertEquals(-20.0, poseBoundary.pose.pitchDegrees, 1e-4)
    assertEquals(25.0, poseBoundary.pose.rollDegrees, 1e-4)
  }

  @Test
  fun shortFaceLossPreservesContinuityButTargetSwitchAndLongGapRestartIt() {
    val tracker = FaceReadinessTracker(limits())
    assertFalse(update(tracker, face(), 0).ready)
    assertFalse(update(tracker, face(), 100_000_000).ready)
    val shortLoss = tracker.update(emptyList(), emptyList(), pixels(), 150_000_000)
    assertEquals(FaceReadinessReason.NO_FACE, shortLoss.reason)
    assertEquals(150_000_000, shortLoss.continuousNanos)
    assertFalse(shortLoss.ready)

    val resumed = update(tracker, face(), 200_000_000)
    assertEquals(FaceReadinessReason.WAITING_FOR_CONTINUITY, resumed.reason)
    assertEquals(200_000_000, resumed.continuousNanos)
    var ready = resumed
    var timestamp = 300_000_000L
    while (timestamp <= 1_000_000_000L) {
      ready = update(tracker, face(), timestamp)
      timestamp += 100_000_000L
    }
    assertTrue(ready.ready)
    assertEquals(FaceReadinessReason.READY, ready.reason)
    assertNotNull(ready.rgbSample)

    val switched = update(tracker, face(centerX = 0.68f), 1_100_000_000L)
    assertEquals(FaceReadinessReason.TARGET_CHANGED, switched.reason)
    assertFalse(switched.ready)
    assertNull(switched.rgbSample)
    var afterSwitch = switched
    timestamp = 1_200_000_000L
    while (timestamp <= 2_100_000_000L) {
      afterSwitch = update(tracker, face(centerX = 0.68f), timestamp)
      timestamp += 100_000_000L
    }
    assertTrue(afterSwitch.ready)

    val longGap = update(tracker, face(centerX = 0.68f), 2_400_000_000L)
    assertEquals(FaceReadinessReason.FRAME_GAP, longGap.reason)
    assertFalse(longGap.ready)
    assertNull(longGap.rgbSample)
  }

  private fun update(tracker: FaceReadinessTracker, landmarks: List<NormalizedLandmark>, timestamp: Long) =
    tracker.update(listOf(landmarks), listOf(identityMatrix()), pixels(), timestamp)

  private fun face(
    width: Float = 0.3f,
    centerX: Float = 0.5f,
  ): List<NormalizedLandmark> {
    val landmarks = MutableList(478) { point(0.5f, 0.5f) }
    landmarks[10] = point(centerX, 0.2f)
    landmarks[152] = point(centerX, 0.8f)
    landmarks[234] = point(centerX - width / 2f, 0.5f)
    landmarks[454] = point(centerX + width / 2f, 0.5f)
    landmarks[1] = point(centerX, 0.5f)
    listOf(46, 53, 52, 65, 55, 70, 63, 105, 66, 107, 276, 283, 282, 295, 285, 300, 293, 334, 296, 336)
      .forEach { landmarks[it] = point(centerX, 0.38f) }
    listOf(144, 145, 153, 154, 155, 373, 374, 380, 381, 382)
      .forEach { landmarks[it] = point(centerX, 0.5f) }
    landmarks[13] = point(centerX, 0.65f)
    landmarks[61] = point(centerX - width * 0.1f, 0.66f)
    landmarks[291] = point(centerX + width * 0.1f, 0.66f)
    return landmarks
  }

  private fun point(x: Float, y: Float) = NormalizedLandmark.create(x, y, 0f)

  private fun pixels(): RppgFramePixels {
    val source = PixelFrameView(
      width = 100,
      height = 100,
      cropRect = PixelCropRect(0, 0, 100, 100),
      rotationDegrees = 0,
      mirrored = false,
      colorSpace = null,
      sessionId = "face-readiness-test",
      frameIndex = 0,
      timestampFrameNanos = 1,
      processingElapsedNanos = 2,
      timestampSystemNanos = 3,
      yPlane = PixelPlane(ByteBuffer.allocate(10_000), 0, 100, 100, 100, 1),
      uPlane = PixelPlane(ByteBuffer.allocate(2_500), 0, 50, 50, 50, 1),
      vPlane = PixelPlane(ByteBuffer.allocate(2_500), 0, 50, 50, 50, 1),
    )
    return RppgFramePixels(
      source,
      IntArray(10_000) { 0xFF556677.toInt() },
      FaceLandmarkerInputGeometry.from(source),
      RppgRoiSampler(),
    )
  }

  private fun limits() = RPPGConfig.EXPERIMENTAL_V2.faceReadiness

  private fun identityMatrix() = floatArrayOf(
    1f, 0f, 0f, 0f,
    0f, 1f, 0f, 0f,
    0f, 0f, 1f, 0f,
    0f, 0f, 0f, 1f,
  )

  private fun rotationMatrix(
    yawDegrees: Double = 0.0,
    pitchDegrees: Double = 0.0,
    rollDegrees: Double = 0.0,
  ): FloatArray {
    val yaw = Math.toRadians(yawDegrees)
    val pitch = Math.toRadians(pitchDegrees)
    val roll = Math.toRadians(rollDegrees)
    val cy = kotlin.math.cos(yaw)
    val sy = kotlin.math.sin(yaw)
    val cp = kotlin.math.cos(pitch)
    val sp = kotlin.math.sin(pitch)
    val cr = kotlin.math.cos(roll)
    val sr = kotlin.math.sin(roll)
    return floatArrayOf(
      (cy * cr).toFloat(), (cy * sr).toFloat(), (-sy).toFloat(), 0f,
      (cr * sy * sp - sr * cp).toFloat(), (sr * sy * sp + cr * cp).toFloat(), (cy * sp).toFloat(), 0f,
      (cr * sy * cp + sr * sp).toFloat(), (sr * sy * cp - cr * sp).toFloat(), (cy * cp).toFloat(), 0f,
      0f, 0f, 0f, 1f,
    )
  }
}
