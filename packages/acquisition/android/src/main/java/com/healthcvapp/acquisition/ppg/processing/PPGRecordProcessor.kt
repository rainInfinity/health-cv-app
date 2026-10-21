/** 将当前帧及共享统计映射为旧 Android 八列 PPG 记录。 */

package com.healthcvapp.acquisition.ppg.processing

import com.healthcvapp.acquisition.ppg.model.PPGRecord
import com.healthcvapp.acquisition.ppg.pixels.PixelFrameView


/** 按原生时间语义创建单帧 PPG 记录，不访问文件或批次队列。 */
class PPGRecordProcessor {
  /** 将原生帧时间与共享统计转换为毫秒精度的 CSV 记录。 */
  fun process(frame: PixelFrameView, statistics: PixelStatistics): PPGRecord = PPGRecord(
    timestamp = frame.processingElapsedNanos / 1_000_000.0,
    timestampFrame = frame.timestampFrameNanos / 1_000_000.0,
    timestampSystem = frame.timestampSystemNanos / 1_000_000.0,
    avgY = statistics.avgY,
    avgU = statistics.avgU,
    avgV = statistics.avgV,
    frameIndex = frame.frameIndex,
    blockIndex = 0,
  )
}
