/** 保存一帧共享时间信息及紧凑的行优先块均值。 */

package com.healthcvapp.acquisition.ppg.model

/** 表示一帧完整的 Y/U/V 分块结果，不拆成逐块队列对象。 */
class PPGFrameRecord internal constructor(
  /** 开始处理帧时的 elapsedRealtime 时间，单位为毫秒。 */
  val timestamp: Double,
  /** 原生帧采集时间，单位为毫秒。 */
  val timestampFrame: Double,
  /** 开始处理帧时的 System.nanoTime 时间，单位为毫秒，不是 Unix 时间。 */
  val timestampSystem: Double,
  /** 本次正式采集的交付帧序号，从 0 开始。 */
  val frameIndex: Long,
  /** 当前帧实际采用的行列布局。 */
  val blockLayout: CameraBlockLayout,
  /** 每块连续保存 Y、U、V 均值；数组由本帧记录独占。 */
  internal val averagesYuv: DoubleArray,
) {
  /** 当前帧包含的行优先块数。 */
  val blockCount: Int = blockLayout.blockCount.toInt()

  init {
    require(blockLayout.blockCount in 1L..CameraBlockLayout.MAX_BLOCK_COUNT.toLong())
    require(averagesYuv.size == blockCount * CHANNELS_PER_BLOCK)
  }

  /** 返回指定行优先块的亮度均值。 */
  internal fun averageY(blockIndex: Int): Double = averagesYuv[offset(blockIndex)]

  /** 返回指定行优先块的 U 色度均值。 */
  internal fun averageU(blockIndex: Int): Double = averagesYuv[offset(blockIndex) + 1]

  /** 返回指定行优先块的 V 色度均值。 */
  internal fun averageV(blockIndex: Int): Double = averagesYuv[offset(blockIndex) + 2]

  /** 校验块索引并计算其紧凑 Y/U/V 三元组起点。 */
  private fun offset(blockIndex: Int): Int {
    require(blockIndex in 0 until blockCount) { "blockIndex 超出当前帧范围。" }
    return blockIndex * CHANNELS_PER_BLOCK
  }

  private companion object {
    const val CHANNELS_PER_BLOCK = 3
  }
}
