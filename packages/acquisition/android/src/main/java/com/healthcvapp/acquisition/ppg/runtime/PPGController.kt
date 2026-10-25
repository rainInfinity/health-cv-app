/** 维护主动 PPG 的相机控制、会话状态与低频通知。 */

package com.healthcvapp.acquisition.ppg.runtime

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
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
import com.margelo.nitro.acquisition.Variant_NullType_CameraConfigSummary
import com.margelo.nitro.acquisition.toNitro
import com.healthcvapp.acquisition.ppg.camera.CameraSource
import com.healthcvapp.acquisition.ppg.camera.CameraSourceException
import com.healthcvapp.acquisition.ppg.camera.CameraSourceListener
import com.healthcvapp.acquisition.ppg.camera.CameraFrameMetadata
import com.healthcvapp.acquisition.camera.ownership.CameraUseGuard
import com.healthcvapp.acquisition.camera.ownership.CameraUseLease
import com.healthcvapp.acquisition.ppg.model.PPGArtifact
import com.healthcvapp.acquisition.ppg.model.CameraDescriptor
import com.healthcvapp.acquisition.ppg.model.CameraCapabilities
import com.healthcvapp.acquisition.ppg.model.PPGArtifactFileKind
import com.healthcvapp.acquisition.ppg.model.CameraCaptureOptions
import com.healthcvapp.acquisition.ppg.model.CameraCaptureOptionsRequest
import com.healthcvapp.acquisition.ppg.model.CameraConfig as ModelCameraConfig
import com.healthcvapp.acquisition.ppg.model.CameraConfigFailure
import com.healthcvapp.acquisition.ppg.model.CameraConfigSummary as ModelCameraConfigSummary
import com.healthcvapp.acquisition.ppg.model.CameraFrameGeometry
import com.healthcvapp.acquisition.ppg.model.CameraLockPhase as ModelCameraLockPhase
import com.healthcvapp.acquisition.ppg.model.CameraLockStatus as ModelCameraLockStatus
import com.healthcvapp.acquisition.ppg.processing.CoverageHint
import com.healthcvapp.acquisition.ppg.processing.CoverageHintProcessor
import com.healthcvapp.acquisition.ppg.processing.FramePipeline
import com.healthcvapp.acquisition.ppg.processing.PPGFrameHandler
import com.healthcvapp.acquisition.ppg.processing.PixelStatisticsExtractor
import com.healthcvapp.acquisition.ppg.processing.PPGRecordProcessor
import com.healthcvapp.acquisition.ppg.session.PPGCaptureFailure
import com.healthcvapp.acquisition.ppg.session.PPGCaptureSession
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
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout

/** 拥有主动 PPG 的相机、预览引用、会话状态和控制命令。 */
internal class PPGController(context: ReactContext) {
  private val reactContext = context
  private val applicationContext: Context = context.applicationContext
  private val cameraSource = CameraSource(applicationContext)
  private val commandMutex = Mutex()
  private val lock = Any()
  private val mainHandler = Handler(Looper.getMainLooper())
  private val controllerScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private val listenerIds = AtomicLong(0)
  private val listeners = ConcurrentHashMap<Double, (AcquisitionSnapshot) -> Unit>()
  private val completedArtifacts = LinkedHashMap<String, PPGArtifact>()
  private var previewView: WeakReference<PreviewView>? = null
  private var state = AcquisitionState.CLOSED
  private var cameraSessionId: String? = null
  private var activeSession: PPGCaptureSession? = null
  /** 后摄会话独占的相机使用权。 */
  private var cameraUseLease: CameraUseLease? = null
  /** 预览期间保留最近拍摄结果，以配对开始时仍在途的图像。 */
  private val previewCaptureMetadata = ArrayDeque<CameraFrameMetadata>(PRESTART_CAPTURE_METADATA_CAPACITY)
  /** 最新已观察的 Camera2 传感器时间戳，用于拒绝锁屏前的在途结果。 */
  private var latestCameraFrameTimestampNanos: Long? = null
  /** 当前周期唯一等待中的真实 AE／AWB 锁结果。 */
  private var pendingLockConfirmation: CameraLockConfirmationBarrier? = null
  /** 本次正式采集只接受晚于确认锁帧的相机图像。 */
  private var captureFrameTimestampAfterLock: Long? = null
  private var errorCode: String? = null
  private var errorMessage: String? = null
  private var cameraWidth = 0
  private var cameraHeight = 0
  private var framesPerSecond = 0.0
  private var torchAvailable = false
  private var hint = CoverageHint(null, null)
  private var lastArtifact: PPGArtifact? = null
  private var cameraConfigSummary: ModelCameraConfigSummary? = null
  private var cameraLockStatus = ModelCameraLockStatus(
    phase = ModelCameraLockPhase.NOT_REQUESTED,
    aeLocked = null,
    awbLocked = null,
    errorCode = null,
    errorMessage = null,
  )

