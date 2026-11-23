/** 唯一持有一次主动 RPPG 相机会话及其算法、计时和输出资源。 */

package com.healthcvapp.acquisition.rppg.session

import com.healthcvapp.acquisition.camera.CameraFrameMetadata
import com.healthcvapp.acquisition.camera.CameraSourceException
import com.healthcvapp.acquisition.camera.model.CameraCapabilityStatus
import com.healthcvapp.acquisition.camera.model.CameraModeCapability
import com.healthcvapp.acquisition.camera.model.CameraConfig
import com.healthcvapp.acquisition.camera.model.CameraConfigFailure
import com.healthcvapp.acquisition.camera.model.CameraConfigSummary
import com.healthcvapp.acquisition.camera.model.CameraDescriptor
import com.healthcvapp.acquisition.camera.model.CameraExposureConfig
import com.healthcvapp.acquisition.camera.model.CameraExposureMode
import com.healthcvapp.acquisition.camera.model.CameraFocusConfig
import com.healthcvapp.acquisition.camera.model.CameraFocusMode
import com.healthcvapp.acquisition.camera.model.CameraFrameGeometry
import com.healthcvapp.acquisition.camera.model.CameraFacing
import com.healthcvapp.acquisition.camera.model.CameraResolution
import com.healthcvapp.acquisition.camera.model.CameraWhiteBalanceConfig
import com.healthcvapp.acquisition.camera.model.CameraWhiteBalanceMode
import com.healthcvapp.acquisition.camera.ownership.CameraUseGuard
import com.healthcvapp.acquisition.camera.ownership.CameraUseLease
import com.healthcvapp.acquisition.pipeline.DataHubOfferResult
import com.healthcvapp.acquisition.rppg.model.RPPGArtifact
import com.healthcvapp.acquisition.rppg.model.RPPGConfig
import com.healthcvapp.acquisition.rppg.model.RPPGHeartRateWindow
import com.healthcvapp.acquisition.rppg.model.RPPGInstantHeartRate
import com.healthcvapp.acquisition.rppg.model.RPPGSessionDescriptor
import com.healthcvapp.acquisition.rppg.model.RPPGSessionFinalization
import com.healthcvapp.acquisition.rppg.model.RPPGSessionRecord
import com.healthcvapp.acquisition.rppg.model.RPPGSessionSource
import com.healthcvapp.acquisition.rppg.model.RPPGSignalStatus
import com.healthcvapp.acquisition.rppg.model.RPPGTerminationReason
import com.healthcvapp.acquisition.rppg.output.RPPGArtifactStore
import com.healthcvapp.acquisition.rppg.output.RPPGSessionOutput
import com.healthcvapp.acquisition.rppg.realtime.RPPGRealtimeBatch
import com.healthcvapp.acquisition.rppg.realtime.RPPGRealtimeBatchHub
import com.healthcvapp.acquisition.rppg.realtime.RPPGRealtimeBatchSubscription
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext

/** 表示主动 RPPG 会话的可观察阶段。 */
internal enum class RPPGSessionPhase {
  CLOSED,
  OPENING,
  PREVIEW,
  OBSERVING,
  MEASURING,
  STOPPING,
  COMPLETED,
  FAILED,
}

/** 保存可供桥接层稳定显示的错误码和说明。 */
internal data class RPPGSessionFailure(
  /** 稳定的客户端错误分类。 */
  val code: String,
  /** 面向调试和用户提示的错误说明。 */
  val message: String,
)

/** 保存一次主动采集的低频状态、进度原点和最近一次 HR 结果。 */
internal data class RPPGSessionSnapshot(
  /** 当前会话阶段。 */
  val phase: RPPGSessionPhase = RPPGSessionPhase.CLOSED,
  /** 正式结果会话标识；预览期间为空。 */
  val sessionId: String? = null,
  /** 当前人脸就绪状态。 */
  val faceReady: Boolean = false,
  /** 最近一帧的人脸就绪原因。 */
  val readinessReason: String? = null,
  /** 最近报告的人脸连续就绪时长，单位纳秒。 */
  val readinessContinuousNanos: Long = 0L,
  /** 正式测量开始时的 elapsedRealtime 原点，单位纳秒。 */
  val measurementStartedAtElapsedNanos: Long? = null,
  /** 本会话的目标正式测量时长，单位纳秒。 */
  val targetMeasurementDurationNanos: Long = 0L,
  /** 最近一次已评估 HR 窗口；无效窗口的心率字段为空。 */
  val latestHeartRate: RPPGHeartRateWindow? = null,
  /** 最近一个通过逐搏确认的当前心率；失效或会话结束后为空。 */
  val latestInstantHeartRate: RPPGInstantHeartRate? = null,
  /** 正常收尾时由最终记录得出的信号结论。 */
  val signalStatus: RPPGSignalStatus? = null,
  /** 正常结束原因；技术失败单独通过 error 表达。 */
  val termination: RPPGTerminationReason? = null,
  /** 成功发布的完整本地产物；未发布时为空。 */
  val artifact: RPPGArtifact? = null,
  /** 最近一次会话级技术失败。 */
  val error: RPPGSessionFailure? = null,
)

/** 表示一个会话命令被接受或以稳定错误码拒绝。 */
internal data class RPPGSessionOperationResult(
  /** 命令是否已执行。 */
  val accepted: Boolean,
  /** 命令返回时的会话状态。 */
  val snapshot: RPPGSessionSnapshot,
  /** 命令被拒绝或收尾失败时的结构化错误。 */
  val error: RPPGSessionFailure? = null,
) {
  /** 当前命令显式失败优先；仅被拒绝的命令可回退到会话错误，成功不能重抛历史失败。 */
  val commandError: RPPGSessionFailure?
    get() = error ?: if (accepted) null else snapshot.error
}

/** 提供可替换的单调时间和可读墙上时间，信号时间仍取相机传感器时钟。 */
internal interface RPPGSessionClock {
  /** 返回不受墙上时钟调整影响的单调时间，单位纳秒。 */
  fun elapsedRealtimeNanos(): Long

