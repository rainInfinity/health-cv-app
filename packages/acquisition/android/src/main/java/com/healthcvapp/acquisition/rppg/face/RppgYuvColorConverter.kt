/** 将 CameraX 借用的 YUV 4:2:0 帧转换为可复用的模型输入像素。 */
package com.healthcvapp.acquisition.rppg.face

import com.healthcvapp.acquisition.pixels.PixelFrameView
import com.healthcvapp.acquisition.pixels.PixelPlane
import com.healthcvapp.acquisition.pixels.PixelReader
import com.healthcvapp.acquisition.rppg.model.RPPGConfig

/** 当前相机未提供颜色描述时采用的、显式标记版本的 BT.601 limited-range 转换。 */
internal object RppgYuvColorConverter {
  val ASSUMPTION_ID: String = RPPGConfig.EXPERIMENTAL_V1.colorAssumptionId

  /** 将一个 YUV 样本转换为不透明 ARGB 像素。 */
  fun toArgb(y: Int, u: Int, v: Int): Int {
    val c = y - 16
    val d = u - 128
    val e = v - 128
    val red = clamp((298 * c + 409 * e + 128) shr 8)
    val green = clamp((298 * c - 100 * d - 208 * e + 128) shr 8)
    val blue = clamp((298 * c + 516 * d + 128) shr 8)
    return -0x1000000 or (red shl 16) or (green shl 8) or blue
  }

  private fun clamp(value: Int): Int = value.coerceIn(0, 255)
}

/** 仅供同步面部处理复用三平面副本，以有限复制替代逐像素直接缓冲访问。 */
internal class RppgYuvFrameBuffer : AutoCloseable {
  private val yPlane = CopiedPlane()
  private val uPlane = CopiedPlane()
  private val vPlane = CopiedPlane()
  private var borrowedFrame: PixelFrameView? = null

  /** 在借用有效时批量复制；只在所需容量增长时分配，不改变原缓冲的位置和限制。 */
  fun copyFrom(frame: PixelFrameView) {
    borrowedFrame = null
    frame.checkActive()
    val crop = frame.cropRect
    yPlane.copyFrom(frame.yPlane, crop.right - 1, crop.bottom - 1)
    uPlane.copyFrom(frame.uPlane, (crop.right - 1) / 2, (crop.bottom - 1) / 2)
    vPlane.copyFrom(frame.vPlane, (crop.right - 1) / 2, (crop.bottom - 1) / 2)
    borrowedFrame = frame
  }

  /** 从原帧裁剪内的同一整数位置转换颜色，仍受当前借用期限约束。 */
  fun argbAt(frame: PixelFrameView, sourceX: Int, sourceY: Int): Int {
    check(borrowedFrame === frame) { "copied YUV frame is no longer valid" }
    frame.checkActive()
    val crop = frame.cropRect
    if (sourceX < crop.left || sourceX >= crop.right || sourceY < crop.top || sourceY >= crop.bottom) {
      throw IndexOutOfBoundsException("pixel ($sourceX, $sourceY) is outside the valid crop")
    }
    val chromaX = sourceX / 2
    val chromaY = sourceY / 2
    return RppgYuvColorConverter.toArgb(
      yPlane.readUnsigned(sourceX, sourceY),
      uPlane.readUnsigned(chromaX, chromaY),
      vPlane.readUnsigned(chromaX, chromaY),
    )
  }

  /** 结束当前借用但保留有限容量，副本不得在后续帧到来前继续读取。 */
  fun releaseFrame() {
    borrowedFrame = null
  }

  /** 关闭转换器时释放三平面容量。 */
  override fun close() {
    releaseFrame()
    yPlane.close()
    uPlane.close()
    vPlane.close()
  }

  /** 保留原平面步长；裁剪最大坐标在复制前一次性验证。 */
  private class CopiedPlane {
    private var bytes = ByteArray(0)
    private var rowStrideBytes = 0
    private var pixelStrideBytes = 0

    fun copyFrom(plane: PixelPlane, lastColumn: Int, lastRow: Int) {
      val lastIndex = plane.baseOffset.toLong() +
        lastRow.toLong() * plane.rowStrideBytes + lastColumn.toLong() * plane.pixelStrideBytes
      if (lastIndex >= plane.buffer.limit() || lastIndex > Int.MAX_VALUE) {
        throw IndexOutOfBoundsException("plane byte offset $lastIndex is outside buffer limit ${plane.buffer.limit()}")
      }
      val byteCount = (lastIndex - plane.baseOffset + 1).toInt()
      if (bytes.size < byteCount) bytes = ByteArray(byteCount)
      val view = plane.buffer.duplicate()
      view.position(plane.baseOffset)
      view.limit(lastIndex.toInt() + 1)
      view.get(bytes, 0, byteCount)
      rowStrideBytes = plane.rowStrideBytes
      pixelStrideBytes = plane.pixelStrideBytes
    }

    fun readUnsigned(column: Int, row: Int): Int =
      bytes[row * rowStrideBytes + column * pixelStrideBytes].toInt() and 0xFF

    fun close() {
      bytes = ByteArray(0)
    }
  }
}

/** 按需读取借用 YUV 帧并转换模型输入或 ROI 所需的颜色样本。 */
internal object FaceLandmarkerFramePixelConverter {
  /** 按原尺寸把借用帧转换到模型输入方向。 */
  fun fillArgb(
    frame: PixelFrameView,
    geometry: FaceLandmarkerInputGeometry,
    output: IntArray,
  ) = fillArgb(frame, geometry, geometry.inputWidth, geometry.inputHeight, output)

  /** 在缩小的模型输入中按中心点采样，不改变几何映射所用的原帧坐标。 */
  fun fillArgb(
    frame: PixelFrameView,
    geometry: FaceLandmarkerInputGeometry,
    outputWidth: Int,
    outputHeight: Int,
    output: IntArray,
    yuvBuffer: RppgYuvFrameBuffer? = null,
  ) {
    require(outputWidth > 0 && outputHeight > 0) { "ARGB output dimensions must be positive" }
    val pixelCount = outputWidth.toLong() * outputHeight
    require(output.size.toLong() >= pixelCount) { "ARGB output buffer is too small" }
    val reader = if (yuvBuffer == null) PixelReader(frame) else null
    var outputIndex = 0
    for (outputY in 0 until outputHeight) {
      val inputY = ((outputY * 2L + 1L) * geometry.inputHeight / (outputHeight * 2L)).toInt()
      for (outputX in 0 until outputWidth) {
        val inputX = ((outputX * 2L + 1L) * geometry.inputWidth / (outputWidth * 2L)).toInt()
        val sourceX = geometry.sourcePixelX(inputX, inputY)
        val sourceY = geometry.sourcePixelY(inputX, inputY)
        output[outputIndex++] = if (yuvBuffer != null) {
          yuvBuffer.argbAt(frame, sourceX, sourceY)
        } else {
          val directReader = checkNotNull(reader)
          RppgYuvColorConverter.toArgb(
            directReader.readY(sourceX, sourceY),
            directReader.readU(sourceX, sourceY),
            directReader.readV(sourceX, sourceY),
          )
        }
      }
    }
  }
}
