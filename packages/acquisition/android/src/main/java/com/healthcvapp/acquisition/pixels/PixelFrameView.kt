/** 保存原生 YUV 帧布局元数据，并限制像素只在借用作用域内读取。 */

package com.healthcvapp.acquisition.pixels

import java.nio.ByteBuffer

/** 表示左上包含、右下不包含的有效图像区域。 */
data class PixelCropRect(
  /** 裁剪区域左边界，单位为像素。 */
  val left: Int,
  /** 裁剪区域上边界，单位为像素。 */
  val top: Int,
  /** 裁剪区域右边界，单位为像素，不包含该列。 */
  val right: Int,
  /** 裁剪区域下边界，单位为像素，不包含该行。 */
  val bottom: Int,
)

/** 描述独立 Y、U 或 V 平面在 ByteBuffer 中的寻址方式。 */
class PixelPlane internal constructor(
  internal val buffer: ByteBuffer,
  /** 平面第一个可读字节在 buffer 中的偏移。 */
  val baseOffset: Int,
  /** 平面可寻址列数，单位为样本。 */
  val width: Int,
  /** 平面可寻址行数，单位为样本。 */
  val height: Int,
  /** 相邻样本行的字节距离。 */
  val rowStrideBytes: Int,
  /** 同一行相邻样本的字节距离。 */
  val pixelStrideBytes: Int,
) {
  init {
    require(baseOffset >= 0) { "baseOffset must not be negative" }
    require(width > 0 && height > 0) { "plane dimensions must be positive" }
    require(rowStrideBytes > 0 && pixelStrideBytes > 0) { "plane strides must be positive" }
  }

  /** 按样本坐标绝对读取无符号字节，不改变 ByteBuffer 的 position。 */
  internal fun readUnsigned(column: Int, row: Int): Int {
    if (column !in 0 until width || row !in 0 until height) {
      throw IndexOutOfBoundsException("plane sample ($column, $row) is outside $width×$height")
    }
    val index = baseOffset.toLong() + row.toLong() * rowStrideBytes + column.toLong() * pixelStrideBytes
    if (index < 0 || index >= buffer.limit() || index > Int.MAX_VALUE) {
      throw IndexOutOfBoundsException("plane byte offset $index is outside buffer limit ${buffer.limit()}")
    }
    return buffer.get(index.toInt()).toInt() and 0xFF
  }
}

/** 表示处理器可同步读取的完整原生像素视图。 */
class PixelFrameView internal constructor(
  /** 原始帧宽度，单位为像素。 */
  val width: Int,
  /** 原始帧高度，单位为像素。 */
  val height: Int,
  /** 实际可处理区域；填充和裁剪外像素不属于图像内容。 */
  val cropRect: PixelCropRect,
  /** 相机建议的显示旋转角度，仅描述方向，不复制或旋转像素。 */
  val rotationDegrees: Int,
  /** 是否需要按前摄镜像语义解释显示方向。 */
  val mirrored: Boolean,
  /** 可取得的颜色空间名称；未知时为空。 */
  val colorSpace: String?,
  /** 当前帧所属的处理会话标识。 */
  val sessionId: String,
  /** 当前处理路径中的交付帧序号；非正式采集帧可为负值。 */
  val frameIndex: Long,
  /** 原生帧携带的采集时间，单位为纳秒。 */
  val timestampFrameNanos: Long,
  /** 开始处理该帧时的 elapsedRealtime 时间，单位为纳秒。 */
  val processingElapsedNanos: Long,
  /** 开始处理该帧时的 System.nanoTime 时间，单位为纳秒。 */
  val timestampSystemNanos: Long,
  /** Y 平面布局与只读字节视图。 */
  val yPlane: PixelPlane,
  /** U 平面布局与只读字节视图。 */
  val uPlane: PixelPlane,
  /** V 平面布局与只读字节视图。 */
  val vPlane: PixelPlane,
) {
  @Volatile private var active = true

  init {
    require(width > 0 && height > 0) { "frame dimensions must be positive" }
    require(cropRect.left >= 0 && cropRect.top >= 0) { "crop origin must not be negative" }
    require(cropRect.right <= width && cropRect.bottom <= height) { "crop must stay within the frame" }
    require(cropRect.right > cropRect.left && cropRect.bottom > cropRect.top) { "crop must not be empty" }
    require(rotationDegrees == 0 || rotationDegrees == 90 || rotationDegrees == 180 || rotationDegrees == 270) { "rotationDegrees must be a right angle" }
    require(yPlane.width >= width && yPlane.height >= height) { "Y plane must cover the frame" }
    require(uPlane.width >= (width + 1) / 2 && uPlane.height >= (height + 1) / 2) { "U plane must cover 4:2:0 samples" }
    require(vPlane.width >= (width + 1) / 2 && vPlane.height >= (height + 1) / 2) { "V plane must cover 4:2:0 samples" }
  }

  /** 同步处理结束后使借用作用域失效。 */
  internal fun expire() {
    active = false
  }

  /** 阻止处理器在平台帧释放后继续读取像素。 */
  internal fun checkActive() {
    check(active) { "pixel frame is no longer valid" }
  }
}
