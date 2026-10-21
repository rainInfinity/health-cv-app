/** 在借用作用域内同步计算共享统计与处理器结果，并统一释放原生帧。 */

package com.healthcvapp.acquisition.ppg.processing

import com.healthcvapp.acquisition.ppg.pixels.PixelFrameView

/** 对完整像素帧及共享统计执行同步处理。 */
fun interface PixelProcessor {
  fun process(frame: PixelFrameView, statistics: PixelStatistics)
}

/** 组织每帧一次统计、多个原生处理器及平台帧的 exactly-once 释放。 */
class FramePipeline(
  private val statisticsExtractor: PixelStatisticsExtractor,
  processors: List<PixelProcessor>,
) {
  private val processors = processors.toList()

  /** 同步完成统计与处理回调后结束像素借用，再释放平台帧。 */
  fun process(
    frame: PixelFrameView,
    releaseFrame: () -> Unit,
    onFrameProcessed: (PixelFrameView, PixelStatistics) -> Unit,
  ): PixelStatistics {
    try {
      val statistics = statisticsExtractor.extract(frame)
      for (processor in processors) processor.process(frame, statistics)
      onFrameProcessed(frame, statistics)
      return statistics
    } finally {
      try {
        frame.expire()
      } finally {
        releaseFrame()
      }
    }
  }
}
