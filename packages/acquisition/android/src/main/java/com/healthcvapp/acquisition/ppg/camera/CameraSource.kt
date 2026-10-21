/** 负责后置 CameraX 能力查询、预览绑定与串行 YUV 帧交付。 */

package com.healthcvapp.acquisition.ppg.camera

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CaptureRequest
import android.hardware.camera2.CaptureResult
import android.hardware.camera2.TotalCaptureResult
import android.os.SystemClock
import android.util.Range
import android.util.Size
import android.view.Surface
import androidx.camera.camera2.interop.Camera2Interop
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.CameraState
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.SessionConfig
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.Observer
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.ExecutionException
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** 相机打开失败或设备中断时保留给控制层的稳定错误。 */
class CameraSourceException(
  val code: String,
  message: String,
  cause: Throwable? = null,
) : IllegalStateException(message, cause)

/** 返回 CameraX 真实打开后的能力状态，不把请求参数当成实测值。 */
data class CameraSourceCapabilities(
  /** 当前后摄是否具备 torch 硬件。 */
  val torchAvailable: Boolean,
  /** CameraX 为该用例组合协商出的帧率范围；设备未报告时为空。 */
  val selectedFrameRateRange: Range<Int>?,
)

/** 将图像分析帧、拍摄结果与设备中断交给会话协调层。 */
interface CameraSourceListener {
  /** 接收一帧仅在同步回调期间有效的 ImageProxy；调用方负责关闭。 */
  fun onImage(image: ImageProxy)
  /** 接收相机完成结果中提取的逐帧数值，不保留 Camera2 对象。 */
  fun onCaptureMetadata(metadata: CameraFrameMetadata)
  /** 收到实际分析尺寸及窗口测得帧率时更新低频状态。 */
  fun onMetrics(width: Int, height: Int, framesPerSecond: Double)
  /** 生命周期或设备错误使当前相机会话无法继续。 */
  fun onInterrupted(code: String, message: String)
}

