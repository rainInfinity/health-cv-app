/** 组装相机、完整像素处理、单次采集会话与低频 Nitro 状态。 */

package com.healthcvapp.acquisition.runtime

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.graphics.ImageFormat
import androidx.camera.core.ImageProxy
import androidx.camera.view.PreviewView
import androidx.lifecycle.LifecycleOwner
import com.facebook.react.bridge.ReactContext
import com.margelo.nitro.acquisition.AcquisitionArtifact
import com.margelo.nitro.acquisition.AcquisitionArtifactFile
import com.margelo.nitro.acquisition.AcquisitionArtifactFileKind
import com.margelo.nitro.acquisition.AcquisitionCommandResult
import com.margelo.nitro.acquisition.AcquisitionSnapshot
import com.margelo.nitro.acquisition.AcquisitionState
import com.margelo.nitro.acquisition.StopCaptureResult
import com.margelo.nitro.acquisition.Variant_Boolean_NullType
import com.margelo.nitro.acquisition.Variant_NullType_AcquisitionArtifact
import com.margelo.nitro.acquisition.Variant_NullType_String
import com.healthcvapp.acquisition.camera.CameraSource
import com.healthcvapp.acquisition.camera.CameraSourceException
import com.healthcvapp.acquisition.camera.CameraSourceListener
import com.healthcvapp.acquisition.camera.CameraFrameMetadata
import com.healthcvapp.acquisition.pixels.PixelCropRect
import com.healthcvapp.acquisition.pixels.PixelFrameView
import com.healthcvapp.acquisition.pixels.PixelPlane
import com.healthcvapp.acquisition.processing.CoverageHint
import com.healthcvapp.acquisition.processing.CoverageHintProcessor
import com.healthcvapp.acquisition.processing.FramePipeline
import com.healthcvapp.acquisition.processing.PixelStatisticsExtractor
import com.healthcvapp.acquisition.processing.PpgRecordProcessor
import com.healthcvapp.acquisition.session.CaptureFailure
import com.healthcvapp.acquisition.session.CaptureSession
import com.healthcvapp.acquisition.session.SessionArtifact
import com.healthcvapp.acquisition.session.SessionFileKind
import com.margelo.nitro.core.NullType
import java.lang.ref.WeakReference
import java.util.ArrayDeque
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** 拥有 Android 采集界面的单例运行状态与控制命令。 */
class AcquisitionService(context: ReactContext) {
  private val reactContext = context
  private val applicationContext: Context = context.applicationContext
  private val cameraSource = CameraSource(applicationContext)
  private val commandMutex = Mutex()
  private val lock = Any()
  private val mainHandler = Handler(Looper.getMainLooper())
  private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private val listenerIds = AtomicLong(0)
  private val listeners = ConcurrentHashMap<Double, (AcquisitionSnapshot) -> Unit>()
  private val completedArtifacts = LinkedHashMap<String, SessionArtifact>()
  private var previewView: WeakReference<PreviewView>? = null
  private var state = AcquisitionState.CLOSED
  private var cameraSessionId: String? = null
  private var activeSession: CaptureSession? = null
  /** 预览期间保留最近拍摄结果，以配对开始时仍在途的图像。 */
  private val previewCaptureMetadata = ArrayDeque<CameraFrameMetadata>(PRESTART_CAPTURE_METADATA_CAPACITY)
  private var errorCode: String? = null
  private var errorMessage: String? = null
  private var cameraWidth = 0
  private var cameraHeight = 0
  private var framesPerSecond = 0.0
  private var torchAvailable = false
  private var hint = CoverageHint(null, null)
  private var lastArtifact: SessionArtifact? = null

  private val coverageProcessor = CoverageHintProcessor(::onCoverageHint)
  private val framePipeline = FramePipeline(PixelStatisticsExtractor(), listOf(coverageProcessor))
  private val ppgRecordProcessor = PpgRecordProcessor()

  /** 关联当前原生预览视图；挂载本身不会打开相机。 */
  fun attachPreview(view: PreviewView) {
    synchronized(lock) { previewView = WeakReference(view) }
  }

