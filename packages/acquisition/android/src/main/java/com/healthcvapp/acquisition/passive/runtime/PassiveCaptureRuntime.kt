/** 管理应用级被动服务、正式测量配置和低频真实运行状态。 */

package com.healthcvapp.acquisition.passive.runtime

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.healthcvapp.acquisition.passive.output.PassiveVideoArtifactStore
import com.healthcvapp.acquisition.passive.service.PassiveCaptureNotifications
import com.healthcvapp.acquisition.passive.service.PassiveCaptureService
import com.healthcvapp.acquisition.rppg.model.RPPGArtifact
import com.healthcvapp.acquisition.rppg.model.RPPGConfig
import com.healthcvapp.acquisition.rppg.model.RPPGInstantHeartRate
import com.healthcvapp.acquisition.rppg.model.RPPGSessionSource
import com.healthcvapp.acquisition.rppg.output.RPPGArtifactStore
import com.healthcvapp.acquisition.storage.acquisitionFilesDirectory
import com.margelo.nitro.acquisition.BuildConfig
import com.margelo.nitro.acquisition.PassiveCaptureCommandResult
import com.margelo.nitro.acquisition.PassiveCaptureConfig
import com.margelo.nitro.acquisition.PassiveCaptureSnapshot
import com.margelo.nitro.acquisition.PassiveCaptureState
import com.margelo.nitro.acquisition.RPPGInstantHeartRateNitroMapper
import com.margelo.nitro.acquisition.Variant_NullType_String
import com.margelo.nitro.core.NullType
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull

/** 应用进程内唯一的被动服务控制器。 */
internal class PassiveCaptureRuntime internal constructor(context: Context) {
  private val applicationContext = context.applicationContext
  private val preferences = applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
  private val lock = Any()
  private val commandMutex = Mutex()
  private val mainHandler = Handler(Looper.getMainLooper())
  private val listenerIds = AtomicLong(0L)
  private val listeners = ConcurrentHashMap<Double, (PassiveCaptureSnapshot) -> Unit>()
  /** 当前真实服务对象；空值表示没有运行中的服务。 */
  private var service: PassiveCaptureService? = null
  /** 前台服务首次启动完成时通知启用命令的屏障。 */
  private var pendingStart: CompletableDeferred<PassiveCaptureCommandResult>? = null
  /** 已持久化配置；不会据此推断服务正在运行。 */
  private var config = loadConfig()
  /** 当前由服务回报的真实运行阶段。 */
  private var state = PassiveCaptureState.DISABLED
  /** 当前被动 RPPG 会话；等待或关闭时为空。 */
  private var sessionId: String? = null
  /** 仅属于当前测量会话的逐搏值；不持久化也不用于频谱信号结论。 */
  private var latestInstantHeartRate: RPPGInstantHeartRate? = null
  /** 最近一次触发、跳过、完成或失败原因。 */
  private var lastReason: String? = null
  /** 最近一次命令或设备错误。 */
  private var errorCode: String? = null
  private var errorMessage: String? = null

  /** 返回服务真实快照，并异步核对正在运行所需的系统条件。 */
  fun getSnapshot(): PassiveCaptureSnapshot {
    synchronized(lock) { service }?.verifyConditions()
    return synchronized(lock) { snapshotLocked() }
  }

  /** 注册低频状态监听并立即发送真实快照。 */
  fun addListener(listener: (PassiveCaptureSnapshot) -> Unit): Double {
    val id = listenerIds.incrementAndGet().toDouble()
    listeners[id] = listener
    dispatch(id, getSnapshot())
    return id
  }

  /** 移除指定低频监听，不影响其它页面。 */
  fun removeListener(id: Double) {
    listeners.remove(id)
  }

  /** 仅在服务关闭时保存合法配置。 */
  fun setConfig(value: PassiveCaptureConfig): PassiveCaptureCommandResult {
    validateConfig(value)?.let { return commandResult(it.first, it.second) }
    synchronized(lock) {
      if (service != null || state == PassiveCaptureState.STARTING || state == PassiveCaptureState.STOPPING) {
        return commandResult("SERVICE_RUNNING", "请先关闭被动采集，再修改周期或正式测量时长。")
      }
      config = value
      preferences.edit()
        .putLong(KEY_INTERVAL_MILLIS, secondsToMillis(value.intervalSeconds))
        .putLong(KEY_MEASUREMENT_DURATION_MILLIS, secondsToMillis(value.measurementDurationSeconds))
        .putInt(KEY_DEFAULTS_VERSION, DEFAULTS_VERSION)
        .apply()
      state = PassiveCaptureState.DISABLED
      sessionId = null
      latestInstantHeartRate = null
      lastReason = "CONFIGURATION_SAVED"
      errorCode = null
      errorMessage = null
      dispatch(snapshotLocked())
    }
    return commandResult()
  }