/** 绑定默认后摄、原生预览与有界 YUV 分析，不创建 JavaScript 图像数据。 */
class CameraSource(context: Context) {
  private val applicationContext = context.applicationContext
  private val analyzerExecutor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "AcquisitionCameraAnalyzer").apply { isDaemon = true }
  }
  private val interruptionReported = AtomicBoolean(false)
  private var provider: ProcessCameraProvider? = null
  /** 解绑时必须传入绑定相机时使用的同一个 SessionConfig 实例。 */
  private var boundSessionConfig: SessionConfig? = null
  private var analysisUseCase: ImageAnalysis? = null
  private var camera: Camera? = null
  private var lifecycleOwner: LifecycleOwner? = null
  private var lifecycleObserver: LifecycleEventObserver? = null
  private var cameraStateObserver: Observer<CameraState>? = null
  @Volatile private var listener: CameraSourceListener? = null
  @Volatile private var closing = false
  private var metricsWindowStartNanos = 0L
  private var metricsFrames = 0
  private var metricsWidth = 0
  private var metricsHeight = 0
  private var lastReportedWidth = 0
  private var lastReportedHeight = 0

  /** 显式查询后摄并绑定 CameraX 支持的分辨率／帧率组合。 */
  suspend fun open(
    previewView: PreviewView,
    owner: LifecycleOwner,
    listener: CameraSourceListener,
  ): CameraSourceCapabilities {
    if (ContextCompat.checkSelfPermission(applicationContext, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      throw CameraSourceException("CAMERA_PERMISSION_DENIED", "尚未授予相机权限。")
    }

    val cameraProvider = try {
      ProcessCameraProvider.getInstance(applicationContext).await()
    } catch (error: Throwable) {
      throw CameraSourceException("CAMERA_PROVIDER_FAILED", "无法初始化 CameraX。", error)
    }

    return withContext(Dispatchers.Main.immediate) {
      if (!cameraProvider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA)) {
        throw CameraSourceException("NO_BACK_CAMERA", "当前设备没有可用的后置相机。")
      }
      if (owner.lifecycle.currentState == Lifecycle.State.DESTROYED) {
        throw CameraSourceException("ACTIVITY_UNAVAILABLE", "当前界面已退出，无法打开相机。")
      }

      closing = false
      interruptionReported.set(false)
      metricsWindowStartNanos = 0L
      metricsFrames = 0
      metricsWidth = 0
      metricsHeight = 0
      lastReportedWidth = 0
      lastReportedHeight = 0
      this@CameraSource.provider = cameraProvider
      this@CameraSource.listener = listener
      lifecycleOwner = owner

      val targetResolution = Size(CANDIDATE_WIDTH, CANDIDATE_HEIGHT)
      val preview = Preview.Builder()
        .setTargetResolution(targetResolution)
        .setTargetRotation(previewView.display?.rotation ?: Surface.ROTATION_0)
        .build()
      val analysisBuilder = ImageAnalysis.Builder()
        .setTargetResolution(targetResolution)
        .setTargetRotation(previewView.display?.rotation ?: Surface.ROTATION_0)
        .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
        .setBackpressureStrategy(ImageAnalysis.STRATEGY_BLOCK_PRODUCER)
      Camera2Interop.Extender(analysisBuilder)
        .setSessionCaptureCallback(object : CameraCaptureSession.CaptureCallback() {
          override fun onCaptureCompleted(
            session: CameraCaptureSession,
            request: CaptureRequest,
            result: TotalCaptureResult,
          ) {
            val activeListener = this@CameraSource.listener
            if (closing || activeListener == null || activeListener !== listener) return
            activeListener.onCaptureMetadata(
              CameraFrameMetadata.fromCaptureResult(
                timestampElapsedNanos = SystemClock.elapsedRealtimeNanos(),
                timestampFrameNanos = result.get(CaptureResult.SENSOR_TIMESTAMP),
                timestampSystemNanos = System.nanoTime(),
                exposureTimeNanos = result.get(CaptureResult.SENSOR_EXPOSURE_TIME),
                durationTimeNanos = result.get(CaptureResult.SENSOR_FRAME_DURATION),
                rollingShutterSkewTimeNanos = result.get(CaptureResult.SENSOR_ROLLING_SHUTTER_SKEW),
                iso = result.get(CaptureResult.SENSOR_SENSITIVITY),
                whiteBalanceMode = result.get(CaptureResult.CONTROL_AWB_MODE),
              ),
            )
          }
        })
      val analysis = analysisBuilder.build()
      val useCases = listOf(preview, analysis)
      val queryConfig = SessionConfig.Builder(useCases).build()
      val cameraInfo = try {
        cameraProvider.getCameraInfo(CameraSelector.DEFAULT_BACK_CAMERA, queryConfig)
      } catch (error: Throwable) {
        throw CameraSourceException("CAMERA_CONFIGURATION_UNAVAILABLE", "后置相机不支持当前预览与分析组合。", error)
      }
      val selectedRange = chooseFrameRateRange(cameraInfo.getSupportedFrameRateRanges(queryConfig))
      val sessionConfig = if (selectedRange == null) {
        queryConfig
      } else {
        SessionConfig.Builder(useCases).setFrameRateRange(selectedRange).build()
      }

      preview.setSurfaceProvider(previewView.surfaceProvider)
      analysis.setAnalyzer(analyzerExecutor) { image ->
        val activeListener = this@CameraSource.listener
        if (closing || activeListener == null || activeListener !== listener) {
          image.close()
        } else {
          updateMetrics(image.width, image.height)
          activeListener.onImage(image)
        }
      }
      analysisUseCase = analysis

      try {
        camera = cameraProvider.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, sessionConfig)
        boundSessionConfig = sessionConfig
      } catch (error: Throwable) {
        analysis.clearAnalyzer()
        cameraProvider.unbind(sessionConfig)
        analysisUseCase = null
        this@CameraSource.listener = null
        lifecycleOwner = null
        throw CameraSourceException("CAMERA_OPEN_FAILED", "后置相机无法打开或不支持所选用例组合。", error)
      }

      val activeCamera = checkNotNull(camera)
      val torchAvailable = activeCamera.cameraInfo.hasFlashUnit()
      if (torchAvailable) {
        try {
          activeCamera.cameraControl.enableTorch(true).await()
        } catch (error: Throwable) {
          throw CameraSourceException("TORCH_ENABLE_FAILED", "后置相机补光灯无法启用。", error)
        }
      }
      if (closing || this@CameraSource.listener !== listener || this@CameraSource.camera !== activeCamera) {
        throw CameraSourceException("CAMERA_INTERRUPTED", "相机在打开期间中断。")
      }
      observeLifecycle(owner, activeCamera)
      CameraSourceCapabilities(
        torchAvailable = torchAvailable,
        selectedFrameRateRange = selectedRange,
      )
    }
  }

  /** 通过绑定时保留的 SessionConfig 解绑相机，并移除所有生命周期观察。 */
  suspend fun close() {
    withContext(Dispatchers.Main.immediate) {
      if (closing && camera == null) return@withContext
      closing = true
      val owner = lifecycleOwner
      lifecycleObserver?.let { observer -> owner?.lifecycle?.removeObserver(observer) }
      cameraStateObserver?.let { observer -> camera?.cameraInfo?.cameraState?.removeObserver(observer) }
      lifecycleObserver = null
      cameraStateObserver = null
      analysisUseCase?.clearAnalyzer()
      val sessionConfigToUnbind = boundSessionConfig
      if (sessionConfigToUnbind != null) provider?.unbind(sessionConfigToUnbind)
      boundSessionConfig = null
      camera = null
      analysisUseCase = null
      lifecycleOwner = null
      listener = null
    }
    awaitAnalyzerIdle()
  }

  private fun observeLifecycle(owner: LifecycleOwner, camera: Camera) {
    val ownerObserver = LifecycleEventObserver { _, event ->
      if (event == Lifecycle.Event.ON_STOP) {
        reportInterruption("APP_BACKGROUND", "应用进入后台，相机已停止。")
      }
    }
    val stateObserver = Observer<CameraState> { state ->
      val cameraError = state.error ?: return@Observer
      reportInterruption("CAMERA_INTERRUPTED", cameraError.cause?.message ?: cameraError.toString())
    }
    lifecycleObserver = ownerObserver
    cameraStateObserver = stateObserver
    owner.lifecycle.addObserver(ownerObserver)
    camera.cameraInfo.cameraState.observe(owner, stateObserver)
  }

  private fun reportInterruption(code: String, message: String) {
    val interruptedListener = listener ?: return
    if (closing || !interruptionReported.compareAndSet(false, true)) return
    ContextCompat.getMainExecutor(applicationContext).execute {
      if (!closing && this@CameraSource.listener === interruptedListener) {
        interruptedListener.onInterrupted(code, message)
      }
    }
  }

  /** 等待解绑前已经排入串行分析器的旧帧结束，避免跨会话通知。 */
  private suspend fun awaitAnalyzerIdle() {
    val barrier = CompletableDeferred<Unit>()
    analyzerExecutor.execute { barrier.complete(Unit) }
    barrier.await()
  }

  private fun updateMetrics(width: Int, height: Int) {
    val now = SystemClock.elapsedRealtimeNanos()
    if (width != metricsWidth || height != metricsHeight) {
      metricsWidth = width
      metricsHeight = height
      metricsWindowStartNanos = now
      metricsFrames = 0
    }
    metricsFrames += 1
    val elapsed = now - metricsWindowStartNanos
    if (lastReportedWidth != width || lastReportedHeight != height || elapsed >= METRICS_WINDOW_NANOS) {
      val fps = if (elapsed > 0L) metricsFrames * NANOS_PER_SECOND / elapsed else 0.0
      listener?.onMetrics(width, height, fps)
      metricsWindowStartNanos = now
      metricsFrames = 0
      lastReportedWidth = width
      lastReportedHeight = height
    }
  }

  private fun chooseFrameRateRange(ranges: Set<Range<Int>>): Range<Int>? {
    val rangesIncludingCandidate = ranges.filter { it.contains(CANDIDATE_FPS) }
    return rangesIncludingCandidate.minByOrNull { it.upper - it.lower }
      ?: ranges.maxWithOrNull(compareBy<Range<Int>> { it.upper }.thenBy { it.lower })
  }

  private suspend fun <T> com.google.common.util.concurrent.ListenableFuture<T>.await(): T =
    suspendCancellableCoroutine { continuation ->
      addListener({
        try {
          continuation.resume(get())
        } catch (error: ExecutionException) {
          continuation.resumeWithException(error.cause ?: error)
        } catch (error: Throwable) {
          continuation.resumeWithException(error)
        }
      }, ContextCompat.getMainExecutor(applicationContext))
    }

  private companion object {
    const val CANDIDATE_WIDTH = 720
    const val CANDIDATE_HEIGHT = 720
    const val CANDIDATE_FPS = 30
    const val METRICS_WINDOW_NANOS = 1_000_000_000L
    const val NANOS_PER_SECOND = 1_000_000_000.0
  }
}
