/** 将有效帧的紧凑块均值与原生时间转换为整帧记录。 */

package com.healthcvapp.acquisition.ppg.processing

import com.healthcvapp.acquisition.ppg.model.CameraBlockLayout
import com.healthcvapp.acquisition.ppg.model.PPGFrameRecord
import com.healthcvapp.acquisition.ppg.pixels.PixelFrameView

/** 按帧创建一次 PPG 记录，不访问文件或批次队列。 */
class PPGRecordProcessor {
  /** 校验帧网格并将唯一的紧凑均值数组交给异步帧记录。 */
  internal fun process(
    frame: PixelFrameView,
    statistics: PixelBlockStatistics,
    blockLayout: CameraBlockLayout,
  ): PPGFrameRecord {
    check(statistics.rows == blockLayout.rows && statistics.columns == blockLayout.columns) {
      "本帧块统计与冻结布局不一致。"
    }
    return PPGFrameRecord(
      timestamp = frame.processingElapsedNanos / 1_000_000.0,
      timestampFrame = frame.timestampFrameNanos / 1_000_000.0,
      timestampSystem = frame.timestampSystemNanos / 1_000_000.0,
      frameIndex = frame.frameIndex,
      blockLayout = blockLayout,
      averagesYuv = statistics.averagesYuv,
    )
  }
}