  /** 清理当前视图引用，避免旧 React 页面继续持有相机 Surface。 */
  fun detachPreview(view: PreviewView) {
    val detachedWhileOpen = synchronized(lock) {
      if (previewView?.get() !== view) return
      previewView = null
      state == AcquisitionState.PREVIEW || state == AcquisitionState.CAPTURING || state == AcquisitionState.STOPPING
    }
    if (detachedWhileOpen) serviceScope.launch { closeCamera() }
  }

  /** 返回原生状态快照，不执行任何设备操作。 */
  fun getSnapshot(): AcquisitionSnapshot = synchronized(lock) { snapshotLocked() }

  /** 注册低频状态监听并立即发送当前快照。 */
  fun addListener(listener: (AcquisitionSnapshot) -> Unit): Double {
    val listenerId = listenerIds.incrementAndGet().toDouble()
    listeners[listenerId] = listener
    dispatchSnapshot(listenerId, getSnapshot())
    return listenerId
  }

  /** 移除指定状态监听，不影响其它 Nitro 对象订阅。 */
  fun removeListener(listenerId: Double) {
    listeners.remove(listenerId)
  }

  /** 按用户命令打开后摄和原生预览。 */
  suspend fun openCamera(): AcquisitionCommandResult = commandMutex.withLock {
    synchronized(lock) {
      if (state == AcquisitionState.PREVIEW || state == AcquisitionState.CAPTURING) {
        return@withLock commandResult()
      }
      if (state != AcquisitionState.CLOSED) {
        return@withLock commandResult("CAMERA_STATE_INVALID", "请先关闭当前相机会话后再打开。")
      }
    }

    val activePreview = synchronized(lock) { previewView?.get() }
      ?: return@withLock commandResult("PREVIEW_UNAVAILABLE", "相机预览视图尚未就绪。")
    val owner = reactContext.currentActivity as? LifecycleOwner
      ?: return@withLock commandResult("ACTIVITY_UNAVAILABLE", "当前界面无法绑定 Android 相机生命周期。")
    val newCameraSessionId = UUID.randomUUID().toString()
    updateSnapshot {
      state = AcquisitionState.OPENING
      cameraSessionId = newCameraSessionId
      errorCode = null
      errorMessage = null
      cameraWidth = 0
      cameraHeight = 0
      framesPerSecond = 0.0
      torchAvailable = false
      hint = CoverageHint(null, null)
      previewCaptureMetadata.clear()
    }
    coverageProcessor.update(null)

    try {
      val capabilities = cameraSource.open(activePreview, owner, createCameraListener(newCameraSessionId))
      var openFailure: Pair<String, String>? = null
      synchronized(lock) {
        if (state != AcquisitionState.OPENING || cameraSessionId != newCameraSessionId) {
          openFailure = (errorCode ?: "CAMERA_INTERRUPTED") to (errorMessage ?: "相机在打开期间中断。")
        } else {
          state = AcquisitionState.PREVIEW
          torchAvailable = capabilities.torchAvailable
        }
        dispatchSnapshot(snapshotLocked())
      }
      openFailure?.let { details ->
        runCatching { cameraSource.close() }
        return@withLock commandResult(details.first, details.second)
      }
      commandResult()
    } catch (error: Throwable) {
      runCatching { cameraSource.close() }
      val details = cameraError(error)
      updateSnapshot {
        state = AcquisitionState.FAILED
        errorCode = details.first
        errorMessage = details.second
      }
      commandResult(details.first, details.second)
    }
  }

