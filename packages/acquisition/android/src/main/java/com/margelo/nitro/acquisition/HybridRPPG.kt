/** 连接主动 RPPG 命令、有界订阅及 React 宿主后台和销毁事件。 */

package com.margelo.nitro.acquisition

import android.os.SystemClock
import androidx.lifecycle.LifecycleOwner
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactContext
import com.healthcvapp.acquisition.rppg.model.RPPGArtifact as ModelRPPGArtifact
import com.healthcvapp.acquisition.rppg.model.RPPGHeartRateWindow as ModelRPPGHeartRateWindow
import com.healthcvapp.acquisition.rppg.model.RPPGSignalStatus as ModelRPPGSignalStatus
import com.healthcvapp.acquisition.rppg.model.RPPGTerminationReason as ModelRPPGTerminationReason
import com.healthcvapp.acquisition.rppg.output.RPPGArtifactStore
import com.healthcvapp.acquisition.rppg.realtime.RPPGRealtimeBatch as ModelRPPGRealtimeBatch
import com.healthcvapp.acquisition.rppg.runtime.AndroidRPPGActiveSessionFactory
import com.healthcvapp.acquisition.rppg.runtime.RPPGActiveRuntime
import com.healthcvapp.acquisition.rppg.runtime.RPPGPreviewRegistry
import com.healthcvapp.acquisition.rppg.session.RPPGSessionFailure as ModelRPPGSessionFailure
import com.healthcvapp.acquisition.rppg.session.RPPGSessionOperationResult
import com.healthcvapp.acquisition.rppg.session.RPPGSessionPhase as ModelRPPGSessionPhase
import com.healthcvapp.acquisition.rppg.session.RPPGSessionSnapshot as ModelRPPGSessionSnapshot
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.NullType
import com.margelo.nitro.core.Promise
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/** 暴露主动预览、测量、低频状态及完整本地产物查询。 */
class HybridRPPG : HybridRPPGSpec(), LifecycleEventListener {
  private val reactContext = checkNotNull(NitroModules.applicationContext) {
    "Nitro ReactApplicationContext is unavailable"
  } as? ReactContext ?: throw IllegalStateException("主动 RPPG 需要 ReactContext。")
  private val artifactStore = RPPGArtifactStore(reactContext.filesDir)
  private val listenerIds = AtomicLong(1L)
  private val snapshotListeners = ConcurrentHashMap<Double, (RPPGSnapshot) -> Unit>()
  private val realtimeSubscriptions = ConcurrentHashMap<Double, AutoCloseable>()
  private val snapshotDispatchLock = Any()
  private var lastPublishedSnapshot: ModelRPPGSessionSnapshot? = null
  private var lastPublishedAtNanos = 0L
  private val runtime = RPPGActiveRuntime(
    sessionFactory = AndroidRPPGActiveSessionFactory(
      context = reactContext,
      previewViewProvider = RPPGPreviewRegistry::current,
      lifecycleOwnerProvider = { reactContext.currentActivity as? LifecycleOwner },
      filesDirectory = reactContext.filesDir,
    ),
    onSnapshot = ::publishSnapshot,
  )

  init {
    reactContext.addLifecycleEventListener(this)
  }

  /** 恢复前台只等待用户显式开始，不自动重启已经终止的会话。 */
  override fun onHostResume() = Unit

  /** React 宿主暂停即结束本对象的主动会话，不影响独立采集所有者。 */
  override fun onHostPause() {
    runtime.onHostPause()
  }

  /** 销毁时先解除宿主监听，再由 runtime 完成相机及文件关闭。 */
  override fun onHostDestroy() {
    reactContext.removeLifecycleEventListener(this)
    runtime.onHostDestroy()
  }

  /** 返回当前会话快照，不触发相机或文件副作用。 */
  override fun getSnapshot(): RPPGSnapshot = runtime.snapshot.toNitro()

  /** 显式取得相机租约并打开原生前摄预览。 */
  override fun openPreview(): Promise<RPPGCommandResult> = Promise.async {
    runtime.openPreview().toNitro()
  }

  /** 显式开始正式观察；模型仅由该命令创建。 */
  override fun start(): Promise<RPPGCommandResult> = Promise.async {
    runtime.start().toNitro()
  }

  /** 用户停止并等待相机、算法和完整记录队列收尾。 */
  override fun stop(): Promise<RPPGCommandResult> = Promise.async {
    runtime.stop().toNitro()
  }

  /** 页面离开时等待本 runtime 的相机和产物屏障关闭。 */
  override fun close(): Promise<RPPGCommandResult> = Promise.async {
    val result = runtime.close()
    if (result.snapshot.phase == ModelRPPGSessionPhase.CLOSED) {
      reactContext.removeLifecycleEventListener(this@HybridRPPG)
    }
    result.toNitro()
  }

