/** 以大小、姿态、ROI 和时空连续性判定当前人脸能否进入测量。 */
package com.healthcvapp.acquisition.rppg.face

import com.google.mediapipe.tasks.components.containers.NormalizedLandmark
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarkerResult
import com.healthcvapp.acquisition.rppg.model.RPPGFaceReadinessConfig
import com.healthcvapp.acquisition.rppg.roi.FaceBounds
import com.healthcvapp.acquisition.rppg.roi.FaceRoiRegions
import com.healthcvapp.acquisition.rppg.roi.FaceRoiSamples
import com.healthcvapp.acquisition.rppg.roi.RppgFramePixels
import com.healthcvapp.acquisition.rppg.roi.RppgRgbMean
import kotlin.math.abs
import kotlin.math.hypot

/** 单帧就绪状态及本帧可安全使用的 RGB 样本。 */
internal data class FaceReadinessUpdate(
  val ready: Boolean,
  val reason: FaceReadinessReason,
  val continuousNanos: Long,
  val faceWidthFraction: Double?,
  val pose: FacePose?,
  val roiSamples: FaceRoiSamples?,
  val rgbSample: RppgRgbMean?,
)

/** 面部质量与连续性判定原因。 */
internal enum class FaceReadinessReason {
  READY,
  WAITING_FOR_CONTINUITY,
  NO_FACE,
  MULTIPLE_FACES,
  INVALID_LANDMARKS,
  FACE_TOO_SMALL,
  POSE_UNAVAILABLE,
  POSE_OUT_OF_RANGE,
  ROI_INVALID,
  FRAME_GAP,
  TARGET_CHANGED,
  NON_MONOTONIC_TIME,
}

