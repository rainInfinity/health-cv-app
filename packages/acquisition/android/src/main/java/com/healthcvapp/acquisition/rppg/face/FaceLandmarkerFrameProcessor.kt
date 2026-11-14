/** 组合 Face Landmarker 同步推理与当前借用帧的 ROI 采样。 */
package com.healthcvapp.acquisition.rppg.face

import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarkerResult
import com.healthcvapp.acquisition.pixels.PixelFrameView
import com.healthcvapp.acquisition.rppg.roi.RppgFramePixels

/** 确保推理结果只与生成它的同一借用帧同步消费。 */
internal class FaceLandmarkerFrameProcessor(
  private val model: FaceLandmarkerModel,
  private val inputConverter: FaceLandmarkerInputConverter = FaceLandmarkerInputConverter(),
) : AutoCloseable {
  private var closed = false

  /** 同步转换和推理一帧，并在回调结束后使 ROI 读取视图失效。 */
  fun <T> process(
    frame: PixelFrameView,
    timestampMs: Long,
    consume: (FaceLandmarkerResult, RppgFramePixels) -> T,
  ): T {
    check(!closed) { "face frame processor is closed" }
    require(timestampMs >= 0L) { "MediaPipe video timestamp must not be negative" }
    return inputConverter.withInput(frame) { bitmap, rgbFrame ->
      val result = model.detectForVideo(bitmap, timestampMs)
      consume(result, rgbFrame)
    }
  }

  /** 释放转换缓冲和模型资源。 */
  override fun close() {
    if (closed) return
    closed = true
    try {
      model.close()
    } finally {
      inputConverter.close()
    }
  }
}