  /** 只在预览就绪后创建独立会话和正式记录入口。 */
  suspend fun startCapture(): AcquisitionCommandResult = commandMutex.withLock {
    if (synchronized(lock) { state != AcquisitionState.PREVIEW }) {
      return@withLock commandResult("CAMERA_NOT_READY", "相机预览尚未就绪，无法开始采集。")
    }

    val newSessionId = UUID.randomUUID().toString()
    val newSession = CaptureSession(
      filesDirectory = applicationContext.filesDir,
      sessionId = newSessionId,
      onFailure = { failure -> onCaptureFailure(newSessionId, failure) },
    )
    try {
      val startElapsedNanos = SystemClock.elapsedRealtimeNanos()
      newSession.start(
        startedAtElapsedNanos = startElapsedNanos,
        startedAtMillis = startElapsedNanos / NANOS_PER_MILLISECOND,
      )
      var bufferedCaptureMetadata: List<CameraFrameMetadata> = emptyList()
      var startFailure: Pair<String, String>? = null
      synchronized(lock) {
        if (state != AcquisitionState.PREVIEW || cameraSessionId == null) {
          startFailure = (errorCode ?: "CAMERA_INTERRUPTED") to (errorMessage ?: "相机在开始采集时中断。")
        } else {
          activeSession = newSession
          state = AcquisitionState.CAPTURING
          errorCode = null
          errorMessage = null
          bufferedCaptureMetadata = previewCaptureMetadata.toList()
          previewCaptureMetadata.clear()
        }
        dispatchSnapshot(snapshotLocked())
      }
      startFailure?.let { details ->
        newSession.fail(CaptureFailure(details.first, details.second))
        runCatching { newSession.stop(SystemClock.elapsedRealtime()) }
        return@withLock commandResult(details.first, details.second)
      }
      bufferedCaptureMetadata.forEach(newSession::offerCaptureMetadata)
      commandResult()
    } catch (error: Throwable) {
      runCatching { cameraSource.close() }
      val details = captureError(error)
      updateSnapshot {
        state = AcquisitionState.FAILED
        cameraSessionId = newSession.sessionId
        errorCode = details.first
        errorMessage = details.second
      }
      commandResult(details.first, details.second)
    }
  }

  /** 停止收帧、等待原生消费和文件关闭后才返回完成产物。 */
  suspend fun stopCapture(): StopCaptureResult = commandMutex.withLock {
    val session = synchronized(lock) { activeSession }
      ?: return@withLock stopResult(error = "NOT_CAPTURING", message = "当前没有正在采集的会话。")
    if (!session.isCapturing) {
      val failure = session.terminalFailure
      return@withLock stopResult(error = failure?.code ?: "NOT_CAPTURING", message = failure?.message ?: "当前没有正在采集的会话。")
    }

    updateSnapshot { state = AcquisitionState.STOPPING }
    try {
      val artifact = session.stop(SystemClock.elapsedRealtime())
      rememberArtifact(artifact)
      updateSnapshot {
        if (activeSession === session) activeSession = null
        state = AcquisitionState.PREVIEW
        errorCode = null
        errorMessage = null
      }
      stopResult(artifact = artifact)
    } catch (error: Throwable) {
      val details = captureError(error)
      updateSnapshot {
        state = AcquisitionState.FAILED
        errorCode = details.first
        errorMessage = details.second
      }
      stopResult(error = details.first, message = details.second)
    }
  }

  /** 正常停止当前采集、解绑相机并保留所有已完成文件。 */
  suspend fun closeCamera(): AcquisitionCommandResult = commandMutex.withLock {
    val currentState = synchronized(lock) { state }
    if (currentState == AcquisitionState.CLOSED && synchronized(lock) { activeSession == null }) {
      return@withLock commandResult()
    }
    updateSnapshot { state = AcquisitionState.CLOSING }

    var closeFailure: Pair<String, String>? = null
    val session = synchronized(lock) { activeSession }
    if (session != null) {
      try {
        rememberArtifact(session.stop(SystemClock.elapsedRealtime()))
      } catch (error: Throwable) {
        closeFailure = captureError(error)
      }
    }
    try {
      cameraSource.close()
    } catch (error: Throwable) {
      if (closeFailure == null) closeFailure = "CAMERA_CLOSE_FAILED" to (error.message ?: "相机资源释放失败。")
    }

    updateSnapshot {
      activeSession = null
      cameraSessionId = null
      cameraWidth = 0
      cameraHeight = 0
      framesPerSecond = 0.0
      torchAvailable = false
      previewCaptureMetadata.clear()
      if (closeFailure == null) {
        state = AcquisitionState.CLOSED
        errorCode = null
        errorMessage = null
      } else {
        state = AcquisitionState.FAILED
        errorCode = closeFailure!!.first
        errorMessage = closeFailure!!.second
      }
    }
    closeFailure?.let { commandResult(it.first, it.second) } ?: commandResult()
  }

