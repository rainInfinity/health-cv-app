/** 使用 CameraX VideoCapture 绑定独立、无声且无预览的前摄录像会话。 */

package com.healthcvapp.acquisition.passive

import android.content.Context
import android.os.SystemClock
import androidx.camera.core.CameraSelector
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FallbackStrategy
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import java.io.File
import java.util.concurrent.ExecutionException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** 保留 CameraX Finalize 的真实错误信息，不把失败折算为成功。 */
internal data class PassiveVideoFinalizeResult(
  /** CameraX Finalize 错误码；ERROR_NONE 表示正常完成。 */
  val errorCode: Int,
  /** CameraX 提供的设备或编码失败原因；不存在时为空。 */
  val errorMessage: String?,
) {
  /** 表示 CameraX 是否报告正常结束。 */
  val succeeded: Boolean get() = errorCode == VideoRecordEvent.Finalize.ERROR_NONE
}

/** 单次录像的 CameraX 用例、Start 时间及 Finalize 屏障。 */
internal class PassiveVideoRecordingSession(
  context: Context,
  private val lifecycleOwner: LifecycleOwner,
  private val outputFile: File,
) {
  private val applicationContext = context.applicationContext
  private val mainExecutor = ContextCompat.getMainExecutor(applicationContext)
  private val startedAtElapsedMillis = CompletableDeferred<Long>()
  private val finalized = CompletableDeferred<PassiveVideoFinalizeResult>()
  /** 当前会话持有的 CameraX provider 和唯一 VideoCapture 用例。 */
  private var provider: ProcessCameraProvider? = null
  private var videoCapture: VideoCapture<Recorder>? = null
  private var recording: Recording? = null

  /** 打开前摄并返回 VideoRecordEvent.Start 回调时的单调时间。 */
  suspend fun start(): Long {
    val activeProvider = withTimeout(CAMERA_OPEN_TIMEOUT_MILLIS) {
      ProcessCameraProvider.getInstance(applicationContext).await(mainExecutor)
    }
    withContext(Dispatchers.Main.immediate) {
      if (!activeProvider.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA)) {
        throw IllegalStateException("当前设备没有可用的前置摄像头。")
      }
      provider = activeProvider
      val recorder = Recorder.Builder()
        .setQualitySelector(
          QualitySelector.from(
            Quality.HD,
            FallbackStrategy.lowerQualityOrHigherThan(Quality.SD),
          ),
        )
        .build()
      val capture = VideoCapture.withOutput(recorder)
      videoCapture = capture
      try {
        activeProvider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_FRONT_CAMERA, capture)
      } catch (error: Throwable) {
        throw IllegalStateException("CameraX 无法绑定无预览前摄录像用例。", error)
      }

      val options = FileOutputOptions.Builder(outputFile).build()
      recording = capture.output
        .prepareRecording(applicationContext, options)
        .start(mainExecutor, ::onRecordEvent)
    }
    return try {
      withTimeout(RECORDING_START_TIMEOUT_MILLIS) { startedAtElapsedMillis.await() }
    } catch (error: TimeoutCancellationException) {
      throw IllegalStateException("CameraX 未在限定时间内确认录像开始。", error)
    }
  }

  /** 请求停止并等待 CameraX 完成文件收尾。 */
  suspend fun stopAndAwaitFinalize(): PassiveVideoFinalizeResult {
    withContext(Dispatchers.Main.immediate) {
      recording?.stop()
    }
    return withTimeout(FINALIZE_TIMEOUT_MILLIS) { finalized.await() }
  }

  /** 停止残留录制、等待有界收尾并解绑当前录像用例。 */
  suspend fun close() {
    val activeRecording = withContext(Dispatchers.Main.immediate) {
      recording?.also { if (!finalized.isCompleted) it.stop() }
    }
    if (activeRecording != null && !finalized.isCompleted) {
      runCatching { withTimeout(FINALIZE_TIMEOUT_MILLIS) { finalized.await() } }
    }
    withContext(Dispatchers.Main.immediate) {
      val activeProvider = provider
      val activeVideoCapture = videoCapture
      if (activeProvider != null && activeVideoCapture != null) {
        activeProvider.unbind(activeVideoCapture)
      }
      recording = null
      videoCapture = null
      provider = null
    }
  }

  private fun onRecordEvent(event: VideoRecordEvent) {
    when (event) {
      is VideoRecordEvent.Start -> startedAtElapsedMillis.complete(SystemClock.elapsedRealtime())
      is VideoRecordEvent.Finalize -> {
        if (!startedAtElapsedMillis.isCompleted) {
          startedAtElapsedMillis.completeExceptionally(
            IllegalStateException("CameraX 在确认录像开始前结束会话：${event.error}。", event.cause),
          )
        }
        finalized.complete(
          PassiveVideoFinalizeResult(
            errorCode = event.error,
            errorMessage = event.cause?.message,
          ),
        )
      }
      else -> Unit
    }
  }

  private suspend fun <T> com.google.common.util.concurrent.ListenableFuture<T>.await(
    executor: java.util.concurrent.Executor,
  ): T = suspendCancellableCoroutine { continuation ->
    addListener({
      try {
        val value = get()
        if (continuation.isActive) continuation.resume(value)
      } catch (error: ExecutionException) {
        if (continuation.isActive) continuation.resumeWithException(error.cause ?: error)
      } catch (error: Throwable) {
        if (continuation.isActive) continuation.resumeWithException(error)
      }
    }, executor)
  }

  private companion object {
    const val CAMERA_OPEN_TIMEOUT_MILLIS = 10_000L
    const val RECORDING_START_TIMEOUT_MILLIS = 10_000L
    const val FINALIZE_TIMEOUT_MILLIS = 5_000L
  }
}
