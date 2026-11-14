/** 依据 Face Landmarker 面部拓扑建立额头与双颊内部区域并汇总 RGB。 */
package com.healthcvapp.acquisition.rppg.roi

import com.google.mediapipe.tasks.components.containers.NormalizedLandmark
import com.healthcvapp.acquisition.rppg.face.FaceLandmarkerPoint

/** 面部外框在归一化模型输入坐标中的连续范围。 */
internal data class FaceBounds(
  val left: Double,
  val top: Double,
  val right: Double,
  val bottom: Double,
) {
  val width: Double = right - left
  val height: Double = bottom - top
  val centerX: Double = (left + right) * 0.5
  val centerY: Double = (top + bottom) * 0.5
  val aspectRatio: Double = width / height
}

/** 三个 ROI 的单独统计及按有效像素数加权的 RGB。 */
internal data class FaceRoiSamples(
  val forehead: RppgRgbMean,
  val leftCheek: RppgRgbMean,
  val rightCheek: RppgRgbMean,
  val combined: RppgRgbMean,
)

/** 用眼、眉、鼻、嘴与脸部边界关键点构造稳定的内部取色区域。 */
internal class FaceRoiRegions private constructor(
  val bounds: FaceBounds,
  private val forehead: List<FaceLandmarkerPoint>,
  private val leftCheek: List<FaceLandmarkerPoint>,
  private val rightCheek: List<FaceLandmarkerPoint>,
) {
  /** 任一 ROI 不满足有效覆盖时拒绝整帧，不使用部分区域回退。 */
  fun sample(frame: RppgFramePixels, minimumCoverageFraction: Double): FaceRoiSamples? {
    val foreheadSample = frame.samplePolygon(forehead, minimumCoverageFraction) ?: return null
    val leftSample = frame.samplePolygon(leftCheek, minimumCoverageFraction) ?: return null
    val rightSample = frame.samplePolygon(rightCheek, minimumCoverageFraction) ?: return null
    val totalPixels = foreheadSample.pixelCount.toLong() + leftSample.pixelCount + rightSample.pixelCount
    if (totalPixels <= 0L || totalPixels > Int.MAX_VALUE) return null
    val total = totalPixels.toDouble()
    return FaceRoiSamples(
      forehead = foreheadSample,
      leftCheek = leftSample,
      rightCheek = rightSample,
      combined = RppgRgbMean(
        red = (
          foreheadSample.red * foreheadSample.pixelCount +
            leftSample.red * leftSample.pixelCount +
            rightSample.red * rightSample.pixelCount
          ) / total,
        green = (
          foreheadSample.green * foreheadSample.pixelCount +
            leftSample.green * leftSample.pixelCount +
            rightSample.green * rightSample.pixelCount
          ) / total,
        blue = (
          foreheadSample.blue * foreheadSample.pixelCount +
            leftSample.blue * leftSample.pixelCount +
            rightSample.blue * rightSample.pixelCount
          ) / total,
        pixelCount = totalPixels.toInt(),
        coverageFraction = minOf(
          foreheadSample.coverageFraction,
          leftSample.coverageFraction,
          rightSample.coverageFraction,
        ),
      ),
    )
  }

  companion object {
    private const val MIN_MODEL_LANDMARK_COUNT = 468
    private const val FACE_LEFT = 234
    private const val FACE_RIGHT = 454
    private const val FACE_TOP = 10
    private const val FACE_CHIN = 152
    private const val NOSE_CENTER = 1
    private const val UPPER_LIP_CENTER = 13
    private const val MOUTH_LEFT = 61
    private const val MOUTH_RIGHT = 291
    private val BROW_LANDMARKS = intArrayOf(
      46, 53, 52, 65, 55, 70, 63, 105, 66, 107,
      276, 283, 282, 295, 285, 300, 293, 334, 296, 336,
    )
    private val LOWER_EYE_LANDMARKS = intArrayOf(144, 145, 153, 154, 155, 373, 374, 380, 381, 382)

    /** 从官方 Face Landmarker 网格的轮廓、眉眼和唇部点建立三个内部多边形。 */
    fun fromLandmarks(landmarks: List<NormalizedLandmark>): FaceRoiRegions? {
      if (landmarks.size < MIN_MODEL_LANDMARK_COUNT) return null
      val leftFacePoint = pointAt(landmarks, FACE_LEFT) ?: return null
      val rightFacePoint = pointAt(landmarks, FACE_RIGHT) ?: return null
      val topFacePoint = pointAt(landmarks, FACE_TOP) ?: return null
      val chinPoint = pointAt(landmarks, FACE_CHIN) ?: return null
      val nosePoint = pointAt(landmarks, NOSE_CENTER) ?: return null
      val faceLeft = minOf(leftFacePoint.x, rightFacePoint.x).toDouble()
      val faceRight = maxOf(leftFacePoint.x, rightFacePoint.x).toDouble()
      val faceTop = topFacePoint.y.toDouble()
      val faceBottom = chinPoint.y.toDouble()
      val faceWidth = faceRight - faceLeft
      val faceHeight = faceBottom - faceTop
      if (faceWidth <= 0.0 || faceHeight <= 0.0) return null

      var browBottom = Double.NEGATIVE_INFINITY
      for (index in BROW_LANDMARKS) {
        val point = pointAt(landmarks, index) ?: return null
        browBottom = maxOf(browBottom, point.y.toDouble())
      }
      var eyeBottom = Double.NEGATIVE_INFINITY
      for (index in LOWER_EYE_LANDMARKS) {
        val point = pointAt(landmarks, index) ?: return null
        eyeBottom = maxOf(eyeBottom, point.y.toDouble())
      }
      val mouthTop = minOf(
        pointAt(landmarks, UPPER_LIP_CENTER)?.y?.toDouble() ?: return null,
        pointAt(landmarks, MOUTH_LEFT)?.y?.toDouble() ?: return null,
        pointAt(landmarks, MOUTH_RIGHT)?.y?.toDouble() ?: return null,
      )

      if (browBottom >= eyeBottom) return null

      val foreheadLeft = faceLeft + faceWidth * 0.18
      val foreheadRight = faceRight - faceWidth * 0.18
      val foreheadTop = faceTop + faceHeight * 0.12
      val foreheadBottom = minOf(
        browBottom - faceHeight * 0.04,
        eyeBottom - faceHeight * 0.08,
      )
      val cheekTop = eyeBottom + faceHeight * 0.04
      val cheekBottom = mouthTop - faceHeight * 0.05
      val centerX = nosePoint.x.toDouble()
      val cheekOuterLeft = faceLeft + faceWidth * 0.12
      val cheekInnerLeft = centerX - faceWidth * 0.12
      val cheekInnerRight = centerX + faceWidth * 0.12
      val cheekOuterRight = faceRight - faceWidth * 0.12
      if (foreheadRight <= foreheadLeft || foreheadBottom <= foreheadTop ||
        cheekBottom <= cheekTop || cheekInnerLeft <= cheekOuterLeft || cheekOuterRight <= cheekInnerRight
      ) {
        return null
      }

      return FaceRoiRegions(
        bounds = FaceBounds(faceLeft, faceTop, faceRight, faceBottom),
        forehead = rectangle(foreheadLeft, foreheadTop, foreheadRight, foreheadBottom),
        leftCheek = rectangle(cheekOuterLeft, cheekTop, cheekInnerLeft, cheekBottom),
        rightCheek = rectangle(cheekInnerRight, cheekTop, cheekOuterRight, cheekBottom),
      )
    }

    private fun pointAt(landmarks: List<NormalizedLandmark>, index: Int): FaceLandmarkerPoint? {
      val landmark = landmarks.getOrNull(index) ?: return null
      val x = landmark.x()
      val y = landmark.y()
      if (!x.isFinite() || !y.isFinite()) return null
      return FaceLandmarkerPoint(x, y)
    }

    private fun rectangle(left: Double, top: Double, right: Double, bottom: Double) = listOf(
      FaceLandmarkerPoint(left.toFloat(), top.toFloat()),
      FaceLandmarkerPoint(right.toFloat(), top.toFloat()),
      FaceLandmarkerPoint(right.toFloat(), bottom.toFloat()),
      FaceLandmarkerPoint(left.toFloat(), bottom.toFloat()),
    )
  }
}
