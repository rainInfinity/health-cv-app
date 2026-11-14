/** 将有效裁剪区域映射为行优先的二维像素块。 */

package com.healthcvapp.acquisition.ppg.pixels

import com.healthcvapp.acquisition.camera.model.CameraConfigFailure
import com.healthcvapp.acquisition.pixels.PixelCropRect
import com.healthcvapp.acquisition.ppg.model.CameraBlockLayout

/** 为实际有效裁剪区域预计算每个像素所属的网格行列。 */
internal class PixelBlockGeometry private constructor(
  /** 本次几何对应的有效原帧坐标区域。 */
  val cropRect: PixelCropRect,
  /** 网格行数。 */
  val rows: Int,
  /** 网格列数。 */
  val columns: Int,
  /** 按有效区域纵坐标索引的网格行号映射。 */
  private val rowByY: IntArray,
  /** 按有效区域横坐标索引的网格列号映射。 */
  private val columnByX: IntArray,
) {
  /** 当前有效裁剪区域中非空块的总数。 */
  val blockCount: Int = rows * columns

  /** 返回原帧坐标对应的网格行号。 */
  fun rowAt(y: Int): Int {
    require(y in cropRect.top until cropRect.bottom) { "pixel row is outside the effective crop" }
    return rowByY[y - cropRect.top]
  }

  /** 返回原帧坐标对应的网格列号。 */
  fun columnAt(x: Int): Int {
    require(x in cropRect.left until cropRect.right) { "pixel column is outside the effective crop" }
    return columnByX[x - cropRect.left]
  }

  /** 按行优先编号返回一个有效像素所属块。方向和预览镜像不参与坐标映射。 */
  fun blockIndexAt(x: Int, y: Int): Int = rowAt(y) * columns + columnAt(x)

  companion object {
    /** 基于实际 crop 校验并构造本帧分块几何。 */
    fun create(cropRect: PixelCropRect, layout: CameraBlockLayout): PixelBlockGeometry {
      val width = cropRect.right - cropRect.left
      val height = cropRect.bottom - cropRect.top
      require(cropRect.left >= 0 && cropRect.top >= 0 && width > 0 && height > 0) {
        "effective crop must be nonempty and use nonnegative coordinates"
      }
      if (layout.blockCount > CameraBlockLayout.MAX_BLOCK_COUNT) {
        throw CameraConfigFailure("INVALID_CAMERA_CONFIG", "分块数量超过本地最大处理上限。")
      }
      if (layout.rows > height || layout.columns > width) {
        throw CameraConfigFailure("CAMERA_CONFIGURATION_UNAVAILABLE", "实际有效帧尺寸不足以容纳请求的分块布局。")
      }

      return PixelBlockGeometry(
        cropRect = cropRect,
        rows = layout.rows,
        columns = layout.columns,
        rowByY = createCoordinateMap(height, layout.rows),
        columnByX = createCoordinateMap(width, layout.columns),
      )
    }

    /** 将余数像素从首块开始逐一分配，确保各块连续且非空。 */
    private fun createCoordinateMap(extent: Int, partCount: Int): IntArray {
      val mapping = IntArray(extent)
      val baseSize = extent / partCount
      val remainder = extent % partCount
      var offset = 0
      for (part in 0 until partCount) {
        val partSize = baseSize + if (part < remainder) 1 else 0
        for (index in offset until offset + partSize) mapping[index] = part
        offset += partSize
      }
      check(offset == extent)
      return mapping
    }
  }
}