  private val coverageProcessor = CoverageHintProcessor(::onCoverageHint)
  private val ppgFrameHandler = PPGFrameHandler(
    framePipeline = FramePipeline(PixelStatisticsExtractor(), listOf(coverageProcessor)),
    ppgRecordProcessor = PPGRecordProcessor(),
    onPreviewFrameFailure = ::onCameraInterrupted,
  )

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
    if (detachedWhileOpen) controllerScope.launch { closeCamera() }
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

  /** 查询主动 CameraX 相机列表，不修改会话状态或互斥租约。 */
  suspend fun listCameras(): List<CameraDescriptor> = cameraSource.listCameras()

  /** 查询指定逻辑相机的静态参数能力，不改变主动会话或相机租约。 */
  suspend fun getCameraCapabilities(cameraId: String): CameraCapabilities =
    cameraSource.getCameraCapabilities(cameraId)

  /** 查询未绑定的 Preview + YUV 组合和本地分块边界，不申请相机租约。 */
  suspend fun getSupportedCaptureOptions(
    cameraId: String,
    request: CameraCaptureOptionsRequest,
  ): CameraCaptureOptions = cameraSource.getSupportedCaptureOptions(cameraId, request)

  /** 按显式相机配置打开原生预览；配置校验完成后才申请互斥租约。 */
  suspend fun openCamera(config: ModelCameraConfig): AcquisitionCommandResult = commandMutex.withLock {
    synchronized(lock) {
      if (state != AcquisitionState.CLOSED) {
        return@withLock commandResult("CAMERA_STATE_INVALID", "当前相机周期未关闭，不能提交新配置。")
      }
    }

    val activePreview = synchronized(lock) { previewView?.get() }
      ?: return@withLock commandResult("PREVIEW_UNAVAILABLE", "相机预览视图尚未就绪。")
    val owner = reactContext.currentActivity as? LifecycleOwner
      ?: return@withLock commandResult("ACTIVITY_UNAVAILABLE", "当前界面无法绑定 Android 相机生命周期。")
    val validatedSummary = try {
      cameraSource.validateConfiguration(config)
    } catch (error: Throwable) {
      val details = cameraError(error)
      return@withLock commandResult(details.first, details.second)
    }

    val newCameraSessionId = UUID.randomUUID().toString()
    val cameraLease = CameraUseGuard.tryAcquire(newCameraSessionId)
      ?: return@withLock commandResult("CAMERA_BUSY", "相机正被另一种采集会话使用。")
    synchronized(lock) { cameraUseLease = cameraLease }
    updateSnapshot {
      state = AcquisitionState.OPENING
      cameraSessionId = newCameraSessionId
      cameraConfigSummary = validatedSummary
      cameraLockStatus = ModelCameraLockStatus(
        phase = ModelCameraLockPhase.NOT_REQUESTED,
        aeLocked = null,
        awbLocked = null,
        errorCode = null,
        errorMessage = null,
      )
      errorCode = null
      errorMessage = null
      cameraWidth = 0
      cameraHeight = 0
      framesPerSecond = 0.0
      torchAvailable = false
      hint = CoverageHint(null, null)
      previewCaptureMetadata.clear()
      latestCameraFrameTimestampNanos = null
      pendingLockConfirmation = null
      captureFrameTimestampAfterLock = null
    }
    coverageProcessor.update(null)

    try {
      val capabilities = cameraSource.open(
        config = config,
        previewView = activePreview,
        owner = owner,
        listener = createCameraListener(newCameraSessionId),
      )
      var openFailure: Pair<String, String>? = null
      synchronized(lock) {
        if (state != AcquisitionState.OPENING || cameraSessionId != newCameraSessionId) {
          openFailure = (errorCode ?: "CAMERA_INTERRUPTED") to (errorMessage ?: "相机在打开期间中断。")
        } else {
          state = AcquisitionState.PREVIEW
          torchAvailable = capabilities.torchAvailable
          cameraConfigSummary = capabilities.configSummary
        }
        dispatchSnapshot(snapshotLocked())
      }
      openFailure?.let { details ->
        runCatching { cameraSource.close() }
        releaseCameraUseLease(cameraLease)
        return@withLock commandResult(details.first, details.second)
      }
      commandResult()
    } catch (error: Throwable) {
      runCatching { cameraSource.close() }
      releaseCameraUseLease(cameraLease)
      val details = cameraError(error)
      updateSnapshot {
        state = AcquisitionState.FAILED
        errorCode = details.first
        errorMessage = details.second
      }
      commandResult(details.first, details.second)
    }
  }

