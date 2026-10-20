/** 根据共享均值计算旧项目经验提示，并只通知最新状态变化。 */

package com.healthcvapp.acquisition.processing

import com.healthcvapp.acquisition.pixels.PixelFrameView

/** 表示尚未评估或两个独立经验提示的最新状态。 */
data class CoverageHint(
  /** 尚未取得有效统计时为空；否则表示亮度提示是否触发。 */
  val showSurroundingTip: Boolean?,
  /** 尚未取得有效统计时为空；否则表示颜色比例提示是否触发。 */
  val showCoveringTip: Boolean?,
)

/** 发布不依赖 CSV 批次的最新经验提示，不判断面积或采集质量。 */
class CoverageHintProcessor(
  private val onChanged: (CoverageHint) -> Unit,
) : PixelProcessor {
  private var latest = CoverageHint(showSurroundingTip = null, showCoveringTip = null)

  /** 当前最新提示；有效统计尚未到达时保持未评估。 */
  val current: CoverageHint
    @Synchronized get() = latest

  /** 将像素共享统计独立映射为经验提示并仅在状态变化时通知。 */
  @Synchronized
  override fun process(frame: PixelFrameView, statistics: PixelStatistics) {
    update(statistics)
  }

  /** 合并有效统计或未评估状态，并返回最新提示。 */
  @Synchronized
  fun update(statistics: PixelStatistics?): CoverageHint {
    val next = if (
      statistics == null
      || statistics.ySampleCount <= 0
      || statistics.uSampleCount <= 0
      || statistics.vSampleCount <= 0
    ) {
      CoverageHint(showSurroundingTip = null, showCoveringTip = null)
    } else {
      val red = statistics.avgY + 1.5748 * (statistics.avgV - 128.0)
      val green = statistics.avgY - 0.1873 * (statistics.avgU - 128.0) - 0.4681 * (statistics.avgV - 128.0)
      val blue = statistics.avgY + 1.8556 * (statistics.avgU - 128.0)
      val total = red + green + blue
      val redRatio: Double
      val greenRatio: Double
      val blueRatio: Double
      if (total > 0.0) {
        redRatio = red / total
        greenRatio = green / total
        blueRatio = blue / total
      } else {
        redRatio = 0.0
        greenRatio = 0.0
        blueRatio = 0.0
      }

      CoverageHint(
        showSurroundingTip = statistics.avgY < 25.0,
        showCoveringTip = redRatio <= 0.5 || greenRatio >= 0.2 || blueRatio >= 0.2,
      )
    }

    if (next != latest) {
      latest = next
      onChanged(next)
    }
    return latest
  }
}
