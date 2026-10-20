/** 将当前帧及共享统计映射为旧 Android 八列 PPG 记录。 */

package com.healthcvapp.acquisition.processing

import com.healthcvapp.acquisition.pixels.PixelFrameView

/** 表示一帧一个全帧块的 PPG CSV 记录。 */
data class PpgRecord(
  /** 开始处理帧时的 elapsedRealtime 时间，单位为毫秒。 */
  val timestamp: Double,
  /** 原生帧采集时间，单位为毫秒。 */
  val timestampFrame: Double,
  /** 开始处理帧时的 System.nanoTime 时间，单位为毫秒，不是 Unix 时间。 */
  val timestampSystem: Double,
  /** 有效图像区域的 Y 均值，范围为 0–255。 */
  val avgY: Double,
  /** 有效图像区域的 U 均值，范围为 0–255。 */
  val avgU: Double,
  /** 有效图像区域的 V 均值，范围为 0–255。 */
  val avgV: Double,
  /** 本次正式采集的交付帧序号，从 0 开始。 */
  val frameIndex: Long,
  /** 每帧固定为一个全帧块，取值为 0。 */
  val blockIndex: Int,
)

/** 按原生时间语义创建单帧 PPG 记录，不访问文件或批次队列。 */
class PpgRecordProcessor {
  /** 将原生帧时间与共享统计转换为毫秒精度的 CSV 记录。 */
  fun process(frame: PixelFrameView, statistics: PixelStatistics): PpgRecord = PpgRecord(
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