  /** 返回本进程中已正常关闭且仍保留在应用私有目录的文件引用。 */
  fun listArtifacts(): Array<AcquisitionArtifact> = synchronized(lock) {
    completedArtifacts.values.map(::toNitroArtifact).toTypedArray()
  }

  private fun createCameraListener(openedSessionId: String) = object : CameraSourceListener {
    override fun onImage(image: ImageProxy) {
      analyze(image, openedSessionId)
    }

    override fun onCaptureMetadata(metadata: CameraFrameMetadata) {
      val session = synchronized(lock) {
        if (cameraSessionId != openedSessionId) {
          null
        } else {
          val active = activeSession
          if (
            active == null &&
            (state == AcquisitionState.OPENING || state == AcquisitionState.PREVIEW) &&
            metadata.timestampFrameNanos != null
          ) {
            if (previewCaptureMetadata.size == PRESTART_CAPTURE_METADATA_CAPACITY) {
              previewCaptureMetadata.removeFirst()
            }
            previewCaptureMetadata.addLast(metadata)
          }
          active
        }
      }
      session?.offerCaptureMetadata(metadata)
    }

    override fun onMetrics(width: Int, height: Int, framesPerSecond: Double) {
      updateSnapshot {
        if (cameraSessionId == openedSessionId) {
          cameraWidth = width
          cameraHeight = height
          this@AcquisitionService.framesPerSecond = framesPerSecond
        }
      }
    }

    override fun onInterrupted(code: String, message: String) {
      onCameraInterrupted(openedSessionId, code, message)
    }
  }

  private fun analyze(image: ImageProxy, openedSessionId: String) {
    val processingElapsedNanos = SystemClock.elapsedRealtimeNanos()
    val timestampSystemNanos = System.nanoTime()
    var isCurrentCamera = false
    val session = synchronized(lock) {
      isCurrentCamera = cameraSessionId == openedSessionId
      if (isCurrentCamera) activeSession else null
    }
    if (!isCurrentCamera) {
      image.close()
      return
    }
    val frameIndex = session?.beginFrame(processingElapsedNanos) ?: NO_FRAME
    val frameSessionId = if (frameIndex >= 0L) session!!.sessionId else openedSessionId
    var frame: PixelFrameView? = null
    var frameFinished = false
    var imageReleased = false
    try {
      if (image.format != ImageFormat.YUV_420_888 || image.planes.size < 3) {
        throw IllegalStateException("CameraX 未交付可读取的 YUV_420_888 帧。")
      }
      val planes = image.planes
      val frameView = PixelFrameView(
        width = image.width,
        height = image.height,
        cropRect = PixelCropRect(
          left = image.cropRect.left,
          top = image.cropRect.top,
          right = image.cropRect.right,
          bottom = image.cropRect.bottom,
        ),
        rotationDegrees = image.imageInfo.rotationDegrees,
        mirrored = false,
        colorSpace = null,
        sessionId = frameSessionId,
        frameIndex = frameIndex,
        timestampFrameNanos = image.imageInfo.timestamp,
        processingElapsedNanos = processingElapsedNanos,
        timestampSystemNanos = timestampSystemNanos,
        yPlane = planes[0].toPixelPlane(image.width, image.height),
        uPlane = planes[1].toPixelPlane((image.width + 1) / 2, (image.height + 1) / 2),
        vPlane = planes[2].toPixelPlane((image.width + 1) / 2, (image.height + 1) / 2),
      )
      frame = frameView
      framePipeline.process(frameView, {
        imageReleased = true
        image.close()
      }) { processedFrame, statistics ->
        if (frameIndex >= 0L) {
          val record = ppgRecordProcessor.process(processedFrame, statistics)
          session!!.offerPpgRecord(record, processedFrame.timestampFrameNanos)
          frameFinished = true
        }
      }
    } catch (error: Throwable) {
      if (frameIndex >= 0L && !frameFinished) {
        frameFinished = true
        session!!.finishFrame(frameIndex, null, error)
      } else if (frameIndex == NO_FRAME && frame == null) {
        onCameraInterrupted(openedSessionId, "PIXEL_PROCESSING_FAILED", error.message ?: "相机帧处理失败。")
      } else if (frameIndex == NO_FRAME) {
        onCameraInterrupted(openedSessionId, "PIXEL_PROCESSING_FAILED", error.message ?: "相机帧处理失败。")
      }
    } finally {
      if (!imageReleased) {
        imageReleased = true
        image.close()
      }
    }
  }

