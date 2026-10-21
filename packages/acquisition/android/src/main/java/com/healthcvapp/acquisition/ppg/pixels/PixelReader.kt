/** 按原生 plane 偏移、行步长与像素步长读取有效 YUV 样本。 */

package com.healthcvapp.acquisition.ppg.pixels

/** 只读借用指定 PixelFrameView 的 Y、U、V 样本。 */
class PixelReader internal constructor(private val frame: PixelFrameView) {
  /** 读取裁剪区域内的 Y 样本，返回 0–255。 */
  fun readY(x: Int, y: Int): Int {
    checkCoordinates(x, y)
    return frame.yPlane.readUnsigned(x, y)
  }

  /** 读取映射到当前亮度像素的 4:2:0 U 样本，返回 0–255。 */
  fun readU(x: Int, y: Int): Int {
    checkCoordinates(x, y)
    return frame.uPlane.readUnsigned(x / 2, y / 2)
  }

  /** 读取映射到当前亮度像素的 4:2:0 V 样本，返回 0–255。 */
  fun readV(x: Int, y: Int): Int {
    checkCoordinates(x, y)
    return frame.vPlane.readUnsigned(x / 2, y / 2)
  }

  /** 校验借用仍有效且坐标位于有效裁剪区域内。 */
  private fun checkCoordinates(x: Int, y: Int) {
    frame.checkActive()
    val crop = frame.cropRect
    if (x !in crop.left until crop.right || y !in crop.top until crop.bottom) {
      throw IndexOutOfBoundsException("pixel ($x, $y) is outside the valid crop")
    }
  }
}