  /** 用户明确启用后启动相机类型前台服务；等待完成不打开相机。 */
  suspend fun enable(): PassiveCaptureCommandResult = commandMutex.withLock {
    synchronized(lock) {
      if (state == PassiveCaptureState.WAITING ||
        state == PassiveCaptureState.OBSERVING ||
        state == PassiveCaptureState.MEASURING
      ) {
        return@withLock commandResult()
      }
      if (service != null || state == PassiveCaptureState.STOPPING) {
        return@withLock commandResult("SERVICE_BUSY", "被动采集服务正在完成上一次操作。")
      }
    }
    validateConfig(getSnapshot().config)?.let { return@withLock commandResult(it.first, it.second) }
    try {
      PassiveCaptureNotifications.ensureChannel(applicationContext)
    } catch (error: Throwable) {
      return@withLock commandResult(
        "NOTIFICATION_CHANNEL_FAILED",
        error.message ?: "无法创建被动采集通知渠道。",
      )
    }
    PassiveCaptureNotifications.availabilityFailure(applicationContext)?.let {
      return@withLock commandResult(it.first, it.second)
    }

    val ready = CompletableDeferred<PassiveCaptureCommandResult>()
    synchronized(lock) {
      state = PassiveCaptureState.STARTING
      sessionId = null
      lastReason = "SERVICE_START_REQUESTED"
      errorCode = null
      errorMessage = null
      pendingStart = ready
      dispatch(snapshotLocked())
    }

    try {
      ContextCompat.startForegroundService(
        applicationContext,
        Intent(applicationContext, PassiveCaptureService::class.java),
      )
    } catch (error: Throwable) {
      val details = "FOREGROUND_SERVICE_START_FAILED" to (error.message ?: "系统拒绝启动相机前台服务。")
      failStart(details.first, details.second)
      return@withLock commandResult(details.first, details.second)
    }

    withTimeoutOrNull(SERVICE_START_TIMEOUT_MILLIS) { ready.await() }
      ?: run {
        val details = "FOREGROUND_SERVICE_START_TIMEOUT" to "系统未在限定时间内确认被动服务启动。"
        failStart(details.first, details.second)
        commandResult(details.first, details.second)
      }
  }

  /** 先停止服务接收事件，再等待当前 RPPG 会话收尾并释放相机。 */
  suspend fun disable(): PassiveCaptureCommandResult = commandMutex.withLock {
    val activeService = synchronized(lock) { service }
    if (activeService == null) {
      synchronized(lock) {
        state = PassiveCaptureState.DISABLED
        sessionId = null
        lastReason = "USER_DISABLED"
        errorCode = null
        errorMessage = null
        dispatch(snapshotLocked())
      }
      return@withLock commandResult()
    }

    update(
      state = PassiveCaptureState.STOPPING,
      reason = "USER_DISABLED",
      clearError = true,
    )
    try {
      activeService.stopForUser()
      commandResult()
    } catch (error: Throwable) {
      val message = error.message ?: "关闭被动采集时发生未知错误。"
      update(
        state = PassiveCaptureState.FAILED,
        reason = "STOP_FAILED",
        error = "PASSIVE_STOP_FAILED" to message,
      )
      commandResult("PASSIVE_STOP_FAILED", message)
    }
  }

  /** 合并新旧目录，按真实开始时间查询已发布的被动会话。 */
  suspend fun listArtifacts(): List<RPPGArtifact> = buildList {
    addAll(RPPGArtifactStore(applicationContext.acquisitionFilesDirectory()).listArtifacts(RPPGSessionSource.PASSIVE))
    addAll(RPPGArtifactStore(applicationContext.filesDir).listArtifacts(RPPGSessionSource.PASSIVE))
    sortWith(compareBy<RPPGArtifact> { it.startedAtSortKey }.thenBy { it.sessionId })
  }

  /** 从旧视频目录扫描完整且媒体可读的历史录像。 */
  suspend fun listVideoArtifacts(): Array<com.margelo.nitro.acquisition.PassiveVideoArtifact> =
    PassiveVideoArtifactStore(applicationContext).listVideoArtifacts()