/** 单目标连续关联只依赖几何变化；不会尝试识别或区分身份。 */
internal class FaceReadinessTracker(
  private val limits: RPPGFaceReadinessConfig,
) {
  private var previousBounds: FaceBounds? = null
  private var readySinceNanos: Long? = null
  private var lastValidNanos: Long? = null
  private var lastObservedNanos: Long? = null

  /** 从模型结果中读取同帧关键点及官方变换矩阵。 */
  fun update(
    result: FaceLandmarkerResult,
    pixels: RppgFramePixels,
    timestampNanos: Long,
  ): FaceReadinessUpdate = update(
    faces = result.faceLandmarks(),
    transformationMatrices = result.facialTransformationMatrixes().orElse(null),
    pixels = pixels,
    timestampNanos = timestampNanos,
  )

  /** 开始新会话或片段前清空目标连续状态。 */
  fun reset() {
    clearTrack()
    lastObservedNanos = null
  }

  /** 评估单帧人脸集合；不合格帧不输出颜色，短暂丢脸不跨越最大有效帧间隔。 */
  fun update(
    faces: List<List<NormalizedLandmark>>,
    transformationMatrices: List<FloatArray>?,
    pixels: RppgFramePixels,
    timestampNanos: Long,
  ): FaceReadinessUpdate {
    if (timestampNanos < 0L || lastObservedNanos?.let { timestampNanos <= it } == true) {
      clearTrack()
      lastObservedNanos = null
      return updateWithoutFace(FaceReadinessReason.NON_MONOTONIC_TIME, timestampNanos)
    }
    lastObservedNanos = timestampNanos

    if (faces.isEmpty()) return updateWithoutFace(FaceReadinessReason.NO_FACE, timestampNanos)
    if (faces.size != 1) {
      clearTrack()
      return updateWithoutFace(FaceReadinessReason.MULTIPLE_FACES, timestampNanos)
    }
    val landmarks = faces.single()
    if (landmarks.size < MIN_LANDMARK_COUNT) {
      return updateWithoutFace(FaceReadinessReason.INVALID_LANDMARKS, timestampNanos)
    }
    val matrix = transformationMatrices?.singleOrNull()
      ?: return updateWithoutFace(FaceReadinessReason.POSE_UNAVAILABLE, timestampNanos)
    val pose = FacePoseEstimator.fromColumnMajor(matrix)
      ?: return updateWithoutFace(FaceReadinessReason.POSE_UNAVAILABLE, timestampNanos)
    if (abs(pose.yawDegrees) - limits.maximumYawDegrees > ANGLE_EPSILON_DEGREES ||
      abs(pose.pitchDegrees) - limits.maximumPitchDegrees > ANGLE_EPSILON_DEGREES ||
      abs(pose.rollDegrees) - limits.maximumRollDegrees > ANGLE_EPSILON_DEGREES
    ) {
      return updateWithoutFace(FaceReadinessReason.POSE_OUT_OF_RANGE, timestampNanos, pose)
    }

    val regions = FaceRoiRegions.fromLandmarks(landmarks)
      ?: return updateWithoutFace(FaceReadinessReason.ROI_INVALID, timestampNanos, pose)
    val widthFraction = regions.bounds.width
    if (widthFraction < limits.minimumFaceWidthFraction) {
      return updateWithoutFace(
        FaceReadinessReason.FACE_TOO_SMALL,
        timestampNanos,
        pose,
        widthFraction,
      )
    }
    val roiSamples = regions.sample(pixels, limits.minimumRoiCoverageFraction)
      ?: return updateWithoutFace(
        FaceReadinessReason.ROI_INVALID,
        timestampNanos,
        pose,
        widthFraction,
      )
    val candidate = FaceCandidate(regions, widthFraction, pose, roiSamples)
    val lastValid = lastValidNanos
    if (lastValid != null && timestampNanos - lastValid > limits.maximumAdjacentValidGapNanos) {
      beginTrack(candidate, timestampNanos)
      return waiting(FaceReadinessReason.FRAME_GAP, candidate, timestampNanos)
    }

    val previous = previousBounds
    if (previous == null) {
      beginTrack(candidate, timestampNanos)
      return waiting(FaceReadinessReason.WAITING_FOR_CONTINUITY, candidate, timestampNanos)
    }
    if (!isContinuous(previous, regions.bounds)) {
      beginTrack(candidate, timestampNanos)
      return waiting(FaceReadinessReason.TARGET_CHANGED, candidate, timestampNanos)
    }

    previousBounds = regions.bounds
    lastValidNanos = timestampNanos
    val readySince = checkNotNull(readySinceNanos)
    val continuousNanos = timestampNanos - readySince
    val isReady = continuousNanos >= limits.requiredContinuousNanos
    return FaceReadinessUpdate(
      ready = isReady,
      reason = if (isReady) FaceReadinessReason.READY else FaceReadinessReason.WAITING_FOR_CONTINUITY,
      continuousNanos = continuousNanos,
      faceWidthFraction = widthFraction,
      pose = pose,
      roiSamples = roiSamples,
      rgbSample = if (isReady) roiSamples.combined else null,
    )
  }

  /** 丢失或质量不合格时清空连续目标；只保留最大间隔内可恢复的短暂失效。 */
  private fun updateWithoutFace(
    reason: FaceReadinessReason,
    timestampNanos: Long,
    pose: FacePose? = null,
    faceWidthFraction: Double? = null,
  ): FaceReadinessUpdate {
    val lastValid = lastValidNanos
    if (lastValid == null || timestampNanos < lastValid ||
      timestampNanos - lastValid > limits.maximumAdjacentValidGapNanos
    ) {
      clearTrack()
    }
    return FaceReadinessUpdate(
      ready = false,
      reason = reason,
      continuousNanos = readySinceNanos?.let { (timestampNanos - it).coerceAtLeast(0L) } ?: 0L,
      faceWidthFraction = faceWidthFraction,
      pose = pose,
      roiSamples = null,
      rgbSample = null,
    )
  }

  private fun beginTrack(candidate: FaceCandidate, timestampNanos: Long) {
    previousBounds = candidate.regions.bounds
    readySinceNanos = timestampNanos
    lastValidNanos = timestampNanos
  }

  private fun waiting(
    reason: FaceReadinessReason,
    candidate: FaceCandidate,
    timestampNanos: Long,
  ): FaceReadinessUpdate = FaceReadinessUpdate(
    ready = false,
    reason = reason,
    continuousNanos = timestampNanos - checkNotNull(readySinceNanos),
    faceWidthFraction = candidate.widthFraction,
    pose = candidate.pose,
    roiSamples = candidate.roiSamples,
    rgbSample = null,
  )

  private fun isContinuous(previous: FaceBounds, current: FaceBounds): Boolean {
    val movement = hypot(current.centerX - previous.centerX, current.centerY - previous.centerY)
    val referenceWidth = maxOf(previous.width, current.width)
    if (movement > limits.maximumCenterShiftFaceWidths * referenceWidth) return false
    val widthRatio = current.width / previous.width
    val heightRatio = current.height / previous.height
    if (widthRatio !in limits.minimumFaceScaleRatio..limits.maximumFaceScaleRatio ||
      heightRatio !in limits.minimumFaceScaleRatio..limits.maximumFaceScaleRatio
    ) {
      return false
    }
    val aspectChange = abs(current.aspectRatio / previous.aspectRatio - 1.0)
    return aspectChange <= limits.maximumAspectRatioChangeFraction
  }

  private fun clearTrack() {
    previousBounds = null
    readySinceNanos = null
    lastValidNanos = null
  }

  private data class FaceCandidate(
    val regions: FaceRoiRegions,
    val widthFraction: Double,
    val pose: FacePose,
    val roiSamples: FaceRoiSamples,
  )

  private companion object {
    const val MIN_LANDMARK_COUNT = 468
    const val ANGLE_EPSILON_DEGREES = 1e-4
  }
}
