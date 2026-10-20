/** 一次遍历有效裁剪区域，计算 Y 与 4:2:0 色度平面的共享统计。 */

package com.healthcvapp.acquisition.processing

import com.healthcvapp.acquisition.pixels.PixelFrameView
import com.healthcvapp.acquisition.pixels.PixelReader

/** 保存有效像素区域的原始 Y/U/V 均值与各自样本数。 */
data class PixelStatistics(
  /** 有效 Y 样本的均值，范围为 0–255。 */
  val avgY: Double,
  /** 有效 U 色度样本的均值，范围为 0–255。 */
  val avgU: Double,
  /** 有效 V 色度样本的均值，范围为 0–255。 */
  val avgV: Double,
  /** 实际纳入 Y 均值的像素数。 */
  val ySampleCount: Long,
  /** 实际纳入 U 均值的 4:2:0 色度样本数。 */
  val uSampleCount: Long,
  /** 实际纳入 V 均值的 4:2:0 色度样本数。 */
  val vSampleCount: Long,
)

/** 在单次区域扫描中共享计算原始亮度和色度均值。 */
class PixelStatisticsExtractor {
  /** 根据帧裁剪与实际 plane 布局计算统计，不读取填充区域。 */
  fun extract(frame: PixelFrameView): PixelStatistics {
    val reader = PixelReader(frame)
    val crop = frame.cropRect
    var ySum = 0L
    var uSum = 0L
    var vSum = 0L
    var yCount = 0L
    var chromaCount = 0L

    for (y in crop.top until crop.bottom) {
      for (x in crop.left until crop.right) {
        ySum += reader.readY(x, y)
        yCount += 1

        val firstColumnInChromaSample = x == crop.left || (x and 1) == 0
        val firstRowInChromaSample = y == crop.top || (y and 1) == 0
        if (firstColumnInChromaSample && firstRowInChromaSample) {
          uSum += reader.readU(x, y)
          vSum += reader.readV(x, y)
          chromaCount += 1
        }
      }
    }

    check(yCount > 0 && chromaCount > 0) { "valid frame crop produced no YUV samples" }
    return PixelStatistics(
      avgY = ySum.toDouble() / yCount,
      avgU = uSum.toDouble() / chromaCount,
      avgV = vSum.toDouble() / chromaCount,
      ySampleCount = yCount,
      uSampleCount = chromaCount,
      vSampleCount = chromaCount,
    )
  }
}