  /** 应用锁请求并等待同一相机周期的 CaptureResult 确认。 */
  private suspend fun applyAndConfirmCameraLocks(
    openedCameraSessionId: String,
    aeLocked: Boolean,
    awbLocked: Boolean,
    expectedAeLocked: Boolean?,
    expectedAwbLocked: Boolean?,
    confirmedPhase: ModelCameraLockPhase,
  ): CameraFrameMetadata {
    val barrier = synchronized(lock) {
      if (cameraSessionId != openedCameraSessionId) {
        throw CameraSourceException("CAMERA_INTERRUPTED", "相机周期已结束，不能等待锁确认。")
      }
      if (pendingLockConfirmation != null) {
        throw CameraSourceException("CAMERA_LOCK_PENDING", "当前相机已有未完成的锁确认。")
      }
      val currentBarrier = CameraLockConfirmationBarrier(
        cameraSessionId = openedCameraSessionId,
        minimumFrameTimestampNanos = latestCameraFrameTimestampNanos,
        expectedAeLocked = expectedAeLocked,
        expectedAwbLocked = expectedAwbLocked,
      )
      pendingLockConfirmation = currentBarrier
      previewCaptureMetadata.clear()
      cameraLockStatus = ModelCameraLockStatus(
        phase = ModelCameraLockPhase.APPLYING,
        aeLocked = null,
        awbLocked = null,
        errorCode = null,
        errorMessage = null,
      )
      dispatchSnapshot(snapshotLocked())
      currentBarrier
    }

    try {
      val confirmed = withTimeout(LOCK_CONFIRMATION_TIMEOUT_MILLIS) {
        cameraSource.setAlgorithmLocks(aeLocked, awbLocked)
        barrier.await()
      }
      synchronized(lock) {
        if (pendingLockConfirmation !== barrier || cameraSessionId != openedCameraSessionId) {
          throw CameraSourceException("CAMERA_INTERRUPTED", "锁确认返回时相机周期已结束。")
        }
        pendingLockConfirmation = null
        captureFrameTimestampAfterLock = if (confirmedPhase == ModelCameraLockPhase.LOCKED) {
          confirmed.timestampFrameNanos
        } else {
          null
        }
        cameraLockStatus = ModelCameraLockStatus(
          phase = confirmedPhase,
          aeLocked = confirmed.aeLocked,
          awbLocked = confirmed.awbLocked,
          errorCode = null,
          errorMessage = null,
        )
        dispatchSnapshot(snapshotLocked())
      }
      return confirmed
    } catch (error: Throwable) {
      val failure = when (error) {
        is TimeoutCancellationException ->
          CameraSourceException("CAMERA_LOCK_CONFIRMATION_TIMEOUT", "在限定时间内未收到匹配的 AE／AWB 锁定结果。", error)
        is CameraSourceException -> error
        is CancellationException -> error
        else -> CameraSourceException("CAMERA_LOCK_CONFIRMATION_FAILED", "AE／AWB 锁确认失败。", error)
      }
      synchronized(lock) {
        if (pendingLockConfirmation === barrier) {
          pendingLockConfirmation = null
          val message = failure.message ?: "AE／AWB 锁确认失败。"
          val code = (failure as? CameraSourceException)?.code ?: "CAMERA_LOCK_CONFIRMATION_FAILED"
          cameraLockStatus = ModelCameraLockStatus(
            phase = ModelCameraLockPhase.FAILED,
            aeLocked = null,
            awbLocked = null,
            errorCode = code,
            errorMessage = message,
          )
          dispatchSnapshot(snapshotLocked())
        }
      }
      throw failure
    }
  }

