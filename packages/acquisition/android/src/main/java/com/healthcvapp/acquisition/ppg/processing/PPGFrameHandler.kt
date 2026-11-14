/** 负责主动相机帧的 YUV 适配、同步处理和记录交付。 */

package com.healthcvapp.acquisition.ppg.processing

import android.os.SystemClock
import androidx.camera.core.ImageProxy
import com.healthcvapp.acquisition.camera.toPixelFrameView
import com.healthcvapp.acquisition.ppg.session.PPGCaptureSession

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
        mirrored = false,
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


  private companion object {
    const val NO_FRAME = -1L
  }
}
