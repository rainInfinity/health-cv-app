/** 复用有限尺寸的模型输入与原生像素缓冲，限定每帧 RGB 视图的同步有效期。 */
package com.healthcvapp.acquisition.rppg.face

import android.graphics.Bitmap
import com.healthcvapp.acquisition.pixels.PixelFrameView
import com.healthcvapp.acquisition.rppg.roi.RppgFramePixels
import com.healthcvapp.acquisition.rppg.roi.RppgRoiSampler
import kotlin.math.max
import kotlin.math.roundToInt

/** 只将最长边超限的模型输入缩小；ROI 在同帧原始 YUV 上按需取色。 */
internal class FaceLandmarkerInputConverter(
  private val maximumModelInputDimensionPx: Int = DEFAULT_MODEL_INPUT_DIMENSION_PX,
) : AutoCloseable {
  private var bitmap: Bitmap? = null
  private var argbPixels = IntArray(0)
  private var sourceWidth = 0
  private var sourceHeight = 0
  private var modelWidth = 0
  private var modelHeight = 0
  private var active = false
  private val roiSampler = RppgRoiSampler()

  init {
    require(maximumModelInputDimensionPx > 0) { "model input dimension must be positive" }
  }

  /** 在借用帧期间完成模型输入转换、同步推理和 ROI 结果消费。 */
  fun <T> withInput(
    frame: PixelFrameView,
    consume: (Bitmap, RppgFramePixels) -> T,
  ): T {
    check(!active) { "face input conversion must be serial" }
    active = true
    try {
      frame.checkActive()
      val geometry = FaceLandmarkerInputGeometry.from(frame)
      ensureBuffers(geometry.inputWidth, geometry.inputHeight)
      FaceLandmarkerFramePixelConverter.fillArgb(
        frame,
        geometry,
        modelWidth,
        modelHeight,
        argbPixels,
      )
      val currentBitmap = checkNotNull(bitmap)
      currentBitmap.setPixels(argbPixels, 0, modelWidth, 0, 0, modelWidth, modelHeight)
      val rgbFrame = RppgFramePixels(frame, geometry, roiSampler)
      return try {
        consume(currentBitmap, rgbFrame)
      } finally {
        rgbFrame.expire()
      }
    } finally {
      active = false
    }
  }

  /** 释放模型输入图及 ARGB 缓冲。 */
  override fun close() {
    check(!active) { "cannot close face input conversion while processing a frame" }
    bitmap?.let { if (!it.isRecycled) it.recycle() }
    bitmap = null
    argbPixels = IntArray(0)
    sourceWidth = 0
    sourceHeight = 0
    modelWidth = 0
    modelHeight = 0
  }

  /** 按模型输入最长边上限复用位图；旧位图由模型关闭其缓存图像时释放。 */
  private fun ensureBuffers(width: Int, height: Int) {
    if (bitmap != null && sourceWidth == width && sourceHeight == height) return
    val scale = minOf(1.0, maximumModelInputDimensionPx.toDouble() / max(width, height))
    modelWidth = (width * scale).roundToInt().coerceAtLeast(1)
    modelHeight = (height * scale).roundToInt().coerceAtLeast(1)
    bitmap = Bitmap.createBitmap(modelWidth, modelHeight, Bitmap.Config.ARGB_8888)
    argbPixels = IntArray(modelWidth * modelHeight)
    sourceWidth = width
    sourceHeight = height
  }

  private companion object {
    const val DEFAULT_MODEL_INPUT_DIMENSION_PX = 640
  }
}