  /** 查询应用私有目录中已经发布的主动 RPPG 三件套。 */
  override fun listArtifacts(): Promise<Array<RPPGArtifact>> = Promise.async {
    artifactStore.listArtifacts().map { it.toNitro() }.toTypedArray()
  }

  /** 注册低频状态订阅，并立即返回当前权威快照。 */
  override fun addListener(listener: (snapshot: RPPGSnapshot) -> Unit): Double {
    val id = listenerIds.getAndIncrement().toDouble()
    snapshotListeners[id] = listener
    notifySafely(listener, runtime.snapshot.toNitro())
    return id
  }

  /** 只移除指定页面的状态订阅。 */
  override fun removeListener(listenerId: Double) {
    snapshotListeners.remove(listenerId)
  }

  /** 注册独立有限队列的实时波形订阅。 */
  override fun addRealtimeListener(listener: (batch: RPPGRealtimeBatch) -> Unit): Double {
    val id = listenerIds.getAndIncrement().toDouble()
    realtimeSubscriptions[id] = runtime.subscribeRealtime { batch ->
      listener(batch.toNitro())
    }
    return id
  }

  /** 解除单个波形订阅，不影响算法或完整文件输出。 */
  override fun removeRealtimeListener(listenerId: Double) {
    realtimeSubscriptions.remove(listenerId)?.close()
  }

  /** 合并逐帧就绪进度，只把状态变化和有限频率进度发送给 JS。 */
  private fun publishSnapshot(snapshot: ModelRPPGSessionSnapshot) {
    val now = SystemClock.elapsedRealtimeNanos()
    val shouldPublish = synchronized(snapshotDispatchLock) {
      val previous = lastPublishedSnapshot
      val urgentChange = previous == null ||
        previous.phase != snapshot.phase ||
        previous.sessionId != snapshot.sessionId ||
        previous.faceReady != snapshot.faceReady ||
        previous.latestHeartRate != snapshot.latestHeartRate ||
        previous.latestInstantHeartRate != snapshot.latestInstantHeartRate ||
        previous.signalStatus != snapshot.signalStatus ||
        previous.termination != snapshot.termination ||
        previous.artifact != snapshot.artifact ||
        previous.error != snapshot.error
      if (!urgentChange && now - lastPublishedAtNanos < SNAPSHOT_PROGRESS_INTERVAL_NANOS) {
        false
      } else {
        lastPublishedSnapshot = snapshot
        lastPublishedAtNanos = now
        true
      }
    }
    if (!shouldPublish) return

    val nitroSnapshot = snapshot.toNitro()
    snapshotListeners.values.forEach { listener -> notifySafely(listener, nitroSnapshot) }
  }

  /** 隔离 JavaScript 订阅者异常，避免影响会话资源所有权。 */
  private fun notifySafely(listener: (RPPGSnapshot) -> Unit, snapshot: RPPGSnapshot) {
    try {
      listener(snapshot)
    } catch (_: Throwable) {
      // 页面观察者失败不改变原生会话与文件输出。
    }
  }

  /** 转换会话命令结果并保留失败时的权威错误状态。 */
  private fun RPPGSessionOperationResult.toNitro(): RPPGCommandResult {
    val failure = commandError
    return RPPGCommandResult(
      accepted = accepted,
      snapshot = snapshot.toNitro(),
      artifact = snapshot.artifact.toNitroNullable(),
      errorCode = failure?.code.toNitroNullable(),
      errorMessage = failure?.message.toNitroNullable(),
    )
  }

  /** 转换会话状态并将纳秒 Long 保留为十进制字符串。 */
  private fun ModelRPPGSessionSnapshot.toNitro() = RPPGSnapshot(
    phase = phase.toNitro(),
    sessionId = sessionId.toNitroNullable(),
    faceReady = faceReady,
    readinessReason = readinessReason.toNitroNullable(),
    readinessContinuousNanos = readinessContinuousNanos.toString(),
    measurementStartedAtElapsedNanos = measurementStartedAtElapsedNanos?.toString().toNitroNullable(),
    targetMeasurementDurationNanos = targetMeasurementDurationNanos.toString(),
    latestHeartRate = latestHeartRate.toNitroNullable(),
    latestInstantHeartRate = RPPGInstantHeartRateNitroMapper.toNitro(latestInstantHeartRate),
    signalStatus = signalStatus?.toNitro(),
    termination = termination?.toNitro(),
    artifact = artifact.toNitroNullable(),
    error = error.toNitroNullable(),
  )

  /** 通过共用映射器转换会话摘要和三份文件引用。 */
  private fun ModelRPPGArtifact.toNitro() = RPPGArtifactNitroMapper.toNitro(this)

