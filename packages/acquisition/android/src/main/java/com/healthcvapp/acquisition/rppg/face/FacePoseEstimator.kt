/** 从 Face Landmarker 官方变换矩阵提取仅用于质量门控的姿态角。 */
package com.healthcvapp.acquisition.rppg.face

import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sqrt

/** 以角度表示的近似 yaw、pitch、roll；不作为医学姿态结论。 */
internal data class FacePose(
  val yawDegrees: Double,
  val pitchDegrees: Double,
  val rollDegrees: Double,
)

/** 解析官方列主序 4×4 面部变换矩阵，移除列缩放后读取旋转分量。 */
internal object FacePoseEstimator {
  /** 无矩阵、非有限值或退化旋转矩阵返回 null。 */
  fun fromColumnMajor(matrix: FloatArray?): FacePose? {
    if (matrix == null || matrix.size != MATRIX_SIZE) return null
    for (value in matrix) {
      if (!value.isFinite()) return null
    }

    val scaleX = vectorLength(matrix[0], matrix[1], matrix[2])
    val scaleY = vectorLength(matrix[4], matrix[5], matrix[6])
    val scaleZ = vectorLength(matrix[8], matrix[9], matrix[10])
    if (scaleX <= MIN_SCALE || scaleY <= MIN_SCALE || scaleZ <= MIN_SCALE) return null

    val r00 = matrix[0] / scaleX
    val r10 = matrix[1] / scaleX
    val r20 = matrix[2] / scaleX
    val r11 = matrix[5] / scaleY
    val r21 = matrix[6] / scaleY
    val r12 = matrix[9] / scaleZ
    val r22 = matrix[10] / scaleZ
    val yaw = asin((-r20).coerceIn(-1.0, 1.0))
    val pitch: Double
    val roll: Double
    if (abs(cos(yaw)) > GIMBAL_EPSILON) {
      pitch = atan2(r21, r22)
      roll = atan2(r10, r00)
    } else {
      pitch = atan2(-r12, r11)
      roll = 0.0
    }
    val degreesPerRadian = 180.0 / Math.PI
    val pose = FacePose(yaw * degreesPerRadian, pitch * degreesPerRadian, roll * degreesPerRadian)
    return pose.takeIf {
      it.yawDegrees.isFinite() && it.pitchDegrees.isFinite() && it.rollDegrees.isFinite()
    }
  }

  private fun vectorLength(x: Float, y: Float, z: Float): Double =
    sqrt(x.toDouble() * x + y.toDouble() * y + z.toDouble() * z)

  private const val MATRIX_SIZE = 16
  private const val MIN_SCALE = 1e-6
  private const val GIMBAL_EPSILON = 1e-6
}