  private fun androidx.camera.core.ImageProxy.PlaneProxy.toPixelPlane(width: Int, height: Int) = PixelPlane(
    buffer = buffer,
    baseOffset = buffer.position(),
    width = width,
    height = height,
    rowStrideBytes = rowStride,
    pixelStrideBytes = pixelStride,
  )

  private fun onCoverageHint(value: CoverageHint) {
    updateSnapshot { hint = value }
  }

  private fun onCaptureFailure(sessionId: String, failure: CaptureFailure) {
    var openedSessionId: String? = null
    updateSnapshot {
      if (activeSession?.sessionId == sessionId && state != AcquisitionState.CLOSING && state != AcquisitionState.CLOSED) {
        openedSessionId = cameraSessionId
        state = AcquisitionState.FAILED
        errorCode = failure.code
        errorMessage = failure.message
      }
    }
    openedSessionId?.let(::closeCameraSourceAsync)
  }

  private fun onCameraInterrupted(openedSessionId: String, code: String, message: String) {
    var shouldIgnore = false
    val session = synchronized(lock) {
      if (
        cameraSessionId != openedSessionId ||
        state == AcquisitionState.CLOSING ||
        state == AcquisitionState.CLOSED
      ) {
        shouldIgnore = true
        null
      } else {
        activeSession
      }
    }
    if (shouldIgnore) return
    if (session != null) {
      val accepted = session.fail(CaptureFailure(code, message))
      if (!accepted) {
        updateSnapshot {
          if (
            cameraSessionId == openedSessionId &&
            state != AcquisitionState.CLOSING &&
            state != AcquisitionState.CLOSED
          ) {
            if (activeSession === session) activeSession = null
            state = AcquisitionState.FAILED
            errorCode = code
            errorMessage = message
          }
        }
        closeCameraSourceAsync(openedSessionId)
      }
    } else {
      updateSnapshot {
        if (
          cameraSessionId == openedSessionId &&
          state != AcquisitionState.CLOSING &&
          state != AcquisitionState.CLOSED
        ) {
          state = AcquisitionState.FAILED
          errorCode = code
          errorMessage = message
        }
      }
      closeCameraSourceAsync(openedSessionId)
    }
  }

  /** 仅在相机仍属于原错误会话时关闭设备，避免迟到任务触碰新会话。 */
  private fun closeCameraSourceAsync(openedSessionId: String) {
    serviceScope.launch {
      commandMutex.withLock {
        val shouldClose = synchronized(lock) {
          cameraSessionId == openedSessionId &&
            state != AcquisitionState.CLOSING &&
            state != AcquisitionState.CLOSED
        }
        if (!shouldClose) return@withLock
        try {
          cameraSource.close()
        } catch (error: Throwable) {
          updateSnapshot {
            if (
              cameraSessionId == openedSessionId &&
              state != AcquisitionState.CLOSING &&
              state != AcquisitionState.CLOSED
            ) {
              state = AcquisitionState.FAILED
              errorCode = "CAMERA_CLOSE_FAILED"
              errorMessage = error.message ?: "相机资源释放失败。"
            }
          }
        }
      }
    }
  }

  /** 在状态锁内更新字段并按同一顺序派发快照。 */
  private fun updateSnapshot(change: () -> Unit) {
    synchronized(lock) {
      change()
      dispatchSnapshot(snapshotLocked())
    }
  }