  /** 失败收尾只释放仍属于指定相机周期的租约。 */
  private suspend fun closeFailedCameraCycle(openedCameraSessionId: String) {
    val pending = synchronized(lock) {
      if (cameraSessionId == openedCameraSessionId) {
        pendingLockConfirmation.also { pendingLockConfirmation = null }
      } else {
        null
      }
    }
    pending?.fail(CameraSourceException("CAMERA_INTERRUPTED", "相机周期失败并已开始清理。"))
    runCatching { cameraSource.close() }
    val lease = synchronized(lock) {
      if (cameraSessionId != openedCameraSessionId) return@synchronized null
      activeSession = null
      captureFrameTimestampAfterLock = null
      previewCaptureMetadata.clear()
      cameraUseLease.also { cameraUseLease = null }
    }
    lease?.close()
  }

  /** 只有当前周期的锁状态经真实结果确认后才创建采集文件和正式窗口。 */
  suspend fun startCapture(): AcquisitionCommandResult = commandMutex.withLock {
    val captureConfiguration = synchronized(lock) {
      if (state != AcquisitionState.PREVIEW) {
        return@withLock commandResult("CAMERA_NOT_READY", "相机预览尚未就绪，无法开始采集。")
      }
      val openedCameraSessionId = cameraSessionId
        ?: return@withLock commandResult("CAMERA_NOT_READY", "当前相机周期标识缺失。")
      val config = cameraConfigSummary?.requestedConfig
        ?: return@withLock commandResult("CAMERA_CONFIGURATION_UNAVAILABLE", "当前相机周期没有冻结配置。")
      openedCameraSessionId to config
    }
    val (openedCameraSessionId, config) = captureConfiguration
    val requestsAeLock = config.exposure.locked
    val requestsAwbLock = config.whiteBalance.locked

    if (requestsAeLock || requestsAwbLock) {
      try {
        applyAndConfirmCameraLocks(
          openedCameraSessionId = openedCameraSessionId,
          aeLocked = requestsAeLock,
          awbLocked = requestsAwbLock,
          expectedAeLocked = if (requestsAeLock) true else null,
          expectedAwbLocked = if (requestsAwbLock) true else null,
          confirmedPhase = ModelCameraLockPhase.LOCKED,
        )
      } catch (error: Throwable) {
        val details = cameraError(error)
        closeFailedCameraCycle(openedCameraSessionId)
        updateSnapshot {
          if (cameraSessionId == openedCameraSessionId) {
            state = AcquisitionState.FAILED
            errorCode = details.first
            errorMessage = details.second
          }
        }
        return@withLock commandResult(details.first, details.second)
      }
    }

    val stillCurrent = synchronized(lock) {
      state == AcquisitionState.PREVIEW && cameraSessionId == openedCameraSessionId
    }
    if (!stillCurrent) {
      closeFailedCameraCycle(openedCameraSessionId)
      return@withLock commandResult("CAMERA_INTERRUPTED", "相机在采集准备期间中断。")
    }

    val newSessionId = UUID.randomUUID().toString()
    val newSession = PPGCaptureSession(
      filesDirectory = applicationContext.filesDir,
      sessionId = newSessionId,
      blockLayout = config.processing,
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
        if (state != AcquisitionState.PREVIEW || cameraSessionId != openedCameraSessionId) {
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
        newSession.fail(PPGCaptureFailure(details.first, details.second))
        runCatching { newSession.stop(SystemClock.elapsedRealtime()) }
        closeFailedCameraCycle(openedCameraSessionId)
        return@withLock commandResult(details.first, details.second)
      }
      bufferedCaptureMetadata.forEach(newSession::offerCaptureMetadata)
      commandResult()
    } catch (error: Throwable) {
      val details = captureError(error)
      closeFailedCameraCycle(openedCameraSessionId)
      updateSnapshot {
        if (cameraSessionId == openedCameraSessionId) {
          state = AcquisitionState.FAILED
          errorCode = details.first
          errorMessage = details.second
        }
      }
      commandResult(details.first, details.second)
    }
  }