  /** 转换已评估 HR 窗口，绝对传感器纳秒继续使用字符串。 */
  private fun ModelRPPGHeartRateWindow.toNitro() = RPPGHeartRateWindow(
    segmentIndex = segmentIndex.toDouble(),
    windowStartNanos = windowStartNanos.toString(),
    windowEndNanos = windowEndNanos.toString(),
    heartRateBpm = heartRateBpm.toNitroNullable(),
    valid = valid,
    reason = reason.toNitroNullable(),
    spectralSnrDb = spectralSnrDb.toNitroNullable(),
  )

  /** 转换同源实时批次；批次索引保持为小整数，幅值仅发送展示样本。 */
  private fun ModelRPPGRealtimeBatch.toNitro() = RPPGRealtimeBatch(
    sessionId = sessionId,
    segmentIndex = segmentIndex.toDouble(),
    sequence = sequence.toDouble(),
    startTimeMs = startTimeMs,
    sampleIntervalMs = sampleIntervalMs,
    values = values.toDoubleArray(),
  )

  /** 转换会话阶段枚举。 */
  private fun ModelRPPGSessionPhase.toNitro(): RPPGPhase = when (this) {
    ModelRPPGSessionPhase.CLOSED -> RPPGPhase.CLOSED
    ModelRPPGSessionPhase.OPENING -> RPPGPhase.OPENING
    ModelRPPGSessionPhase.PREVIEW -> RPPGPhase.PREVIEW
    ModelRPPGSessionPhase.OBSERVING -> RPPGPhase.OBSERVING
    ModelRPPGSessionPhase.MEASURING -> RPPGPhase.MEASURING
    ModelRPPGSessionPhase.STOPPING -> RPPGPhase.STOPPING
    ModelRPPGSessionPhase.COMPLETED -> RPPGPhase.COMPLETED
    ModelRPPGSessionPhase.FAILED -> RPPGPhase.FAILED
  }

  /** 转换合法会话结束原因。 */
  private fun ModelRPPGTerminationReason.toNitro(): RPPGTerminationReason = when (this) {
    ModelRPPGTerminationReason.TARGET_DURATION -> RPPGTerminationReason.TARGET_DURATION
    ModelRPPGTerminationReason.USER_STOP -> RPPGTerminationReason.USER_STOP
    ModelRPPGTerminationReason.PAGE_LEFT -> RPPGTerminationReason.PAGE_LEFT
    ModelRPPGTerminationReason.APP_BACKGROUND -> RPPGTerminationReason.APP_BACKGROUND
    ModelRPPGTerminationReason.OBSERVATION_TIMEOUT -> RPPGTerminationReason.OBSERVATION_TIMEOUT
    ModelRPPGTerminationReason.INTERRUPTED -> RPPGTerminationReason.INTERRUPTED
  }

  /** 转换最终信号结论。 */
  private fun ModelRPPGSignalStatus.toNitro(): RPPGSignalStatus = when (this) {
    ModelRPPGSignalStatus.VALID_HEART_RATE -> RPPGSignalStatus.VALID_HEART_RATE
    ModelRPPGSignalStatus.NO_VALID_HEART_RATE -> RPPGSignalStatus.NO_VALID_HEART_RATE
    ModelRPPGSignalStatus.NO_WAVEFORM -> RPPGSignalStatus.NO_WAVEFORM
  }


  /** 将可空字符串转换为 Nitro 显式 null 联合。 */
  private fun String?.toNitroNullable(): Variant_NullType_String = this?.let {
    Variant_NullType_String.create(it)
  } ?: Variant_NullType_String.create(NullType.NULL)

  /** 将可空数值转换为 Nitro 显式 null 联合。 */
  private fun Double?.toNitroNullable(): Variant_NullType_Double = this?.let {
    Variant_NullType_Double.create(it)
  } ?: Variant_NullType_Double.create(NullType.NULL)

  /** 将错误结构转换为 Nitro 显式 null 联合。 */
  private fun ModelRPPGSessionFailure?.toNitroNullable(): Variant_NullType_RPPGFailure = this?.let {
    Variant_NullType_RPPGFailure.create(RPPGFailure(code = it.code, message = it.message))
  } ?: Variant_NullType_RPPGFailure.create(NullType.NULL)

  /** 将心率窗口转换为 Nitro 显式 null 联合。 */
  private fun ModelRPPGHeartRateWindow?.toNitroNullable(): Variant_NullType_RPPGHeartRateWindow = this?.let {
    Variant_NullType_RPPGHeartRateWindow.create(it.toNitro())
  } ?: Variant_NullType_RPPGHeartRateWindow.create(NullType.NULL)

  /** 将完整产物转换为 Nitro 显式 null 联合。 */
  private fun ModelRPPGArtifact?.toNitroNullable(): Variant_NullType_RPPGArtifact = this?.let {
    Variant_NullType_RPPGArtifact.create(it.toNitro())
  } ?: Variant_NullType_RPPGArtifact.create(NullType.NULL)

  private companion object {
    const val SNAPSHOT_PROGRESS_INTERVAL_NANOS = 250_000_000L
  }
}