  /** 服务成功进入前台后建立等待状态并完成启用屏障。 */
  fun onServiceReady(startedService: PassiveCaptureService) {
    synchronized(lock) {
      service = startedService
      state = PassiveCaptureState.WAITING
      sessionId = null
      latestInstantHeartRate = null
      lastReason = "WAITING_FOR_UNLOCK"
      errorCode = null
      errorMessage = null
      pendingStart?.complete(commandResult())
      pendingStart = null
      dispatch(snapshotLocked())
    }
  }

  /** 服务无法进入前台时如实结束启用命令。 */
  fun onServiceStartFailed(code: String, message: String) {
    failStart(code, message)
  }

  /** 更新服务阶段、当前会话与最近一次低频原因。 */
  fun update(
    state: PassiveCaptureState,
    sessionId: String? = null,
    reason: String? = null,
    error: Pair<String, String>? = null,
    clearError: Boolean = false,
  ) {
    synchronized(lock) {
      this.state = state
      if (this.sessionId != sessionId || state != PassiveCaptureState.MEASURING) {
        latestInstantHeartRate = null
      }
      this.sessionId = sessionId
      if (reason != null) lastReason = reason
      if (clearError) {
        errorCode = null
        errorMessage = null
      }
      error?.let {
        errorCode = it.first
        errorMessage = it.second
      }
      dispatch(snapshotLocked())
    }
  }

  /** 仅接收当前测量会话的逐搏变更，拒绝停止后及旧会话的迟到值。 */
  fun updateInstantHeartRate(sessionId: String, value: RPPGInstantHeartRate?) {
    synchronized(lock) {
      if (this.sessionId != sessionId || state != PassiveCaptureState.MEASURING) return
      if (latestInstantHeartRate == value) return
      latestInstantHeartRate = value
      dispatch(snapshotLocked())
    }
  }

  /** 只更新最近原因，保留正在运行的真实阶段与会话。 */
  fun updateReason(reason: String) {
    synchronized(lock) {
      lastReason = reason
      dispatch(snapshotLocked())
    }
  }

  /** 服务完整收尾后清除运行事实；失败状态保留给界面展示。 */
  fun onServiceStopped(stoppedService: PassiveCaptureService) {
    synchronized(lock) {
      if (service !== stoppedService) return
      service = null
      sessionId = null
      latestInstantHeartRate = null
      if (state != PassiveCaptureState.FAILED) {
        state = PassiveCaptureState.DISABLED
        errorCode = null
        errorMessage = null
      }
      dispatch(snapshotLocked())
    }
  }

  private fun failStart(code: String, message: String) {
    synchronized(lock) {
      service = null
      state = PassiveCaptureState.FAILED
      sessionId = null
      latestInstantHeartRate = null
      lastReason = code
      errorCode = code
      errorMessage = message
      val result = commandResult(code, message)
      pendingStart?.complete(result)
      pendingStart = null
      dispatch(snapshotLocked())
    }
  }

  private fun snapshotLocked() = PassiveCaptureSnapshot(
    state = state,
    config = config,
    minimumHeartRateMeasurementSeconds =
      RPPGConfig.EXPERIMENTAL_V2.minimumSpectralMeasurementNanos.toDouble() / NANOS_PER_SECOND,
    sessionId = nullableString(sessionId),
    latestInstantHeartRate = RPPGInstantHeartRateNitroMapper.toNitro(latestInstantHeartRate),
    lastReason = nullableString(lastReason),
    errorCode = nullableString(errorCode),
    errorMessage = nullableString(errorMessage),
  )

  private fun dispatch(snapshot: PassiveCaptureSnapshot) {
    mainHandler.post {
      for ((id, listener) in listeners) dispatch(id, snapshot)
    }
  }

  private fun dispatch(id: Double, snapshot: PassiveCaptureSnapshot) {
    mainHandler.post {
      listeners[id]?.let { listener ->
        try {
          listener(snapshot)
        } catch (_: Throwable) {
          // 订阅者异常不能中断原生服务控制。
        }
      }
    }
  }

