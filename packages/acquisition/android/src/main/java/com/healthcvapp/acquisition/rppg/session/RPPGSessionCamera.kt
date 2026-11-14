/** 为主动 RPPG 封装前摄生命周期与同步借用帧。 */

package com.healthcvapp.acquisition.rppg.session

import android.content.Context
import androidx.camera.core.ImageProxy
import androidx.camera.view.PreviewView
import androidx.lifecycle.LifecycleOwner
import com.healthcvapp.acquisition.camera.CameraFrameMetadata
import com.healthcvapp.acquisition.camera.CameraSource
import com.healthcvapp.acquisition.camera.CameraSourceListener
import com.healthcvapp.acquisition.camera.toPixelFrameView
import com.healthcvapp.acquisition.camera.model.CameraConfig
import com.healthcvapp.acquisition.camera.model.CameraConfigSummary
import com.healthcvapp.acquisition.camera.model.CameraDescriptor
import com.healthcvapp.acquisition.camera.model.CameraModeCapability
import com.healthcvapp.acquisition.camera.model.CameraFrameBackpressure
import com.healthcvapp.acquisition.camera.model.CameraFrameGeometry
import com.healthcvapp.acquisition.pixels.PixelFrameView
import java.util.concurrent.atomic.AtomicBoolean

/** 暴露同步回调期间有效的相机帧视图，不转移 CameraX 图像所有权。 */
internal interface RPPGCameraFrame : AutoCloseable {
  /** CameraX 提供的传感器采集时间，单位纳秒。 */
  val sensorTimestampNanos: Long

  /** 在借用有效期间构造保留真实平面 stride 的像素视图。 */
  fun pixelFrameView(
    sessionId: String,
    frameIndex: Long,
    processingElapsedNanos: Long,
    timestampSystemNanos: Long,
  ): PixelFrameView
}

/** 接收属于单一相机会话代次的帧、实测摘要和中断。 */
internal interface RPPGSessionCameraListener {
  /** 同步消费借用帧；方法返回后相机源立即关闭该帧。 */
  fun onFrame(frame: RPPGCameraFrame)

  /** 接收不保留 Camera2 对象的拍摄结果摘要。 */
  fun onCaptureMetadata(metadata: CameraFrameMetadata)

  /** 接收实际帧几何和低频观测帧率。 */
  fun onMetrics(geometry: CameraFrameGeometry, framesPerSecond: Double)

  /** 接收相机或宿主生命周期中断。 */
  fun onInterrupted(code: String, message: String)
}

/** 统一预览与仅分析相机绑定契约，供主动和被动 RPPG 会话复用。 */
internal interface RPPGSessionCameraSource {
  /** 枚举相机而不绑定或占用设备。 */
  suspend fun listCameras(): List<CameraDescriptor>

  /** 查询指定逻辑相机的对焦模式能力，不打开或绑定相机。 */
  suspend fun getFocusModeCapability(cameraId: String): CameraModeCapability

  /** 打开仅用于主动界面的预览帧代次。 */
  suspend fun openPreview(
    config: CameraConfig,
    listener: RPPGSessionCameraListener,
    onHostStopped: () -> Unit,
  ): CameraConfigSummary

  /** 只绑定分析用例，供没有页面预览的后台会话使用。 */
  suspend fun openAnalysisOnly(
    config: CameraConfig,
    listener: RPPGSessionCameraListener,
    onHostStopped: () -> Unit,
  ): CameraConfigSummary

  /** 排空旧帧后绑定新的正式观察帧代次。 */
  suspend fun replaceFrameGeneration(
    config: CameraConfig,
    listener: RPPGSessionCameraListener,
    onHostStopped: () -> Unit,
  ): CameraConfigSummary

  /** 解绑当前相机用例并等待已交付帧退出。 */
  suspend fun close()
}

