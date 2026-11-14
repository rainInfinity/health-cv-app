/** 将 CameraX 借用的 YUV 4:2:0 帧转换为可复用的模型输入像素。 */
package com.healthcvapp.acquisition.rppg.face

import com.healthcvapp.acquisition.pixels.PixelFrameView
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
  ) {
    require(outputWidth > 0 && outputHeight > 0) { "ARGB output dimensions must be positive" }
    val pixelCount = outputWidth.toLong() * outputHeight
    require(output.size.toLong() >= pixelCount) { "ARGB output buffer is too small" }
    val reader = PixelReader(frame)
    var outputIndex = 0
    for (outputY in 0 until outputHeight) {
      val inputY = ((outputY * 2L + 1L) * geometry.inputHeight / (outputHeight * 2L)).toInt()
      for (outputX in 0 until outputWidth) {
        val inputX = ((outputX * 2L + 1L) * geometry.inputWidth / (outputWidth * 2L)).toInt()
        val sourceX = geometry.sourcePixelX(inputX, inputY)
        val sourceY = geometry.sourcePixelY(inputX, inputY)
        output[outputIndex++] = RppgYuvColorConverter.toArgb(
          reader.readY(sourceX, sourceY),
          reader.readU(sourceX, sourceY),
          reader.readV(sourceX, sourceY),
        )
      }
    }
  }
}
