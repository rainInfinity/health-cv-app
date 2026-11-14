/** 定义 Face Landmarker 输入坐标与借用源帧之间的几何映射。 */
package com.healthcvapp.acquisition.rppg.face

import com.healthcvapp.acquisition.pixels.PixelFrameView

/** Face Landmarker 输出的归一化输入图像坐标。 */
internal data class FaceLandmarkerPoint(
  val x: Float,
  val y: Float,
)

/** 源帧中的连续像素边界坐标；坐标原点位于图像左上边缘。 */
internal data class FaceSourcePoint(
  val x: Double,
  val y: Double,
)

/** 将有效 crop、旋转和预览镜像映射到模型输入方向。 */
internal class FaceLandmarkerInputGeometry private constructor(
  private val cropLeft: Int,
  private val cropTop: Int,
  private val cropRight: Int,
  private val cropBottom: Int,
  private val rotationDegrees: Int,
  private val mirrored: Boolean,
) {
  /** 旋转并镜像后交给模型的图像宽度，单位为像素。 */
  val inputWidth: Int = if (rotationDegrees == 90 || rotationDegrees == 270) {
    cropBottom - cropTop
  } else {
    cropRight - cropLeft
  }

  /** 旋转并镜像后交给模型的图像高度，单位为像素。 */
  val inputHeight: Int = if (rotationDegrees == 90 || rotationDegrees == 270) {
    cropRight - cropLeft
  } else {
    cropBottom - cropTop
  }

  /** 将模型归一化坐标还原为源帧像素边界坐标；非法或越界坐标返回 null。 */
  fun sourcePoint(point: FaceLandmarkerPoint): FaceSourcePoint? {
    if (!point.x.isFinite() || !point.y.isFinite() || point.x !in 0f..1f || point.y !in 0f..1f) {
      return null
    }
    val inputX = point.x.toDouble() * inputWidth
    val inputY = point.y.toDouble() * inputHeight
    val rotatedX = if (mirrored) inputWidth - inputX else inputX
    val cropX: Double
    val cropY: Double
    when (rotationDegrees) {
      0 -> {
        cropX = rotatedX
        cropY = inputY
      }
      90 -> {
        cropX = inputY
        cropY = cropBottom - cropTop - rotatedX
      }
      180 -> {
        cropX = cropRight - cropLeft - rotatedX
        cropY = cropBottom - cropTop - inputY
      }
      else -> {
        cropX = cropRight - cropLeft - inputY
        cropY = rotatedX
      }
    }
    return FaceSourcePoint(cropLeft + cropX, cropTop + cropY)
  }

  /** 将模型输入中的像素坐标映回源帧的整数像素坐标。调用方须传入输入图像内坐标。 */
  fun sourcePixelX(inputX: Int, inputY: Int): Int {
    val rotatedX = if (mirrored) inputWidth - 1 - inputX else inputX
    return when (rotationDegrees) {
      0 -> cropLeft + rotatedX
      90 -> cropLeft + inputY
      180 -> cropRight - 1 - rotatedX
      else -> cropRight - 1 - inputY
    }
  }

  /** 将模型输入中的像素坐标映回源帧的整数像素坐标。调用方须传入输入图像内坐标。 */
  fun sourcePixelY(inputX: Int, inputY: Int): Int {
    val rotatedX = if (mirrored) inputWidth - 1 - inputX else inputX
    return when (rotationDegrees) {
      0 -> cropTop + inputY
      90 -> cropBottom - 1 - rotatedX
      180 -> cropBottom - 1 - inputY
      else -> cropTop + rotatedX
    }
  }

  companion object {
    /** 从借用帧的有效区域和方向元数据创建映射。 */
    fun from(frame: PixelFrameView): FaceLandmarkerInputGeometry {
      frame.checkActive()
      return FaceLandmarkerInputGeometry(
        cropLeft = frame.cropRect.left,
        cropTop = frame.cropRect.top,
        cropRight = frame.cropRect.right,
        cropBottom = frame.cropRect.bottom,
        rotationDegrees = frame.rotationDegrees,
        mirrored = frame.mirrored,
      )
    }
  }
}
