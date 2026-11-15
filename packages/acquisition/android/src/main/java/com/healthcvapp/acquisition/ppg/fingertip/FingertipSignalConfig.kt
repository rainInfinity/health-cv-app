/** 固定的指尖颜色假设与算法版本；真机校准前不宣称全机型可靠性。 */
package com.healthcvapp.acquisition.ppg.fingertip

internal object FingertipSignalConfig {
  /** BT.601 全范围 YUV、16×16 圆形网格、红色占优阈值的可追溯版本。 */
  const val VERSION = "fingertip-bt601-full-grid16-v1"
  /** 展示独立版本：固定红通道、0.75–3Hz 真实时间带通及连续首秒启动排除。 */
  const val DISPLAY_VERSION = "fingertip-red-bt601-dt-bandpass-v3"
  /** 指尖展示高通截止频率，单位 Hz。 */
  const val BANDPASS_LOW_HZ = 0.75
  /** 指尖展示低通截止频率，单位 Hz。 */
  const val BANDPASS_HIGH_HZ = 3.0
  /** 正式采集与同帧展示共用维持门槛，不改变真实覆盖百分比或完整覆盖准入。 */
  const val MIN_USABLE_COVERAGE_PERCENT = 95.0
  /** 连续低覆盖或无新图像的退出宽限；不暂停正式窗口。 */
  const val COVERAGE_LOSS_NANOS = 1_500_000_000L
  /** 普通状态通知合并间隔；阶段、错误及终态不受限。 */
  const val STATUS_NOTIFY_NANOS = 250_000_000L
  /** 固定覆盖网格的每边单元数；与原始单块保存独立。 */
  const val GRID_SIZE = 16
  /** 低于此亮度没有可判别输入。 */
  const val MIN_LUMINANCE = 8.0
  /** RGB 同时达到此值视为无判别过曝。 */
  const val SATURATED_CHANNEL = 250.0
  /** 红色覆盖要求的最小红通道值。 */
  const val MIN_RED = 40.0
  /** 红通道相对绿色与蓝色的最小倍数，比较采用严格大于。 */
  const val RED_DOMINANCE = 1.25
  /** 红绿通道的最小绝对差。 */
  const val MIN_RED_GREEN_DIFFERENCE = 20.0
  /** BT.601 全范围 V 到红通道系数。 */
  const val RED_V = 1.402
  /** BT.601 全范围 U 到绿色通道系数。 */
  const val GREEN_U = 0.344136
  /** BT.601 全范围 V 到绿色通道系数。 */
  const val GREEN_V = 0.714136
  /** BT.601 全范围 U 到蓝通道系数。 */
  const val BLUE_U = 1.772

  /** 统计均值保持未截断红通道幅值；不逐帧选通道、不增益或制造饱和平台。 */
  fun red(y: Double, v: Double): Double = y + RED_V * (v - 128.0)
}