  /** 返回只用于元信息展示的 UTC 时间。 */
  fun wallClockIso8601(): String
}

/** 使用 Android elapsedRealtime 计时并生成 UTC ISO-8601 时间。 */
internal object AndroidRPPGSessionClock : RPPGSessionClock {
  /** 返回 Android 单调运行时间。 */
  override fun elapsedRealtimeNanos(): Long = android.os.SystemClock.elapsedRealtimeNanos()

  /** 以 UTC 毫秒精度格式化可读墙上时间。 */
  override fun wallClockIso8601(): String = SimpleDateFormat(
    "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
    Locale.ROOT,
  ).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date())
}

/** 把相机、连续就绪、计时、算法和完整结果输出收拢到同一资源所有者。 */
internal class RPPGSession(
  private val filesDirectory: File,
  private val config: RPPGConfig,
  private val cameraSourceFactory: () -> RPPGSessionCameraSource,
  private val processorFactory: RPPGSessionProcessorFactory,
  private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
  private val clock: RPPGSessionClock = AndroidRPPGSessionClock,
  private val processorDispatcher: CoroutineDispatcher = Dispatchers.Default,
  private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
  private val recordConsumerDispatcher: CoroutineDispatcher = Dispatchers.IO,
  private val realtimeDispatcher: CoroutineDispatcher = Dispatchers.Default,
  private val outputFactory: (File, RPPGSessionDescriptor, CoroutineDispatcher) -> RPPGSessionOutput =
    { directory, descriptor, dispatcher ->
      RPPGSessionOutput(directory, descriptor, ioDispatcher = dispatcher)
    },
  private val artifactStore: RPPGArtifactStore = RPPGArtifactStore(
    filesDirectory,
    ioDispatcher = ioDispatcher,
  ),
  private val sessionSource: RPPGSessionSource = RPPGSessionSource.ACTIVE,
  private val onFirstFrame: (sessionId: String, elapsedRealtimeNanos: Long) -> Unit = { _, _ -> },
  private val onSnapshot: (RPPGSessionSnapshot) -> Unit = {},
) {
  private val lifecycleMutex = Mutex()
  private val transitionLock = Any()
  private val snapshotRef = AtomicReference(
    RPPGSessionSnapshot(targetMeasurementDurationNanos = config.targetMeasurementDurationNanos),
  )
  private val technicalFailure = AtomicReference<Throwable?>(null)
  private val metricsLock = Any()
  private val realtimeSubscriptions = LinkedHashSet<PendingRealtimeSubscription>()
  private val realtimeLock = Any()
  private val leaseToken = UUID.randomUUID().toString()

  private var cameraSource: RPPGSessionCameraSource? = null
  private var cameraLease: CameraUseLease? = null
  private var currentCameraConfig: CameraConfig? = null
  private var cameraSummary: CameraConfigSummary? = null
  private var lastFrameGeometry: CameraFrameGeometry? = null
  private var lastObservedFps: Double? = null
  private var processor: RPPGSessionProcessor? = null
  private var output: RPPGSessionOutput? = null
  private var outputOpenJob: Job? = null
  private var outputReady: CompletableDeferred<Unit>? = null
  @Volatile private var outputReadySuccess = false
  private var recordDataHub: RPPGSessionRecordDataHub? = null
  private var realtimeBatchHub: RPPGRealtimeBatchHub? = null
  private var observationTimer: Job? = null
  private var measurementTimer: Job? = null
  private var instantHeartRateTimer: Job? = null
  private var lastProcessorInstantHeartRate: RPPGInstantHeartRate? = null
  private var lastInstantHeartRateAtElapsedNanos: Long? = null
  private var instantHeartRateNeedsReset = false
  private var sensorTimeOriginNanos: Long? = null
  private var measurementProcessorStarted = false
  private var pulseSampleCount = 0L
  private var heartRateWindowCount = 0L
  private var validHeartRateWindowCount = 0L
  private var outputCloseAttempted = false
  private var artifact: RPPGArtifact? = null
  private var activeFrameIndex = 0L
  private var firstFrameCallbackDelivered = false

  @Volatile private var activeGeneration = 0L
  @Volatile private var acceptingFrames = false

  /** 当前状态快照；读取不触发相机、模型或文件操作。 */
  val snapshot: RPPGSessionSnapshot
    get() = snapshotRef.get()

  /** 指示失败后是否仍持有相机或无法安全释放的活动资源。 */
  val resourcesReleased: Boolean
    get() = cameraSource == null && cameraLease == null && processor == null

  /** 显式取得相机租约并打开前摄原生预览；此阶段不加载模型或创建产物。 */
  suspend fun openPreview(): RPPGSessionOperationResult = lifecycleMutex.withLock {
    if (snapshot.phase != RPPGSessionPhase.CLOSED) {
      return@withLock rejected("INVALID_STATE", "当前会话阶段不允许打开预览。")
    }
    resetForOpen()
    updateSnapshot {
      RPPGSessionSnapshot(
        phase = RPPGSessionPhase.OPENING,
        targetMeasurementDurationNanos = config.targetMeasurementDurationNanos,
      )
    }

    val lease = CameraUseGuard.tryAcquire(leaseToken)
    if (lease == null) {
      val failure = RPPGSessionFailure("CAMERA_BUSY", "相机正被另一种采集会话使用。")
      val state = updateSnapshot { it.copy(phase = RPPGSessionPhase.FAILED, error = failure) }
      return@withLock RPPGSessionOperationResult(false, state, failure)
    }
    cameraLease = lease

    try {
      val source = cameraSourceFactory()
      cameraSource = source
      val frontCamera = source.listCameras().firstOrNull { it.facing == CameraFacing.FRONT }
        ?: throw RPPGSessionException("FRONT_CAMERA_UNAVAILABLE", "设备没有可用的前置相机。")
      val focusModeCapability = source.getFocusModeCapability(frontCamera.cameraId)
      val cameraConfig = cameraConfig(frontCamera, focusModeCapability)
      currentCameraConfig = cameraConfig
      clearCameraMetrics()
      val generation = activeGeneration + 1L
      activeGeneration = generation
      val summary = source.openPreview(
        config = cameraConfig,
        listener = cameraListener(generation),
        onHostStopped = { requestStop(RPPGTerminationReason.APP_BACKGROUND) },
      )
      updateCameraSummary(summary)
      val state = updateSnapshot { it.copy(phase = RPPGSessionPhase.PREVIEW) }
      acceptingFrames = true
      RPPGSessionOperationResult(true, state)
    } catch (error: CancellationException) {
      withContext(NonCancellable) { cleanupFailedOpen(error) }
      throw error
    } catch (error: Throwable) {
      technicalFailure.compareAndSet(null, error)
      withContext(NonCancellable) { cleanupFailedOpen(error) }
      val failure = toSessionFailure(error)
      val state = updateSnapshot { it.copy(phase = RPPGSessionPhase.FAILED, error = failure) }
      RPPGSessionOperationResult(false, state, failure)
    }
  }

  /** 主动会话在已打开的预览上切换到正式观察帧代次。 */
  suspend fun start(): RPPGSessionOperationResult = lifecycleMutex.withLock {
    if (snapshot.phase != RPPGSessionPhase.PREVIEW) {
      return@withLock rejected("INVALID_STATE", "必须先打开预览，且当前不能重复开始测量。")
    }
    val source = cameraSource ?: return@withLock rejected("CAMERA_NOT_READY", "预览相机已关闭。")
    val cameraConfig = currentCameraConfig
      ?: return@withLock rejected("CAMERA_NOT_READY", "没有已确认的前摄配置。")
    startFormalSession(
      sessionId = UUID.randomUUID().toString(),
      source = source,
      cameraConfig = cameraConfig,
      analysisOnly = false,
    ) { generation ->
      source.replaceFrameGeneration(
        config = cameraConfig,
        listener = cameraListener(generation),
        onHostStopped = { requestStop(RPPGTerminationReason.APP_BACKGROUND) },
      )
    }
  }

  /** 被动会话直接打开分析流，不依赖页面预览或隐藏 Surface。 */
  suspend fun startAnalysisOnly(sessionId: String): RPPGSessionOperationResult = lifecycleMutex.withLock {
    if (snapshot.phase != RPPGSessionPhase.CLOSED) {
      return@withLock rejected("INVALID_STATE", "当前会话阶段不允许开始后台分析。")
    }
    resetForOpen()
    updateSnapshot {
      RPPGSessionSnapshot(
        phase = RPPGSessionPhase.OPENING,
        targetMeasurementDurationNanos = config.targetMeasurementDurationNanos,
      )
    }

    val lease = CameraUseGuard.tryAcquire(leaseToken)
    if (lease == null) {
      val failure = RPPGSessionFailure("CAMERA_BUSY", "相机正被另一种采集会话使用。")
      val state = updateSnapshot { it.copy(phase = RPPGSessionPhase.FAILED, error = failure) }
      return@withLock RPPGSessionOperationResult(false, state, failure)
    }
    cameraLease = lease

    try {
      val source = cameraSourceFactory()
      cameraSource = source
      val frontCamera = source.listCameras().firstOrNull { it.facing == CameraFacing.FRONT }
        ?: throw RPPGSessionException("FRONT_CAMERA_UNAVAILABLE", "设备没有可用的前置相机。")
      val focusModeCapability = source.getFocusModeCapability(frontCamera.cameraId)
      val cameraConfig = cameraConfig(frontCamera, focusModeCapability)
      currentCameraConfig = cameraConfig
      startFormalSession(
        sessionId = sessionId,
        source = source,
        cameraConfig = cameraConfig,
        analysisOnly = true,
      ) { generation ->
        source.openAnalysisOnly(
          config = cameraConfig,
          listener = cameraListener(generation),
          onHostStopped = { requestStop(RPPGTerminationReason.INTERRUPTED) },
        )
      }
    } catch (error: CancellationException) {
      withContext(NonCancellable) { cleanupFailedOpen(error) }
      throw error
    } catch (error: Throwable) {
      technicalFailure.compareAndSet(null, error)
      withContext(NonCancellable) { cleanupFailedOpen(error) }
      val failure = toSessionFailure(error)
      val state = updateSnapshot { it.copy(phase = RPPGSessionPhase.FAILED, error = failure) }
      RPPGSessionOperationResult(false, state, failure)
    }
  }

  /** 共用模型初始化、观察计时和正式帧绑定屏障。 */
  private suspend fun startFormalSession(
    sessionId: String,
    source: RPPGSessionCameraSource,
    cameraConfig: CameraConfig,
    analysisOnly: Boolean,
    bindGeneration: suspend (Long) -> CameraConfigSummary,
  ): RPPGSessionOperationResult {
    val sessionProcessor = try {
      withContext(processorDispatcher) { processorFactory.create(sessionId, config) }
    } catch (error: CancellationException) {
      throw error
    } catch (error: Throwable) {
      val failure = toSessionFailure(error, fallbackCode = "RPPG_MODEL_LOAD_FAILED")
      if (!analysisOnly) return rejected(failure.code, failure.message)
      withContext(NonCancellable) { cleanupFailedStart(error) }
      val state = updateSnapshot { it.copy(phase = RPPGSessionPhase.FAILED, error = failure) }
      return RPPGSessionOperationResult(false, state, failure)
    }

    processor = sessionProcessor
    sensorTimeOriginNanos = null
    output = null
    outputOpenJob = null
    outputReady = null
    outputReadySuccess = false
    recordDataHub = null
    realtimeBatchHub = null
    artifact = null
    pulseSampleCount = 0L
    heartRateWindowCount = 0L
    validHeartRateWindowCount = 0L
    outputCloseAttempted = false
    activeFrameIndex = 0L
    firstFrameCallbackDelivered = false
    technicalFailure.set(null)
    clearCameraMetrics()
    val generation = activeGeneration + 1L
    activeGeneration = generation
    acceptingFrames = false
    val observationStart = clock.elapsedRealtimeNanos()
    updateSnapshot {
      RPPGSessionSnapshot(
        phase = RPPGSessionPhase.OPENING,
        sessionId = sessionId,
        targetMeasurementDurationNanos = config.targetMeasurementDurationNanos,
      )
    }
    observationTimer = scope.launch(start = CoroutineStart.LAZY) {
      delayUntilDeadline(config.observationTimeoutNanos, observationStart)
      stop(RPPGTerminationReason.OBSERVATION_TIMEOUT)
    }.also { it.start() }

    return try {
      val summary = bindGeneration(generation)
      updateCameraSummary(summary)
      val state = updateSnapshot { it.copy(phase = RPPGSessionPhase.OBSERVING) }
      acceptingFrames = true
      RPPGSessionOperationResult(true, state)
    } catch (error: CancellationException) {
      withContext(NonCancellable) { cleanupFailedStart(error) }
      throw error
    } catch (error: Throwable) {
      technicalFailure.compareAndSet(null, error)
      withContext(NonCancellable) { cleanupFailedStart(error) }
      val failure = toSessionFailure(error)
      val state = updateSnapshot { it.copy(phase = RPPGSessionPhase.FAILED, error = failure) }
      RPPGSessionOperationResult(false, state, failure)
    }
  }

  /** 用户、页面或宿主停止时执行同一停止屏障；完成后重复调用不重复发布。 */
  suspend fun stop(reason: RPPGTerminationReason = RPPGTerminationReason.USER_STOP): RPPGSessionOperationResult {
    val callerJob = currentCoroutineContext()[Job]
    return withContext(NonCancellable) {
      lifecycleMutex.withLock {
        stopLocked(reason, technicalFailure.get(), callerJob)
      }
    }
  }
  /** 关闭页面所属会话；仅在全部资源释放后进入 CLOSED。 */
  suspend fun close(): RPPGSessionOperationResult {
    val callerJob = currentCoroutineContext()[Job]
    return withContext(NonCancellable) {
      lifecycleMutex.withLock {
        val result = if (snapshot.phase == RPPGSessionPhase.FAILED && resourcesReleased) {
          // 资源已释放，关闭成功；会话历史错误仍保留在快照中。
          RPPGSessionOperationResult(true, snapshot)
        } else {
          stopLocked(RPPGTerminationReason.PAGE_LEFT, technicalFailure.get(), callerJob)
        }
        if (!resourcesReleased) return@withLock result
        val closed = updateSnapshot { it.copy(phase = RPPGSessionPhase.CLOSED) }
        result.copy(snapshot = closed)
      }
    }
  }

  /** 在会话创建后或首帧到来前订阅独立实时波形，关闭句柄可取消该订阅。 */
  fun subscribeRealtime(consumer: suspend (RPPGRealtimeBatch) -> Unit): AutoCloseable {
    synchronized(realtimeLock) {
      val hub = realtimeBatchHub
      if (hub != null) return hub.subscribe(consumer)
      val pending = PendingRealtimeSubscription(consumer) {
        synchronized(realtimeLock) { realtimeSubscriptions.remove(it) }
      }
      realtimeSubscriptions.add(pending)
      return pending
    }
  }

  /** 只处理当前代次的相机事件；过期回调不能写入新会话。 */
  private fun cameraListener(generation: Long) = object : RPPGSessionCameraListener {
    override fun onFrame(frame: RPPGCameraFrame) {
      if (generation != activeGeneration) return
      try {
        if (!firstFrameCallbackDelivered) {
          firstFrameCallbackDelivered = true
          snapshot.sessionId?.let { onFirstFrame(it, clock.elapsedRealtimeNanos()) }
        }
        if (!acceptingFrames) return
        val phase = snapshot.phase
        if (phase != RPPGSessionPhase.OBSERVING && phase != RPPGSessionPhase.MEASURING) return
        processFrame(frame)
      } catch (error: Throwable) {
        requestTechnicalFailure(error)
      }
    }

    override fun onCaptureMetadata(metadata: CameraFrameMetadata) = Unit

    override fun onMetrics(geometry: CameraFrameGeometry, framesPerSecond: Double) {
      if (generation != activeGeneration) return
      synchronized(metricsLock) {
        lastFrameGeometry = geometry
        lastObservedFps = framesPerSecond
        cameraSummary = cameraSummary?.copy(actualFrame = geometry, observedFps = framesPerSecond)
      }
    }

    override fun onInterrupted(code: String, message: String) {
      if (generation == activeGeneration) {
        requestTechnicalFailure(RPPGSessionException(code, message))
      }
    }
  }

  /** 在新代次首帧确定传感器原点、异步打开文件并推进就绪和信号处理。 */
  private fun processFrame(frame: RPPGCameraFrame) {
    val timestampNanos = frame.sensorTimestampNanos
    if (timestampNanos < 0L) throw RPPGSessionException("INVALID_SENSOR_TIMESTAMP", "相机帧时间戳无效。")
    var sensorOrigin = sensorTimeOriginNanos
    if (sensorOrigin == null) {
      sensorOrigin = timestampNanos
      sensorTimeOriginNanos = sensorOrigin
      beginOutputOpen(sensorOrigin)
    }

    val activeProcessor = processor ?: throw RPPGSessionException("RPPG_PROCESSOR_NOT_READY", "RPPG 处理器尚未就绪。")
    val update = activeProcessor.observe(frame, activeFrameIndex++, sensorOrigin)
    publishReadiness(update)
    var shouldAcceptMeasurementSample = false
    synchronized(transitionLock) {
      if (
        snapshot.phase == RPPGSessionPhase.OBSERVING &&
        update.ready &&
        technicalFailure.get() == null
      ) {
        val measurementStart = clock.elapsedRealtimeNanos()
        observationTimer?.cancel()
        observationTimer = null
        updateSnapshot {
          it.copy(
            phase = RPPGSessionPhase.MEASURING,
            faceReady = true,
            measurementStartedAtElapsedNanos = measurementStart,
          )
        }
        measurementTimer = scope.launch(start = CoroutineStart.LAZY) {
          delayUntilDeadline(config.targetMeasurementDurationNanos, measurementStart)
          stop(RPPGTerminationReason.TARGET_DURATION)
        }.also { it.start() }
        startInstantHeartRateExpiryTimer()
      }
      if (
        snapshot.phase == RPPGSessionPhase.MEASURING &&
        outputReadySuccess &&
        !measurementProcessorStarted
      ) {
        activeProcessor.beginMeasurement()
        measurementProcessorStarted = true
      }
      shouldAcceptMeasurementSample =
        snapshot.phase == RPPGSessionPhase.MEASURING && measurementProcessorStarted
    }

    if (shouldAcceptMeasurementSample) {
      val rgbSample = if (update.ready) update.rgbSample else null
      synchronized(transitionLock) {
        if (instantHeartRateNeedsReset) {
          activeProcessor.resetInstantHeartRate()
          instantHeartRateNeedsReset = false
          lastProcessorInstantHeartRate = null
        }
      }
      activeProcessor.acceptMeasurementSample(timestampNanos, rgbSample, ::offerRecord)
      publishInstantHeartRate(activeProcessor.latestInstantHeartRate)
    }
  }

  /** 仅发布算法真实变更，防止无帧超时后旧结果被后续回调再次显示。 */
  private fun publishInstantHeartRate(value: RPPGInstantHeartRate?) {
    synchronized(transitionLock) {
      if (!acceptingFrames || snapshot.phase != RPPGSessionPhase.MEASURING) return
      if (lastProcessorInstantHeartRate == value) return
      lastProcessorInstantHeartRate = value
      lastInstantHeartRateAtElapsedNanos = if (value != null) clock.elapsedRealtimeNanos() else null
      updateSnapshot { it.copy(latestInstantHeartRate = value) }
    }
  }

  /** 相机完全停帧时也按单调时钟清除过期值，不依赖新的波形点触发。 */
  private fun startInstantHeartRateExpiryTimer() {
    instantHeartRateTimer = scope.launch {
      while (true) {
        delayNanos(minOf(config.beatDetection.resultTimeoutNanos, 250_000_000L))
        synchronized(transitionLock) {
          if (snapshot.phase != RPPGSessionPhase.MEASURING) return@launch
          val lastResultAt = lastInstantHeartRateAtElapsedNanos
          if (lastResultAt != null &&
            clock.elapsedRealtimeNanos() - lastResultAt >= config.beatDetection.resultTimeoutNanos
          ) {
            lastInstantHeartRateAtElapsedNanos = null
            instantHeartRateNeedsReset = true
            updateSnapshot { it.copy(latestInstantHeartRate = null) }
          }
        }
      }
    }
  }

  /** 首帧后在 IO dispatcher 建立结果文件，不把文件操作放进 CameraX 回调。 */
  private fun beginOutputOpen(sensorTimeOrigin: Long) {
    val sessionId = snapshot.sessionId
      ?: throw RPPGSessionException("SESSION_NOT_STARTED", "正式结果会话标识不存在。")
    val summary = synchronized(metricsLock) { cameraSummary }
      ?: throw RPPGSessionException("CAMERA_SUMMARY_UNAVAILABLE", "正式相机配置摘要尚未就绪。")
    val descriptor = RPPGSessionDescriptor(
      schemaVersion = SESSION_SCHEMA_VERSION,
      algorithmVersion = ALGORITHM_VERSION,
      sessionId = sessionId,
      source = sessionSource,
      sensorTimeOriginNanos = sensorTimeOrigin,
      startedAt = clock.wallClockIso8601(),
      config = config,
    )
    val sessionOutput = outputFactory(filesDirectory, descriptor, ioDispatcher)
    val ready = CompletableDeferred<Unit>()
    output = sessionOutput
    outputReady = ready
    outputOpenJob = scope.launch(ioDispatcher) {
      try {
        sessionOutput.open()
        val realtimeHub = RPPGRealtimeBatchHub(
          sessionId = sessionId,
          sensorTimeOriginNanos = sensorTimeOrigin,
          config = config,
          subscriberDispatcher = realtimeDispatcher,
        )
        val dataHub = RPPGSessionRecordDataHub(
          output = sessionOutput,
          consumerDispatcher = recordConsumerDispatcher,
          realtimeBatchHub = realtimeHub,
          onFailure = ::requestTechnicalFailure,
        )
        recordDataHub = dataHub
        synchronized(realtimeLock) {
          this@RPPGSession.realtimeBatchHub = realtimeHub
          val pending = realtimeSubscriptions.toList()
          pending.forEach { it.attach(realtimeHub) }
        }
        outputReadySuccess = true
        ready.complete(Unit)
      } catch (error: Throwable) {
        sessionOutput.fail(error)
        ready.completeExceptionally(error)
        requestTechnicalFailure(error)
      }
    }
  }

  /** 将不可变完整记录先提交有界持久队列，并仅统计已接受的记录。 */
  private fun offerRecord(record: RPPGSessionRecord) {
    val hub = recordDataHub ?: throw RPPGSessionException("RPPG_OUTPUT_NOT_READY", "结果写入队列尚未就绪。")
    val result = hub.offer(record)
    if (result != DataHubOfferResult.ACCEPTED) return
    when (record) {
      is com.healthcvapp.acquisition.rppg.model.RPPGPulseSample -> {
        pulseSampleCount = Math.addExact(pulseSampleCount, 1L)
      }
      is RPPGHeartRateWindow -> {
        heartRateWindowCount = Math.addExact(heartRateWindowCount, 1L)
        if (record.valid) validHeartRateWindowCount = Math.addExact(validHeartRateWindowCount, 1L)
        updateSnapshot { it.copy(latestHeartRate = record) }
      }
      is RPPGInstantHeartRate -> Unit // 逐搏记录不参与频谱质量结论或窗口计数。
    }
  }

  /** 只在就绪原因或状态变化时发布低频人脸状态。 */
  private fun publishReadiness(update: com.healthcvapp.acquisition.rppg.face.FaceReadinessUpdate) {
    val current = snapshot
    val reason = update.reason.name.lowercase(Locale.ROOT)
    if (
      current.faceReady != update.ready ||
      current.readinessReason != reason ||
      current.readinessContinuousNanos != update.continuousNanos
    ) {
      updateSnapshot {
        it.copy(
          faceReady = update.ready,
          readinessReason = reason,
          readinessContinuousNanos = update.continuousNanos,
        )
      }
    }
  }

  /** 关闭相机及预览阶段资源；没有正式首帧时不创建或发布结果目录。 */
  private suspend fun stopLocked(
    requestedReason: RPPGTerminationReason,
    initialFailure: Throwable?,
    callerJob: Job?,
  ): RPPGSessionOperationResult {
    val current = snapshot
    if (current.phase == RPPGSessionPhase.CLOSED) return RPPGSessionOperationResult(true, current)
    if (current.phase == RPPGSessionPhase.COMPLETED && resourcesReleased) {
      return RPPGSessionOperationResult(true, current)
    }
    if (current.phase == RPPGSessionPhase.FAILED && resourcesReleased) {
      return RPPGSessionOperationResult(false, current, current.error)
    }
    if (requestedReason == RPPGTerminationReason.OBSERVATION_TIMEOUT &&
      current.phase != RPPGSessionPhase.OBSERVING &&
      current.phase != RPPGSessionPhase.OPENING
    ) {
      return RPPGSessionOperationResult(true, current)
    }

    val hasFormalSession = current.sessionId != null
    synchronized(transitionLock) {
      updateSnapshot { it.copy(phase = RPPGSessionPhase.STOPPING, latestInstantHeartRate = null) }
      acceptingFrames = false
      activeGeneration += 1L
      cancelTimer(observationTimer, callerJob)
      cancelTimer(measurementTimer, callerJob)
      cancelTimer(instantHeartRateTimer, callerJob)
      observationTimer = null
      measurementTimer = null
      instantHeartRateTimer = null
      lastProcessorInstantHeartRate = null
      lastInstantHeartRateAtElapsedNanos = null
      instantHeartRateNeedsReset = false
    }

    var failure = initialFailure ?: technicalFailure.get()
    var sourceClosed = cameraSource == null
    val source = cameraSource
    if (source != null) {
      try {
        source.close()
        cameraSource = null
        sourceClosed = true
      } catch (error: Throwable) {
        failure = failure ?: error
      }
    }
    if (sourceClosed) failure = failure ?: technicalFailure.get()
    if (!sourceClosed) {
      val closeFailure = failure ?: RPPGSessionException("CAMERA_CLOSE_FAILED", "相机关闭屏障未完成。")
      failure = closeFailure
      technicalFailure.compareAndSet(null, closeFailure)
      markOutputFailed(closeFailure)
      val mapped = toSessionFailure(closeFailure)
      val failed = updateSnapshot { it.copy(phase = RPPGSessionPhase.FAILED, error = mapped) }
      return RPPGSessionOperationResult(false, failed, mapped)
    }

    val activeProcessor = processor
    if (activeProcessor != null) {
      try {
        activeProcessor.finishMeasurement()
      } catch (error: Throwable) {
        failure = failure ?: error
      }
      try {
        activeProcessor.close()
        processor = null
      } catch (error: Throwable) {
        failure = failure ?: error
      }
    }

    val openingJob = outputOpenJob
    if (openingJob != null) {
      try {
        openingJob.join()
        outputReady?.await()
      } catch (error: Throwable) {
        failure = failure ?: error
      }
    }
    if (hasFormalSession && sensorTimeOriginNanos == null) {
      failure = failure ?: RPPGSessionException("NO_CAMERA_FRAMES", "正式会话没有收到可用的相机帧。")
    }

    val dataHub = recordDataHub
    if (failure != null) dataHub?.fail(failure)
    if (dataHub != null) {
      try {
        dataHub.closeAndDrain()
      } catch (error: Throwable) {
        failure = failure ?: error
      }
      failure = failure ?: dataHub.failure
    }

    val currentOutput = output
    var finalSignalStatus: RPPGSignalStatus? = null
    if (hasFormalSession && sensorTimeOriginNanos != null) {
      finalSignalStatus = when {
        validHeartRateWindowCount > 0L -> RPPGSignalStatus.VALID_HEART_RATE
        pulseSampleCount > 0L || heartRateWindowCount > 0L -> RPPGSignalStatus.NO_VALID_HEART_RATE
        else -> RPPGSignalStatus.NO_WAVEFORM
      }
    }
    val finalization = finalSignalStatus?.let { signalStatus ->
      val summary = synchronized(metricsLock) { cameraSummary }
      if (summary == null) {
        failure = failure ?: RPPGSessionException("CAMERA_SUMMARY_UNAVAILABLE", "缺少最终相机摘要。")
      }
      RPPGSessionFinalization(
        finishedAt = clock.wallClockIso8601(),
        termination = requestedReason,
        signalStatus = signalStatus,
        cameraSummary = summary ?: fallbackCameraSummary(),
      )
    }

    if (currentOutput != null && finalization != null && !outputCloseAttempted) {
      outputCloseAttempted = true
      if (failure != null) currentOutput.fail(failure)
      try {
        currentOutput.close(finalization)
      } catch (error: Throwable) {
        failure = failure ?: error
      }
      if (failure == null) {
        try {
          artifact = withContext(ioDispatcher) {
            artifactStore.publish(checkNotNull(snapshot.sessionId))
          }
        } catch (error: Throwable) {
          failure = error
        }
      }
    }

    val lease = cameraLease
    if (lease != null) {
      lease.close()
      cameraLease = null
    }
    closePendingRealtimeSubscriptions()

    if (failure != null) {
      technicalFailure.compareAndSet(null, failure)
      markOutputFailed(failure)
      val mapped = toSessionFailure(failure)
      val failed = updateSnapshot {
        it.copy(
          phase = RPPGSessionPhase.FAILED,
          signalStatus = null,
          termination = null,
          artifact = null,
          error = mapped,
        )
      }
      return RPPGSessionOperationResult(false, failed, mapped)
    }

    val terminalPhase = if (hasFormalSession) RPPGSessionPhase.COMPLETED else RPPGSessionPhase.CLOSED
    val completed = updateSnapshot {
      it.copy(
        phase = terminalPhase,
        signalStatus = finalSignalStatus,
        termination = requestedReason.takeIf { hasFormalSession },
        artifact = artifact,
        error = null,
      )
    }
    return RPPGSessionOperationResult(true, completed)
  }

  /** 首个结果文件失败后阻止 session.json 被定稿或完整结果被发布。 */
  private fun markOutputFailed(cause: Throwable) {
    output?.fail(cause)
    recordDataHub?.fail(cause)
  }

  /** 清理预览打开失败的半成品；关闭失败时保留租约以免误放相机。 */
  private suspend fun cleanupFailedOpen(originalError: Throwable) {
    acceptingFrames = false
    activeGeneration += 1L
    val source = cameraSource
    if (source != null) {
      try {
        source.close()
        cameraSource = null
        cameraLease?.close()
        cameraLease = null
      } catch (closeError: Throwable) {
        originalError.addSuppressed(closeError)
      }
    } else {
      cameraLease?.close()
      cameraLease = null
    }
  }

  /** 清理正式帧代次切换失败的模型和相机，且不生成空会话文件。 */
  private suspend fun cleanupFailedStart(originalError: Throwable) {
    acceptingFrames = false
    activeGeneration += 1L
    observationTimer?.cancel()
    observationTimer = null
    val source = cameraSource
    if (source != null) {
      try {
        source.close()
        cameraSource = null
        cameraLease?.close()
        cameraLease = null
      } catch (closeError: Throwable) {
        originalError.addSuppressed(closeError)
      }
    }
    try {
      processor?.close()
      processor = null
    } catch (closeError: Throwable) {
      originalError.addSuppressed(closeError)
    }
  }


  /** 将首帧文件初始化移到控制协程，并向等待关闭的任务暴露完成屏障。 */
  private fun requestStop(reason: RPPGTerminationReason) {
    scope.launch { stop(reason) }
  }

  /** 立即关闭帧入口，再排队统一的技术失败收尾。 */
  private fun requestTechnicalFailure(error: Throwable) {
    technicalFailure.compareAndSet(null, error)
    synchronized(transitionLock) { acceptingFrames = false }
    scope.launch { stop(RPPGTerminationReason.USER_STOP) }
  }

  /** 将相机帧几何与 FPS 合并到正式相机摘要；预览指标不会跨入正式会话。 */
  private fun updateCameraSummary(summary: CameraConfigSummary) {
    synchronized(metricsLock) {
      cameraSummary = summary.copy(
        actualFrame = lastFrameGeometry ?: summary.actualFrame,
        observedFps = lastObservedFps ?: summary.observedFps,
      )
    }
  }

  /** 清空上一相机代次留下的帧几何和观测 FPS。 */
  private fun clearCameraMetrics() {
    synchronized(metricsLock) {
      cameraSummary = null
      lastFrameGeometry = null
      lastObservedFps = null
    }
  }

  /** 将冻结的 RPPG 相机请求转换为现有共享相机配置。 */
  private fun cameraConfig(
    camera: CameraDescriptor,
    focusModeCapability: CameraModeCapability,
  ): CameraConfig {
    if (!config.cameraExposureAuto) {
      throw RPPGSessionException("INVALID_RPPG_CONFIG", "当前 RPPG 配置没有手动曝光参数。")
    }
    return CameraConfig(
      cameraId = camera.cameraId,
      targetResolution = CameraResolution(
        config.preferredCameraWidthPx.toDouble(),
        config.preferredCameraHeightPx.toDouble(),
      ),
      targetFps = config.preferredCameraFps,
      torchEnabled = config.cameraTorchEnabled,
      exposure = CameraExposureConfig(
        mode = CameraExposureMode.AUTO,
        compensationIndex = 0.0,
        timeNanos = null,
        iso = null,
        locked = config.cameraExposureLocked,
      ),
      whiteBalance = CameraWhiteBalanceConfig(
        mode = if (config.cameraWhiteBalanceAuto) CameraWhiteBalanceMode.AUTO else CameraWhiteBalanceMode.OFF,
        locked = config.cameraWhiteBalanceLocked,
      ),
      focus = CameraFocusConfig(
        mode = selectFocusMode(focusModeCapability),
        distanceDiopters = null,
      ),
    )
  }

  /** 仅在设备明确报告支持时回退到固定焦点，避免误判未知能力。 */
  private fun selectFocusMode(focusModeCapability: CameraModeCapability): CameraFocusMode {
    if (!config.cameraFocusAuto) return CameraFocusMode.OFF
    if (focusModeCapability.status != CameraCapabilityStatus.SUPPORTED) {
      return CameraFocusMode.AUTO
    }

    val modes = focusModeCapability.modes.orEmpty()
    return when {
      CameraFocusMode.AUTO.wireValue in modes -> CameraFocusMode.AUTO
      CameraFocusMode.OFF.wireValue in modes -> CameraFocusMode.OFF
      else -> CameraFocusMode.AUTO
    }
  }


  /** 等待至 elapsedRealtime 截止点；唤醒后按单调时钟重算剩余时间。 */
  private suspend fun delayUntilDeadline(durationNanos: Long, startNanos: Long) {
    while (true) {
      val remaining = remainingNanos(durationNanos, startNanos)
      if (remaining <= 0L) return
      delayNanos(remaining)
    }
  }
  /** 等待指定纳秒时长并向上取整到协程调度器的毫秒精度。 */
  private suspend fun delayNanos(nanos: Long) {
    if (nanos <= 0L) return
    val millis = nanos / NANOS_PER_MILLISECOND + if (nanos % NANOS_PER_MILLISECOND == 0L) 0L else 1L
    delay(millis)
  }

  /** 计算单调截止点尚未消耗的时间。 */
  private fun remainingNanos(durationNanos: Long, startNanos: Long): Long {
    val elapsed = (clock.elapsedRealtimeNanos() - startNanos).coerceAtLeast(0L)
    return if (elapsed >= durationNanos) 0L else durationNanos - elapsed
  }

  /** 取消除当前停止协程外的测量计时任务。 */
  private fun cancelTimer(timer: Job?, callerJob: Job?) {
    if (timer != null && timer !== callerJob) timer.cancel()
  }

  /** 重置已完全关闭会话的短期状态，允许显式重新打开预览。 */
  private fun resetForOpen() {
    cameraLease = null
    currentCameraConfig = null
    cameraSummary = null
    lastFrameGeometry = null
    lastObservedFps = null
    processor = null
    output = null
    outputOpenJob = null
    outputReadySuccess = false
    measurementProcessorStarted = false
    outputReady = null
    recordDataHub = null
    realtimeBatchHub = null
    observationTimer = null
    measurementTimer = null
    instantHeartRateTimer = null
    lastProcessorInstantHeartRate = null
    lastInstantHeartRateAtElapsedNanos = null
    instantHeartRateNeedsReset = false
    sensorTimeOriginNanos = null
    pulseSampleCount = 0L
    heartRateWindowCount = 0L
    validHeartRateWindowCount = 0L
    outputCloseAttempted = false
    artifact = null
    activeFrameIndex = 0L
    technicalFailure.set(null)
    closePendingRealtimeSubscriptions()
  }
  /** 为失败收尾补充有限摘要；该摘要只用于关闭文件，失败会阻止完整发布。 */
  private fun fallbackCameraSummary(): CameraConfigSummary {
    val requested = currentCameraConfig
      ?: throw RPPGSessionException("CAMERA_SUMMARY_UNAVAILABLE", "没有可用于收尾的相机请求。")
    return CameraConfigSummary(
      cameraId = requested.cameraId,
      requestedConfig = requested,
      submittedConfig = requested,
      adjustments = emptyList(),
      actualFrame = null,
      observedFps = null,
    )
  }

  /** 更新状态并通知低频观察者；观察者异常不能破坏资源状态机。 */
  private fun updateSnapshot(transform: (RPPGSessionSnapshot) -> RPPGSessionSnapshot): RPPGSessionSnapshot {
    val updated = snapshotRef.updateAndGet(transform)
    try {
      onSnapshot(updated)
    } catch (_: Throwable) {
      // 状态观察者不是会话资源所有者。
    }
    return updated
  }

  /** 返回不改变当前阶段的命令错误。 */
  private fun rejected(code: String, message: String): RPPGSessionOperationResult {
    val failure = RPPGSessionFailure(code, message)
    return RPPGSessionOperationResult(false, snapshot, failure)
  }

  /** 将已记录的异常转换为稳定错误码和说明。 */
  private fun toSessionFailure(error: Throwable, fallbackCode: String = "SESSION_PROCESSING_FAILED") = when (error) {
    is RPPGSessionException -> RPPGSessionFailure(error.code, error.message ?: fallbackCode)
    is CameraSourceException -> RPPGSessionFailure(error.code, error.message ?: "相机周期失败。")
    is CameraConfigFailure -> RPPGSessionFailure(error.code, error.message ?: "相机参数不受支持。")
    is RPPGRecordPipelineFailure -> RPPGSessionFailure(error.code, error.message ?: "完整结果写入失败。")
    else -> RPPGSessionFailure(fallbackCode, error.message ?: "主动 RPPG 会话处理失败。")
  }

  /** 关闭尚未成功附着到批次中心的订阅。 */
  private fun closePendingRealtimeSubscriptions() {
    val pending = synchronized(realtimeLock) {
      realtimeSubscriptions.toList().also { realtimeSubscriptions.clear() }
    }
    pending.forEach(AutoCloseable::close)
  }

  /** 提交文件写入期间尚未分配批次中心的独立订阅。 */
  private class PendingRealtimeSubscription(
    private val consumer: suspend (RPPGRealtimeBatch) -> Unit,
    private val remove: (PendingRealtimeSubscription) -> Unit,
  ) : AutoCloseable {
    private val monitor = Any()
    private var closed = false
    private var delegate: RPPGRealtimeBatchSubscription? = null

    /** 在批次中心创建后连接此订阅；已取消句柄不会复活。 */
    fun attach(hub: RPPGRealtimeBatchHub) {
      synchronized(monitor) {
        if (closed || delegate != null) return
        delegate = hub.subscribe(consumer)
      }
    }

    /** 幂等解除待处理或已附着的展示队列。 */
    override fun close() {
      val active = synchronized(monitor) {
        if (closed) return
        closed = true
        delegate.also { delegate = null }
      }
      remove(this)
      active?.close()
    }
  }

  private companion object {
    const val SESSION_SCHEMA_VERSION = "rppg-session-v2"
    const val ALGORITHM_VERSION = "rppg-active-v1"
    const val NANOS_PER_MILLISECOND = 1_000_000L
  }
}

/** 表示主动 RPPG 创建或处理期间的稳定技术异常。 */
private class RPPGSessionException(
  val code: String,
  message: String,
  cause: Throwable? = null,
) : IllegalStateException(message, cause)
