/** 管理应用级被动服务、配置持久化和 JS 可观察的真实运行状态。 */

package com.healthcvapp.acquisition.passive.runtime

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.healthcvapp.acquisition.passive.output.PassiveVideoArtifactStore
import com.healthcvapp.acquisition.passive.service.PassiveCaptureNotifications
import com.healthcvapp.acquisition.passive.service.PassiveCaptureService
import com.margelo.nitro.acquisition.PassiveCaptureArtifact
import com.margelo.nitro.acquisition.PassiveCaptureCommandResult
import com.margelo.nitro.acquisition.PassiveCaptureConfig
import com.margelo.nitro.acquisition.PassiveCaptureSnapshot
import com.margelo.nitro.acquisition.PassiveCaptureState
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
  /** 当前录像会话；等待或关闭时为空。 */
  private var sessionId: String? = null
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
        return commandResult("SERVICE_RUNNING", "请先关闭被动采集，再修改周期或录像时长。")
      }
      config = value
      preferences.edit()
        .putLong(KEY_INTERVAL_MILLIS, secondsToMillis(value.intervalSeconds))
        .putLong(KEY_DURATION_MILLIS, secondsToMillis(value.durationSeconds))
        .apply()
      state = PassiveCaptureState.DISABLED
      sessionId = null
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
      if (state == PassiveCaptureState.WAITING || state == PassiveCaptureState.RECORDING) {
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

  /** 先停止服务接收事件，再等待录像收尾和相机释放。 */
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

  /** 从应用私有目录扫描已发布且媒体可读的视频。 */
  suspend fun listArtifacts(): Array<PassiveCaptureArtifact> =
    PassiveVideoArtifactStore(applicationContext).listArtifacts()

  /** 服务成功进入前台后建立等待状态并完成启用屏障。 */
  fun onServiceReady(startedService: PassiveCaptureService) {
    synchronized(lock) {
      service = startedService
      state = PassiveCaptureState.WAITING
      sessionId = null
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
    sessionId = nullableString(sessionId),
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
    val defaultIntervalMillis = secondsToMillis(DEFAULT_INTERVAL_SECONDS.toDouble())
    val defaultDurationMillis = secondsToMillis(DEFAULT_DURATION_SECONDS.toDouble())
    val intervalMillis = preferences.getLong(KEY_INTERVAL_MILLIS, defaultIntervalMillis)
    val durationMillis = preferences.getLong(KEY_DURATION_MILLIS, defaultDurationMillis)
    return PassiveCaptureConfig(
      intervalSeconds = intervalMillis.toDouble() / MILLIS_PER_SECOND,
      durationSeconds = durationMillis.toDouble() / MILLIS_PER_SECOND,
    )
  }

  private fun validateConfig(value: PassiveCaptureConfig): Pair<String, String>? {
    if (!value.intervalSeconds.isFinite() || value.intervalSeconds <= 0.0 || !canConvertSeconds(value.intervalSeconds)) {
      return "INVALID_INTERVAL" to "采集周期必须是可表示的有限正数。"
    }
    if (!value.durationSeconds.isFinite() || value.durationSeconds <= 0.0 || !canConvertSeconds(value.durationSeconds)) {
      return "INVALID_DURATION" to "单次录像时长必须是可表示的有限正数。"
    }
    return null
  }

  private fun canConvertSeconds(seconds: Double): Boolean =
    seconds * MILLIS_PER_SECOND <= Long.MAX_VALUE.toDouble()

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
    const val KEY_DURATION_MILLIS = "duration_millis"
    const val DEFAULT_INTERVAL_SECONDS = 7_200
    const val DEFAULT_DURATION_SECONDS = 10
    const val MILLIS_PER_SECOND = 1_000.0
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
