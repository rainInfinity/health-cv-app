/** 指尖圆形中心取景区域的有限空间覆盖估计，不改变原始保存网格。 */
package com.healthcvapp.acquisition.ppg.fingertip

import com.healthcvapp.acquisition.pixels.PixelFrameView
import com.healthcvapp.acquisition.pixels.PixelReader
import kotlin.math.min

/** 描述实际像素覆盖；未知不能被解释为零或完整覆盖。 */
internal data class FingertipCoverage(
  /** ROI 几何有效面积的估计百分比；全无判别输入为空。 */
  val percent: Double?,
  /** 区分未知、未覆盖、部分和完整覆盖。 */
  val state: State,
) {
  /** 覆盖状态而非医学质量或识别置信度。 */
  enum class State { UNKNOWN, UNCOVERED, PARTIAL, COMPLETE }
  /** 只有所有采样单元的有效面积通过才完整覆盖。 */
  val complete: Boolean get() = state == State.COMPLETE
  /** 维持和展示允许轻微缺角，但未知输入绝不能成为有效样本。 */
  val usable: Boolean
    get() = state != State.UNKNOWN && percent?.let { it >= FingertipSignalConfig.MIN_USABLE_COVERAGE_PERCENT } == true
  companion object {
    /** 尚未评估或没有颜色判别信息。 */
    val UNKNOWN = FingertipCoverage(null, State.UNKNOWN)
  }
}

/** 固定版本阈值只表示红色占优输入，不声明医学质量或精确物理面积。 */
internal class FingertipCoverageEstimator {
  /** 与中心正方形裁剪中的圆形预览一致；每单元最多四个实际像素，按面积加权。 */
  fun estimate(frame: PixelFrameView): FingertipCoverage {
    val crop = frame.cropRect
    val side = min(crop.right - crop.left, crop.bottom - crop.top)
    val left = crop.left + (crop.right - crop.left - side) / 2.0
    val top = crop.top + (crop.bottom - crop.top - side) / 2.0
    val reader = PixelReader(frame)
    var area = 0.0
    var covered = 0.0
    var informative = 0.0
    for (row in 0 until GRID) for (column in 0 until GRID) {
      var cellArea = 0.0
      var cellCovered = 0.0
      for (dy in 0..1) for (dx in 0..1) {
        val nx = (column + (dx + 0.5) / 2) / GRID
        val ny = (row + (dy + 0.5) / 2) / GRID
        if ((nx - 0.5) * (nx - 0.5) + (ny - 0.5) * (ny - 0.5) > 0.25) continue
        val x = (left + nx * side).toInt().coerceIn(crop.left, crop.right - 1)
        val y = (top + ny * side).toInt().coerceIn(crop.top, crop.bottom - 1)
        val luminance = reader.readY(x, y).toDouble()
        val u = reader.readU(x, y) - 128.0
        val v = reader.readV(x, y) - 128.0
        val red = (luminance + FingertipSignalConfig.RED_V * v).coerceIn(0.0, 255.0)
        val green = (luminance - FingertipSignalConfig.GREEN_U * u - FingertipSignalConfig.GREEN_V * v).coerceIn(0.0, 255.0)
        val blue = (luminance + FingertipSignalConfig.BLUE_U * u).coerceIn(0.0, 255.0)
        cellArea += 1.0
        if (luminance > FingertipSignalConfig.MIN_LUMINANCE &&
          !(red >= FingertipSignalConfig.SATURATED_CHANNEL && green >= FingertipSignalConfig.SATURATED_CHANNEL && blue >= FingertipSignalConfig.SATURATED_CHANNEL)) {
          informative += 1.0
          if (red >= FingertipSignalConfig.MIN_RED && red > green * FingertipSignalConfig.RED_DOMINANCE &&
            red > blue * FingertipSignalConfig.RED_DOMINANCE && red - green >= FingertipSignalConfig.MIN_RED_GREEN_DIFFERENCE) {
            cellCovered += 1.0
          }
        }
      }
      area += cellArea
      covered += cellCovered
    }
    if (area == 0.0 || informative == 0.0) return FingertipCoverage.UNKNOWN
    val state = when {
      covered == area -> FingertipCoverage.State.COMPLETE
      covered == 0.0 -> FingertipCoverage.State.UNCOVERED
      else -> FingertipCoverage.State.PARTIAL
    }
    // 部分覆盖保持小数；不通过四舍五入制造 100%。
    return FingertipCoverage(100.0 * covered / area, state)
  }

  private companion object { const val GRID = FingertipSignalConfig.GRID_SIZE }
}

/** 按单调处理时间累计连续完整覆盖，时间回退或陈旧输入立即撤销就绪。 */
internal class FingertipCoverageGate {
  private var completeSince: Long? = null
  /** 最新真实像素帧的处理入口单调时间。 */
  var lastFrameNanos: Long? = null
    private set
  /** 最新覆盖事实；陈旧后恢复未知而非保留旧 100%。 */
  var coverage = FingertipCoverage.UNKNOWN
    private set

  /** 新输入、回退及帧缺口决定连续稳定累计。 */
  fun update(value: FingertipCoverage, now: Long): Boolean {
    val previous = lastFrameNanos
    if (previous != null && (now <= previous || now - previous > FRESH_NANOS)) completeSince = null
    lastFrameNanos = now
    coverage = value
    if (!value.complete) completeSince = null else if (completeSince == null) completeSince = now
    return ready(now)
  }

  /** 就绪独立于百分比，并且必须仍处于输入新鲜度范围内。 */
  fun ready(now: Long): Boolean {
    val latest = lastFrameNanos ?: return false
    val since = completeSince ?: return false
    return coverage.complete && now >= latest && now - latest <= FRESH_NANOS && now - since >= STABLE_NANOS
  }

  /** 没有消费者或没有后续图像时也可由原生时钟撤销旧就绪。 */
  fun expire(now: Long) {
    val latest = lastFrameNanos ?: return
    if (now < latest || now - latest > FRESH_NANOS) {
      completeSince = null
      coverage = FingertipCoverage.UNKNOWN
    }
  }

  companion object {
    /** 完整覆盖必须连续保持的稳定时长。 */
    const val STABLE_NANOS = 3_000_000_000L
    /** 超过该处理时间间隔即陈旧，精确边界仍有效。 */
    const val FRESH_NANOS = 200_000_000L
  }
}
