/** 在借用作用域内同步计算共享统计与处理器结果，并统一释放原生帧。 */

package com.healthcvapp.acquisition.ppg.processing

import com.healthcvapp.acquisition.ppg.model.CameraBlockLayout
import com.healthcvapp.acquisition.ppg.pixels.PixelFrameView

/** 对完整像素帧及共享全帧统计执行同步处理。 */
fun interface PixelProcessor {
  fun process(frame: PixelFrameView, statistics: PixelStatistics)
}

/** 组织每帧一次全帧统计、可选分块统计与 exactly-once 释放。 */
class FramePipeline(
  private val statisticsExtractor: PixelStatisticsExtractor,
  processors: List<PixelProcessor>,
) {
  private val processors = processors.toList()

  fun process(
    frame: PixelFrameView,
    releaseFrame: () -> Unit,
    onFrameProcessed: (PixelFrameView, PixelStatistics) -> Unit,
  ): PixelStatistics = processWithBlocks(frame, releaseFrame, null) { currentFrame, statistics ->
    onFrameProcessed(currentFrame, statistics.fullFrame)
  }

  /** 同步处理本帧请求的分块统计；像素借用结束前不得保留帧视图。 */
  internal fun processWithBlocks(
    frame: PixelFrameView,
    releaseFrame: () -> Unit,
    blockLayout: CameraBlockLayout?,
    onFrameProcessed: (PixelFrameView, PixelFrameStatistics) -> Unit,
  ): PixelStatistics {
    try {
      val frameStatistics = statisticsExtractor.extractFrame(frame, blockLayout)
      for (processor in processors) processor.process(frame, frameStatistics.fullFrame)
      onFrameProcessed(frame, frameStatistics)
      return frameStatistics.fullFrame
    } finally {
      try {
        frame.expire()
      } finally {
        releaseFrame()
      }
    }
  }
}