  private fun snapshotLocked() = AcquisitionSnapshot(
    state = state,
    sessionId = nullableString(activeSession?.sessionId ?: cameraSessionId),
    errorCode = nullableString(errorCode),
    errorMessage = nullableString(errorMessage),
    cameraWidth = cameraWidth.toDouble(),
    cameraHeight = cameraHeight.toDouble(),
    framesPerSecond = framesPerSecond,
    torchAvailable = torchAvailable,
    showSurroundingTip = nullableBoolean(hint.showSurroundingTip),
    showCoveringTip = nullableBoolean(hint.showCoveringTip),
    lastArtifact = nullableArtifact(lastArtifact),
  )

  private fun dispatchSnapshot(snapshot: AcquisitionSnapshot) {
    mainHandler.post {
      for ((listenerId, listener) in listeners) dispatchSnapshot(listenerId, snapshot)
    }
  }

  private fun dispatchSnapshot(listenerId: Double, snapshot: AcquisitionSnapshot) {
    mainHandler.post {
      listeners[listenerId]?.let { listener ->
        try {
          listener(snapshot)
        } catch (_: Throwable) {
          // 订阅者异常不能中断设备控制或其它低频通知。
        }
      }
    }
  }

  private fun rememberArtifact(artifact: SessionArtifact) {
    synchronized(lock) {
      completedArtifacts[artifact.sessionId] = artifact
      lastArtifact = artifact
    }
  }

  private fun commandResult(code: String? = null, message: String? = null) = AcquisitionCommandResult(
    errorCode = nullableString(code),
    errorMessage = nullableString(message),
  )

  private fun stopResult(
    artifact: SessionArtifact? = null,
    error: String? = null,
    message: String? = null,
  ) = StopCaptureResult(
    artifact = nullableArtifact(artifact),
    errorCode = nullableString(error),
    errorMessage = nullableString(message),
  )

  private fun nullableString(value: String?): Variant_NullType_String =
    if (value == null) Variant_NullType_String.create(NullType.NULL)
    else Variant_NullType_String.create(value)

  private fun nullableBoolean(value: Boolean?): Variant_Boolean_NullType =
    if (value == null) Variant_Boolean_NullType.create(NullType.NULL)
    else Variant_Boolean_NullType.create(value)

  private fun nullableArtifact(value: SessionArtifact?): Variant_NullType_AcquisitionArtifact =
    if (value == null) Variant_NullType_AcquisitionArtifact.create(NullType.NULL)
    else Variant_NullType_AcquisitionArtifact.create(toNitroArtifact(value))

  private fun toNitroArtifact(value: SessionArtifact) = AcquisitionArtifact(
    sessionId = value.sessionId,
    files = value.files.map { file ->
      AcquisitionArtifactFile(
        kind = when (file.kind) {
          SessionFileKind.PPG -> AcquisitionArtifactFileKind.PPG
          SessionFileKind.FRAME -> AcquisitionArtifactFileKind.FRAME
        },
        path = file.path,
        sizeBytes = file.sizeBytes.toDouble(),
      )
    }.toTypedArray(),
    startedAtMillis = value.startedAtMillis.toDouble(),
    finishedAtMillis = value.finishedAtMillis.toDouble(),
  )

  private fun captureError(error: Throwable): Pair<String, String> = when (error) {
    is CaptureFailure -> error.code to (error.message ?: "采集会话失败。")
    else -> "CAPTURE_FAILED" to (error.message ?: "采集会话失败。")
  }

  private fun cameraError(error: Throwable): Pair<String, String> = when (error) {
    is CameraSourceException -> error.code to (error.message ?: "相机无法打开。")
    else -> "CAMERA_OPEN_FAILED" to (error.message ?: "相机无法打开。")
  }

  private companion object {
    const val NO_FRAME = -1L
    const val NANOS_PER_MILLISECOND = 1_000_000L
    const val PRESTART_CAPTURE_METADATA_CAPACITY = 64
  }
}