  private fun loadConfig(): PassiveCaptureConfig {
    if (preferences.getInt(KEY_DEFAULTS_VERSION, 0) < DEFAULTS_VERSION) {
      val editor = preferences.edit().putInt(KEY_DEFAULTS_VERSION, DEFAULTS_VERSION)
      // 旧版没有记录配置来源，只迁移与旧默认相等的字段；其余自定义值独立保留。
      // 删除默认键而非写入 debug 数值，确保后续 release 仍按自己的默认周期读取。
      if (preferences.getLong(KEY_INTERVAL_MILLIS, -1L) == LEGACY_DEFAULT_INTERVAL_MILLIS) {
        editor.remove(KEY_INTERVAL_MILLIS)
      }
      if (preferences.getLong(KEY_MEASUREMENT_DURATION_MILLIS, -1L) == LEGACY_DEFAULT_DURATION_MILLIS) {
        editor.remove(KEY_MEASUREMENT_DURATION_MILLIS)
      }
      editor.apply()
    }
    val defaultIntervalMillis = secondsToMillis(DEFAULT_INTERVAL_SECONDS.toDouble())
    val defaultDurationMillis = secondsToMillis(DEFAULT_MEASUREMENT_DURATION_SECONDS.toDouble())
    val intervalMillis = preferences.getLong(KEY_INTERVAL_MILLIS, defaultIntervalMillis)
    val measurementDurationMillis = preferences.getLong(KEY_MEASUREMENT_DURATION_MILLIS, defaultDurationMillis)
    return PassiveCaptureConfig(
      intervalSeconds = intervalMillis.toDouble() / MILLIS_PER_SECOND,
      measurementDurationSeconds = measurementDurationMillis.toDouble() / MILLIS_PER_SECOND,
    )
  }

  private fun validateConfig(value: PassiveCaptureConfig): Pair<String, String>? {
    if (!value.intervalSeconds.isFinite() || value.intervalSeconds <= 0.0 || !canConvertSecondsToNanos(value.intervalSeconds)) {
      return "INVALID_INTERVAL" to "采集周期必须是可换算为纳秒的有限正数。"
    }
    if (
      !value.measurementDurationSeconds.isFinite() ||
      value.measurementDurationSeconds <= 0.0 ||
      !canConvertSecondsToNanos(value.measurementDurationSeconds)
    ) {
      return "INVALID_MEASUREMENT_DURATION" to "正式测量时长必须是可表示的有限正数。"
    }
    return null
  }

  private fun canConvertSecondsToNanos(seconds: Double): Boolean =
    seconds * NANOS_PER_SECOND <= Long.MAX_VALUE.toDouble()
  private fun secondsToMillis(seconds: Double): Long =
    kotlin.math.ceil(seconds * MILLIS_PER_SECOND).toLong().coerceAtLeast(1L)

  private fun commandResult(code: String? = null, message: String? = null) = PassiveCaptureCommandResult(
    errorCode = nullableString(code),
    errorMessage = nullableString(message),
  )

  private fun nullableString(value: String?): Variant_NullType_String =
    if (value == null) Variant_NullType_String.create(NullType.NULL)
    else Variant_NullType_String.create(value)

  private companion object {
    const val PREFERENCES_NAME = "passive_capture"
    const val KEY_INTERVAL_MILLIS = "interval_millis"
    const val KEY_MEASUREMENT_DURATION_MILLIS = "duration_millis"
    const val KEY_DEFAULTS_VERSION = "defaults_version"
    const val DEFAULTS_VERSION = 2
    const val LEGACY_DEFAULT_INTERVAL_MILLIS = 7_200_000L
    const val LEGACY_DEFAULT_DURATION_MILLIS = 30_000L
    val DEFAULT_INTERVAL_SECONDS = if (BuildConfig.DEBUG) 30 else 600
    const val DEFAULT_MEASUREMENT_DURATION_SECONDS = 12
    const val MILLIS_PER_SECOND = 1_000.0
    const val NANOS_PER_SECOND = 1_000_000_000.0
    const val SERVICE_START_TIMEOUT_MILLIS = 8_000L
  }

}

/** 复用应用级被动运行时实例，并且只保留 Application Context。 */
internal object PassiveCaptureRuntimes {
  private val lock = Any()
  /** 单进程持有的唯一控制实例。 */
  private var runtime: PassiveCaptureRuntime? = null

  /** 使用应用 Context 创建或取得运行时，绝不依赖 ReactActivity。 */
  fun get(context: Context): PassiveCaptureRuntime = synchronized(lock) {
    runtime ?: PassiveCaptureRuntime(context.applicationContext).also { runtime = it }
  }
}
