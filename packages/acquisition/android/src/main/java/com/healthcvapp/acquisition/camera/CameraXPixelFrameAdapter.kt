/** 将 CameraX ImageProxy 的平面元数据封装为同步借用像素帧。 */
package com.healthcvapp.acquisition.camera

import android.graphics.ImageFormat
import androidx.camera.core.ImageProxy
import com.healthcvapp.acquisition.pixels.PixelCropRect
import com.healthcvapp.acquisition.pixels.PixelFrameView
import com.healthcvapp.acquisition.pixels.PixelPlane

/** 按真实 plane 偏移、行步长和像素步长建立 PixelFrameView；不取得 ImageProxy 所有权。 */
internal fun ImageProxy.toPixelFrameView(
  sessionId: String,
  frameIndex: Long,
  processingElapsedNanos: Long,
  timestampSystemNanos: Long,
  mirrored: Boolean,
): PixelFrameView {
  if (format != ImageFormat.YUV_420_888 || planes.size < 3) {
    throw IllegalStateException("CameraX 未交付可读取的 YUV_420_888 帧。")
  }
  val imagePlanes = planes
  return PixelFrameView(
    width = width,
    height = height,
    cropRect = PixelCropRect(cropRect.left, cropRect.top, cropRect.right, cropRect.bottom),
    rotationDegrees = imageInfo.rotationDegrees,
    mirrored = mirrored,
    colorSpace = null,
    sessionId = sessionId,
    frameIndex = frameIndex,
    timestampFrameNanos = imageInfo.timestamp,
    processingElapsedNanos = processingElapsedNanos,
    timestampSystemNanos = timestampSystemNanos,
    yPlane = imagePlanes[0].toPixelPlane(width, height),
    uPlane = imagePlanes[1].toPixelPlane((width + 1) / 2, (height + 1) / 2),
    vPlane = imagePlanes[2].toPixelPlane((width + 1) / 2, (height + 1) / 2),
  )
}

/** 保留 CameraX 平面的真实数据偏移和步长。 */
private fun ImageProxy.PlaneProxy.toPixelPlane(width: Int, height: Int) = PixelPlane(
  buffer = buffer,
  baseOffset = buffer.position(),
  width = width,
  height = height,
  rowStrideBytes = rowStride,
  pixelStrideBytes = pixelStride,
)