  /** 先完成当前文件，再解除所需锁；解锁失败保留产物并关闭相机。 */
  suspend fun stopCapture(): StopCaptureResult = commandMutex.withLock {
    val stopContext = synchronized(lock) {
      val session = activeSession
        ?: return@withLock stopResult(error = "NOT_CAPTURING", message = "当前没有正在采集的会话。")
      val openedCameraSessionId = cameraSessionId
        ?: return@withLock stopResult(error = "CAMERA_NOT_READY", message = "当前相机周期标识缺失。")
      val configSummary = cameraConfigSummary
        ?: return@withLock stopResult(
          error = "CAMERA_CONFIGURATION_UNAVAILABLE",
          message = "当前相机周期没有冻结配置。",
        )
      Triple(session, openedCameraSessionId, configSummary)
    }
    val (session, openedCameraSessionId, configSummary) = stopContext
    val config = configSummary.requestedConfig
    if (!session.isCapturing) {
      val failure = session.terminalFailure
      return@withLock stopResult(
        error = failure?.code ?: "NOT_CAPTURING",
        message = failure?.message ?: "当前没有正在采集的会话。",
      )
    }

    updateSnapshot { state = AcquisitionState.STOPPING }
    val artifact = try {
      session.stop(SystemClock.elapsedRealtime(), configSummary).also(::rememberArtifact)
    } catch (error: Throwable) {
      val details = captureError(error)
      closeFailedCameraCycle(openedCameraSessionId)
      updateSnapshot {
        if (cameraSessionId == openedCameraSessionId) {
          state = AcquisitionState.FAILED
          errorCode = details.first
          errorMessage = details.second
        }
      }
      return@withLock stopResult(error = details.first, message = details.second)
    }
    synchronized(lock) {
      if (activeSession === session) activeSession = null
    }

    if (config.exposure.locked || config.whiteBalance.locked) {
      val releaseResult = releaseLocksAfterCapture(
        artifact = artifact,
        releaseLocks = {
          applyAndConfirmCameraLocks(
            openedCameraSessionId = openedCameraSessionId,
            aeLocked = false,
            awbLocked = false,
            expectedAeLocked = if (config.exposure.locked) false else null,
            expectedAwbLocked = if (config.whiteBalance.locked) false else null,
            confirmedPhase = ModelCameraLockPhase.RELEASED,
          )
        },
        closeFailedCameraCycle = { closeFailedCameraCycle(openedCameraSessionId) },
      )
      releaseResult.error?.let { error ->
        val details = cameraError(error)
        updateSnapshot {
          if (cameraSessionId == openedCameraSessionId) {
            state = AcquisitionState.FAILED
            errorCode = details.first
            errorMessage = details.second
          }
        }
        return@withLock stopResult(
          artifact = releaseResult.artifact,
          error = details.first,
          message = details.second,
        )
      }
    }

    updateSnapshot {
      if (activeSession === session) activeSession = null
      captureFrameTimestampAfterLock = null
      previewCaptureMetadata.clear()
      state = AcquisitionState.PREVIEW
      errorCode = null
      errorMessage = null
    }
    stopResult(artifact = artifact)
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
    val configSummary = synchronized(lock) { cameraConfigSummary }
    if (session != null) {
      try {
        rememberArtifact(session.stop(SystemClock.elapsedRealtime(), configSummary))
      } catch (error: Throwable) {
        closeFailure = captureError(error)
      }
    }
    try {
      cameraSource.close()
    } catch (error: Throwable) {
      if (closeFailure == null) closeFailure = "CAMERA_CLOSE_FAILED" to (error.message ?: "相机资源释放失败。")
    }
    synchronized(lock) { cameraUseLease.also { cameraUseLease = null } }?.close()

    updateSnapshot {
      activeSession = null
      cameraSessionId = null
      cameraConfigSummary = null
      cameraLockStatus = ModelCameraLockStatus(
        phase = ModelCameraLockPhase.NOT_REQUESTED,
        aeLocked = null,
        awbLocked = null,
        errorCode = null,
        errorMessage = null,
      )
      cameraWidth = 0
      cameraHeight = 0
      framesPerSecond = 0.0
      torchAvailable = false
      previewCaptureMetadata.clear()
      latestCameraFrameTimestampNanos = null
      pendingLockConfirmation = null
      captureFrameTimestampAfterLock = null
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
  /** 释放失败或迟到的打开结果所持有的专属令牌。 */
  private fun releaseCameraUseLease(lease: CameraUseLease) {
    synchronized(lock) {
      if (cameraUseLease === lease) cameraUseLease = null
    }
    lease.close()
  }

  private fun createCameraListener(openedSessionId: String) = object : CameraSourceListener {
    override fun onImage(image: ImageProxy) {
      var isCurrentCamera = false
      var discardImage = false
      val session = synchronized(lock) {
        isCurrentCamera = cameraSessionId == openedSessionId
        if (!isCurrentCamera) {
          null
        } else {
          val active = activeSession
          val lockFrameTimestamp = captureFrameTimestampAfterLock
          discardImage = active != null
            && lockFrameTimestamp != null
            && image.imageInfo.timestamp <= lockFrameTimestamp
          active
        }
      }
      if (!isCurrentCamera || discardImage) {
        image.close()
        return
      }
      ppgFrameHandler.handle(image, openedSessionId, session)
    }
    override fun onCaptureMetadata(metadata: CameraFrameMetadata) {
      val session = synchronized(lock) {
        if (cameraSessionId != openedSessionId) {
          null
        } else {
          val frameTimestamp = metadata.timestampFrameNanos
          if (frameTimestamp != null &&
            (latestCameraFrameTimestampNanos == null || frameTimestamp > latestCameraFrameTimestampNanos!!)
          ) {
            latestCameraFrameTimestampNanos = frameTimestamp
          }
          val pending = pendingLockConfirmation
          if (pending != null) {
            pending.offer(openedSessionId, metadata)
            null
          } else {
            val active = activeSession
            val lockFrameTimestamp = captureFrameTimestampAfterLock
            if (
              active == null
              && (state == AcquisitionState.OPENING || state == AcquisitionState.PREVIEW)
              && frameTimestamp != null
              && (lockFrameTimestamp == null || frameTimestamp > lockFrameTimestamp)
            ) {
              if (previewCaptureMetadata.size == PRESTART_CAPTURE_METADATA_CAPACITY) {
                previewCaptureMetadata.removeFirst()
              }
              previewCaptureMetadata.addLast(metadata)
            }
            if (active != null && lockFrameTimestamp != null && frameTimestamp != null &&
              frameTimestamp <= lockFrameTimestamp
            ) {
              null
            } else {
              active
            }
          }
        }
      }
      session?.offerCaptureMetadata(metadata)
    }

    override fun onMetrics(geometry: CameraFrameGeometry, framesPerSecond: Double) {
      updateSnapshot {
        if (cameraSessionId == openedSessionId) {
          cameraWidth = geometry.width.toInt()
          cameraHeight = geometry.height.toInt()
          this@PPGController.framesPerSecond = framesPerSecond
          cameraConfigSummary = cameraConfigSummary?.copy(
            actualFrame = geometry,
            observedFps = framesPerSecond.takeIf { it > 0.0 },
          )
        }
      }
    }

    override fun onInterrupted(code: String, message: String) {
      onCameraInterrupted(openedSessionId, code, message)
    }
  }

  private fun onCoverageHint(value: CoverageHint) {
    updateSnapshot { hint = value }
  }

  private fun onCaptureFailure(sessionId: String, failure: PPGCaptureFailure) {
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
    var pendingBarrier: CameraLockConfirmationBarrier? = null
    val session = synchronized(lock) {
      if (
        cameraSessionId != openedSessionId ||
        state == AcquisitionState.CLOSING ||
        state == AcquisitionState.CLOSED
      ) {
        shouldIgnore = true
        null
      } else {
        pendingBarrier = pendingLockConfirmation
        pendingLockConfirmation = null
        activeSession
      }
    }
    if (shouldIgnore) return

    pendingBarrier?.fail(CameraSourceException(code, message))
    updateSnapshot {
      if (cameraSessionId == openedSessionId && state != AcquisitionState.CLOSING && state != AcquisitionState.CLOSED) {
        state = AcquisitionState.FAILED
        errorCode = code
        errorMessage = message
        cameraLockStatus = ModelCameraLockStatus(
          phase = ModelCameraLockPhase.FAILED,
          aeLocked = null,
          awbLocked = null,
          errorCode = code,
          errorMessage = message,
        )
      }
    }
    session?.fail(PPGCaptureFailure(code, message))
    closeCameraSourceAsync(openedSessionId)
  }

  /** 仅在相机仍属于原错误会话时解绑设备并释放对应租约。 */
  private fun closeCameraSourceAsync(openedSessionId: String) {
    controllerScope.launch {
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
        val lease = synchronized(lock) {
          if (cameraSessionId != openedSessionId) return@synchronized null
          activeSession = null
          pendingLockConfirmation = null
          captureFrameTimestampAfterLock = null
          previewCaptureMetadata.clear()
          cameraUseLease.also { cameraUseLease = null }
        }
        lease?.close()
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
    cameraConfig = cameraConfigSummary?.let { Variant_NullType_CameraConfigSummary.create(it.toNitro()) }
      ?: Variant_NullType_CameraConfigSummary.create(NullType.NULL),
    cameraLockStatus = cameraLockStatus.toNitro(),
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

  private fun rememberArtifact(artifact: PPGArtifact) {
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
    artifact: PPGArtifact? = null,
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

  private fun nullableArtifact(value: PPGArtifact?): Variant_NullType_AcquisitionArtifact =
    if (value == null) Variant_NullType_AcquisitionArtifact.create(NullType.NULL)
    else Variant_NullType_AcquisitionArtifact.create(toNitroArtifact(value))

  private fun toNitroArtifact(value: PPGArtifact) = AcquisitionArtifact(
    sessionId = value.sessionId,
    files = value.files.map { file ->
      AcquisitionArtifactFile(
        kind = when (file.kind) {
          PPGArtifactFileKind.PPG -> AcquisitionArtifactFileKind.PPG
          PPGArtifactFileKind.FRAME -> AcquisitionArtifactFileKind.FRAME
        },
        path = file.path,
        sizeBytes = file.sizeBytes.toDouble(),
      )
    }.toTypedArray(),
    startedAtMillis = value.startedAtMillis.toDouble(),
    finishedAtMillis = value.finishedAtMillis.toDouble(),
    cameraConfigSummary = value.cameraConfigSummary?.let {
      Variant_NullType_CameraConfigSummary.create(it.toNitro())
    } ?: Variant_NullType_CameraConfigSummary.create(NullType.NULL),
  )

  private fun captureError(error: Throwable): Pair<String, String> = when (error) {
    is PPGCaptureFailure -> error.code to (error.message ?: "采集会话失败。")
    else -> "CAPTURE_FAILED" to (error.message ?: "采集会话失败。")
  }

  private fun cameraError(error: Throwable): Pair<String, String> = when (error) {
    is CameraSourceException -> error.code to (error.message ?: "相机无法打开。")
    is CameraConfigFailure -> error.code to (error.message ?: "相机配置不合法。")
    else -> "CAMERA_OPEN_FAILED" to (error.message ?: "相机无法打开。")
  }

  private companion object {
    const val NANOS_PER_MILLISECOND = 1_000_000L
    const val PRESTART_CAPTURE_METADATA_CAPACITY = 64
    const val LOCK_CONFIRMATION_TIMEOUT_MILLIS = 2_000L
  }
}
