/** 负责主动相机帧的 YUV 适配、同步处理和记录交付。 */

package com.healthcvapp.acquisition.ppg.processing

import android.graphics.ImageFormat
import android.os.SystemClock
import androidx.camera.core.ImageProxy
import com.healthcvapp.acquisition.ppg.pixels.PixelCropRect
import com.healthcvapp.acquisition.ppg.pixels.PixelFrameView
import com.healthcvapp.acquisition.ppg.pixels.PixelPlane
import com.healthcvapp.acquisition.ppg.session.PPGCaptureSession

/** 同步处理一个相机回调，并只向该回调绑定的会话交付记录。 */
internal class PPGFrameHandler(
  private val framePipeline: FramePipeline,
  private val ppgRecordProcessor: PPGRecordProcessor,
  private val onPreviewFrameFailure: (String, String, String) -> Unit,
  private val elapsedRealtimeNanos: () -> Long = { SystemClock.elapsedRealtimeNanos() },
) {
  /** 处理单个 ImageProxy；无论适配或处理结果如何都只释放一次。 */
  fun handle(image: ImageProxy, cameraSessionId: String, captureSession: PPGCaptureSession?) {
    var frameIndex = NO_FRAME
    var frameFinished = false
    var imageReleased = false
    try {
      val processingElapsedNanos = elapsedRealtimeNanos()
      val timestampSystemNanos = System.nanoTime()
      frameIndex = captureSession?.beginFrame(processingElapsedNanos) ?: NO_FRAME
      val frameSessionId = if (frameIndex >= 0L) captureSession!!.sessionId else cameraSessionId
      val frameView = image.toPixelFrameView(
        sessionId = frameSessionId,
        frameIndex = frameIndex,
        processingElapsedNanos = processingElapsedNanos,
        timestampSystemNanos = timestampSystemNanos,
      )
      framePipeline.processWithBlocks(
        frame = frameView,
        releaseFrame = {
          imageReleased = true
          image.close()
        },
        blockLayout = captureSession?.blockLayout,
      ) { processedFrame, frameStatistics ->
        if (frameIndex >= 0L) {
          val activeCaptureSession = checkNotNull(captureSession)
          val blockStatistics = checkNotNull(frameStatistics.blocks) {
            "正式采集帧没有分块统计。"
          }
          val record = ppgRecordProcessor.process(
            processedFrame,
            blockStatistics,
            activeCaptureSession.blockLayout,
          )
          activeCaptureSession.offerPpgFrame(record, processedFrame.timestampFrameNanos)
          frameFinished = true
        }
      }
    } catch (error: Throwable) {
      if (frameIndex >= 0L && !frameFinished) {
        frameFinished = true
        captureSession!!.finishFrame(frameIndex, null, error)
      } else if (frameIndex == NO_FRAME) {
        onPreviewFrameFailure(
          cameraSessionId,
          "PIXEL_PROCESSING_FAILED",
          error.message ?: "相机帧处理失败。",
        )
      }
    } finally {
      if (!imageReleased) {
        imageReleased = true
        image.close()
      }
    }
  }

  /** 按实际图像布局建立仅在同步处理期间有效的像素视图。 */
  private fun ImageProxy.toPixelFrameView(
    sessionId: String,
    frameIndex: Long,
    processingElapsedNanos: Long,
    timestampSystemNanos: Long,
  ): PixelFrameView {
    if (format != ImageFormat.YUV_420_888 || planes.size < 3) {
      throw IllegalStateException("CameraX 未交付可读取的 YUV_420_888 帧。")
    }
    val imagePlanes = planes
    return PixelFrameView(
      width = width,
      height = height,
      cropRect = PixelCropRect(cropRect.left, cropRect.top, cropRect.right, cropRect.bottom),
      rotationDegrees = imageInfo.rotationDegrees,
      mirrored = false,
      colorSpace = null,
      sessionId = sessionId,
      frameIndex = frameIndex,
      timestampFrameNanos = imageInfo.timestamp,
      processingElapsedNanos = processingElapsedNanos,
      timestampSystemNanos = timestampSystemNanos,
      yPlane = imagePlanes[0].toPixelPlane(width, height),
      uPlane = imagePlanes[1].toPixelPlane((width + 1) / 2, (height + 1) / 2),
      vPlane = imagePlanes[2].toPixelPlane((width + 1) / 2, (height + 1) / 2),
    )
  }

  /** 保留 CameraX 平面的真实偏移和采样步长。 */
  private fun ImageProxy.PlaneProxy.toPixelPlane(width: Int, height: Int) = PixelPlane(
    buffer = buffer,
    baseOffset = buffer.position(),
    width = width,
    height = height,
    rowStrideBytes = rowStride,
    pixelStrideBytes = pixelStride,
  )

  private companion object {
    const val NO_FRAME = -1L
  }
}
