/** 定义主动 PPG CSV 的一帧数值记录。 */

package com.healthcvapp.acquisition.ppg.model

/** 表示一帧一个全帧块的 PPG 记录。 */
data class PPGRecord(
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
