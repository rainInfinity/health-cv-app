/** 指尖核心回归使用实际可寻址 YUV 像素与受控相机元数据。 */
package com.healthcvapp.acquisition.ppg.fingertip

import com.healthcvapp.acquisition.camera.CameraFrameMetadata
import com.healthcvapp.acquisition.camera.model.*
import com.healthcvapp.acquisition.pixels.PixelCropRect
import com.healthcvapp.acquisition.pixels.PixelFrameView
import com.healthcvapp.acquisition.pixels.PixelPlane
import com.healthcvapp.acquisition.ppg.model.*
import java.nio.ByteBuffer

/** 构造带非零偏移、行填充和色度像素步长的真实平面，避免只测试均值。 */
internal fun fingertipPixelFrame(
  width: Int = 64, height: Int = 48,
  crop: PixelCropRect = PixelCropRect(4, 4, width - 4, height - 4),
  color: (Int, Int) -> Triple<Int, Int, Int> = { _, _ -> Triple(90, 90, 210) },
): PixelFrameView {
  fun plane(channel: Int, w: Int, h: Int, pixelStride: Int): PixelPlane {
    val stride = w * pixelStride + 7
    val buffer = ByteBuffer.allocate(3 + stride * h)
    for (y in 0 until h) for (x in 0 until w) {
      val sample = color(if (channel == 0) x else x * 2, if (channel == 0) y else y * 2)
      buffer.put(3 + y * stride + x * pixelStride, when (channel) { 0 -> sample.first; 1 -> sample.second; else -> sample.third }.toByte())
    }
    return PixelPlane(buffer, 3, w, h, stride, pixelStride)
  }
  return PixelFrameView(width, height, crop, 90, false, null, "pixels", -1,
    0, 0, 0, plane(0, width, height, 1), plane(1, (width + 1) / 2, (height + 1) / 2, 2),
    plane(2, (width + 1) / 2, (height + 1) / 2, 2))
}

/** 最小冻结配置只用来驱动控制器，不伪造硬件能力校验。 */
internal fun fingertipConfiguration(): PPGConfigSummary {
  val config = CameraConfig("rear", CameraResolution(720.0, 720.0), 30.0, true,
    CameraExposureConfig(CameraExposureMode.AUTO, 0.0, null, null, true),
    CameraWhiteBalanceConfig(CameraWhiteBalanceMode.AUTO, true), CameraFocusConfig(CameraFocusMode.AUTO, null))
  return PPGConfigSummary(CameraConfigSummary("rear", config, config, emptyList(), null, null), CameraBlockLayout(1, 1))
}

/** 精确匹配传感器时间的单帧元数据。 */
internal fun fingertipMetadata(timestamp: Long) = CameraFrameMetadata(timestamp + 1, timestamp, timestamp + 2,
  5_000_000, 33_000_000, 1_000_000, 100, 1)

/** 正式全帧单块记录；同帧可用性只进入展示链，不增加 CSV 列。 */
internal fun fingertipRecord(index: Long, timestamp: Long, green: Double = 40.0, coverageUsable: Boolean? = true) =
  PPGFrameRecord(timestamp / 1_000_000.0, timestamp / 1_000_000.0, timestamp / 1_000_000.0,
    index, CameraBlockLayout(1, 1), doubleArrayOf(green, 128.0, 128.0), coverageUsable)