/** 将共享 CameraSource 适配到主动 RPPG，并固定为仅保留最新帧。 */
internal class AndroidRPPGSessionCameraSource(
  context: Context,
  private val previewView: PreviewView?,
  private val lifecycleOwner: LifecycleOwner,
) : RPPGSessionCameraSource {
  private val source = CameraSource(context)

  /** 枚举设备上的逻辑相机。 */
  override suspend fun listCameras(): List<CameraDescriptor> = source.listCameras()

  /** 查询前摄的设备对焦模式能力。 */
  override suspend fun getFocusModeCapability(cameraId: String): CameraModeCapability =
    source.getCameraCapabilities(cameraId).focusModes

  /** 绑定原生预览及丢旧帧分析路径。 */
  override suspend fun openPreview(
    config: CameraConfig,
    listener: RPPGSessionCameraListener,
    onHostStopped: () -> Unit,
  ): CameraConfigSummary = source.open(
    config = config,
    previewView = checkNotNull(previewView) { "主动 RPPG 需要已挂载的预览视图。" },
    owner = lifecycleOwner,
    listener = cameraListener(listener),
    backpressureStrategy = CameraFrameBackpressure.KEEP_ONLY_LATEST,
    onHostStopped = onHostStopped,
  ).configSummary
  /** 绑定无预览的 YUV 分析流，不创建 Preview 或 Surface。 */
  override suspend fun openAnalysisOnly(
    config: CameraConfig,
    listener: RPPGSessionCameraListener,
    onHostStopped: () -> Unit,
  ): CameraConfigSummary = source.openAnalysisOnly(
    config = config,
    owner = lifecycleOwner,
    listener = cameraListener(listener),
    backpressureStrategy = CameraFrameBackpressure.KEEP_ONLY_LATEST,
    onHostStopped = onHostStopped,
  ).configSummary

  /** 先由共享源排空旧分析器，再绑定正式观察帧监听。 */
  override suspend fun replaceFrameGeneration(
    config: CameraConfig,
    listener: RPPGSessionCameraListener,
    onHostStopped: () -> Unit,
  ): CameraConfigSummary = source.replaceFrameGeneration(
    config = config,
    previewView = checkNotNull(previewView) { "主动 RPPG 需要已挂载的预览视图。" },
    owner = lifecycleOwner,
    listener = cameraListener(listener),
    backpressureStrategy = CameraFrameBackpressure.KEEP_ONLY_LATEST,
    onHostStopped = onHostStopped,
  ).configSummary

  /** 关闭 CameraX 周期并等待串行分析器屏障。 */
  override suspend fun close() {
    source.close()
  }

  /** 在相机同步回调内包装借用帧，并保证所有出口恰好释放一次。 */
  private fun cameraListener(listener: RPPGSessionCameraListener) = object : CameraSourceListener {
    override fun onImage(image: ImageProxy) {
      val frame = AndroidRPPGCameraFrame(image)
      try {
        listener.onFrame(frame)
      } finally {
        frame.close()
      }
    }

    override fun onCaptureMetadata(metadata: CameraFrameMetadata) {
      listener.onCaptureMetadata(metadata)
    }

    override fun onMetrics(geometry: CameraFrameGeometry, framesPerSecond: Double) {
      listener.onMetrics(geometry, framesPerSecond)
    }

    override fun onInterrupted(code: String, message: String) {
      listener.onInterrupted(code, message)
    }
  }
}

/** 在 ImageProxy 生命周期内提供像素适配，并防止同一图像重复释放。 */
private class AndroidRPPGCameraFrame(
  private val image: ImageProxy,
) : RPPGCameraFrame {
  private val closed = AtomicBoolean(false)

  override val sensorTimestampNanos: Long
    get() {
      check(!closed.get()) { "RPPG camera frame 已失效。" }
      return image.imageInfo.timestamp
    }

  /** 将当前借用帧映射到共享像素视图，不复制或延长其生命周期。 */
  override fun pixelFrameView(
    sessionId: String,
    frameIndex: Long,
    processingElapsedNanos: Long,
    timestampSystemNanos: Long,
  ): PixelFrameView {
    check(!closed.get()) { "RPPG camera frame 已失效。" }
    return image.toPixelFrameView(
      sessionId = sessionId,
      frameIndex = frameIndex,
      processingElapsedNanos = processingElapsedNanos,
      timestampSystemNanos = timestampSystemNanos,
      mirrored = false,
    )
  }

  /** 释放 CameraX 帧；相机适配器与会话清理可安全重复调用。 */
  override fun close() {
    if (closed.compareAndSet(false, true)) image.close()
  }
}
