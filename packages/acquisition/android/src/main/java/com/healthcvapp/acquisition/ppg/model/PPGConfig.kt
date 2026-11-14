/** 定义原始 PPG 专属网格及其与共用相机配置的组合。 */

package com.healthcvapp.acquisition.ppg.model

import com.healthcvapp.acquisition.camera.model.CameraCaptureOptions
import com.healthcvapp.acquisition.camera.model.CameraConfig
import com.healthcvapp.acquisition.camera.model.CameraConfigFailure
import com.healthcvapp.acquisition.camera.model.CameraConfigSummary

/** 表示一个非空、行优先的 PPG 二维网格。 */
data class CameraBlockLayout(
  /** 网格行数，必须为正整数。 */
  val rows: Int,
  /** 网格列数，必须为正整数。 */
  val columns: Int,
) {
  /** 该布局包含的块数，以 Long 计算以避免乘积溢出。 */
  val blockCount: Long = rows.toLong() * columns.toLong()

  init {
    if (rows <= 0 || columns <= 0) {
      throw CameraConfigFailure("INVALID_CAMERA_CONFIG", "分块行数和列数必须为正整数。")
    }
  }

  companion object {
    /** 单帧允许处理的最大 PPG 网格块数。 */
    const val MAX_BLOCK_COUNT = 64

    /** 校验桥接数组形状并复制两个正整数维度。 */
    fun fromBlocks(blocks: DoubleArray): CameraBlockLayout {
      if (blocks.size != 2 || blocks.any {
          !it.isFinite() || it % 1.0 != 0.0 || it <= 0.0 || it > Int.MAX_VALUE.toDouble()
        }) {
        throw CameraConfigFailure("INVALID_CAMERA_CONFIG", "分块配置必须恰有两个可表示的正整数行列值。")
      }
      return CameraBlockLayout(rows = blocks[0].toInt(), columns = blocks[1].toInt())
    }
  }
}

/** 将 PPG 的网格布局与不含处理细节的相机设备配置组合。 */
data class PPGConfig(
  /** 原始 PPG 会话使用的共用相机配置。 */
  val cameraConfig: CameraConfig,
  /** 原始 PPG 统计使用的行优先网格。 */
  val blockLayout: CameraBlockLayout,
)

/** 将原始 PPG 网格与共用相机协商结果组合成完整低频摘要。 */
data class PPGConfigSummary(
  /** 相机设备层的请求、提交和实测摘要。 */
  val cameraSummary: CameraConfigSummary,
  /** 本次正式 PPG 会话冻结的网格布局。 */
  val blockLayout: CameraBlockLayout,
)

/** 表示仅用于原始 PPG 网格校验的本地处理上限。 */
data class CameraProcessingLimits(
  /** 单帧最大块数。 */
  val maxBlockCount: Int,
  /** 目标尺寸允许的最大列数。 */
  val maxColumns: Int,
  /** 目标尺寸允许的最大行数。 */
  val maxRows: Int,
)

/** 组合共用相机查询结果与原始 PPG 专属网格上限。 */
data class PPGCaptureOptions(
  /** CameraX 的 Preview 与分析用例查询结果。 */
  val cameraOptions: CameraCaptureOptions,
  /** 原始 PPG 处理器的网格限制。 */
  val processing: CameraProcessingLimits,
)
