/** 验证官方列主序矩阵的旋转分解与退化拒绝。 */
package com.healthcvapp.acquisition.rppg.face

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FacePoseEstimatorTest {
  @Test
  fun extractsYawPitchAndRollFromScaledColumnMajorMatrices() {
    val yaw = FacePoseEstimator.fromColumnMajor(rotationMatrix(yawDegrees = 20.0))!!
    assertEquals(20.0, yaw.yawDegrees, 1e-4)
    assertEquals(0.0, yaw.pitchDegrees, 1e-4)
    assertEquals(0.0, yaw.rollDegrees, 1e-4)

    val pitch = FacePoseEstimator.fromColumnMajor(rotationMatrix(pitchDegrees = -15.0))!!
    assertEquals(0.0, pitch.yawDegrees, 1e-4)
    assertEquals(-15.0, pitch.pitchDegrees, 1e-4)
    assertEquals(0.0, pitch.rollDegrees, 1e-4)

    val roll = FacePoseEstimator.fromColumnMajor(rotationMatrix(rollDegrees = 25.0))!!
    assertEquals(0.0, roll.yawDegrees, 1e-4)
    assertEquals(0.0, roll.pitchDegrees, 1e-4)
    assertEquals(25.0, roll.rollDegrees, 1e-4)
  }

  @Test
  fun rejectsMissingMalformedAndSingularMatrices() {
    assertNull(FacePoseEstimator.fromColumnMajor(null))
    assertNull(FacePoseEstimator.fromColumnMajor(FloatArray(15)))
    assertNull(FacePoseEstimator.fromColumnMajor(FloatArray(16)))
    val nonFinite = identityMatrix().also { it[4] = Float.NaN }
    assertNull(FacePoseEstimator.fromColumnMajor(nonFinite))
  }

  private fun rotationMatrix(
    yawDegrees: Double = 0.0,
    pitchDegrees: Double = 0.0,
    rollDegrees: Double = 0.0,
  ): FloatArray {
    val yaw = Math.toRadians(yawDegrees)
    val pitch = Math.toRadians(pitchDegrees)
    val roll = Math.toRadians(rollDegrees)
    val cosineYaw = kotlin.math.cos(yaw)
    val sineYaw = kotlin.math.sin(yaw)
    val cosinePitch = kotlin.math.cos(pitch)
    val sinePitch = kotlin.math.sin(pitch)
    val cosineRoll = kotlin.math.cos(roll)
    val sineRoll = kotlin.math.sin(roll)
    val matrix = floatArrayOf(
      (cosineYaw * cosineRoll).toFloat(),
      (cosineYaw * sineRoll).toFloat(),
      (-sineYaw).toFloat(),
      0f,
      (cosineRoll * sineYaw * sinePitch - sineRoll * cosinePitch).toFloat(),
      (sineRoll * sineYaw * sinePitch + cosineRoll * cosinePitch).toFloat(),
      (cosineYaw * sinePitch).toFloat(),
      0f,
      (cosineRoll * sineYaw * cosinePitch + sineRoll * sinePitch).toFloat(),
      (sineRoll * sineYaw * cosinePitch - cosineRoll * sinePitch).toFloat(),
      (cosineYaw * cosinePitch).toFloat(),
      0f,
      0f,
      0f,
      0f,
      1f,
    )
    for (index in 0..10) matrix[index] *= 2f
    return matrix
  }

  private fun identityMatrix() = floatArrayOf(
    1f, 0f, 0f, 0f,
    0f, 1f, 0f, 0f,
    0f, 0f, 1f, 0f,
    0f, 0f, 0f, 1f,
  )
}
