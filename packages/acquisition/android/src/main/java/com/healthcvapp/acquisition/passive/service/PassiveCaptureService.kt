/** 以 Android 前台服务拥有解锁候选、无预览 RPPG 会话及资源收尾。 */

package com.healthcvapp.acquisition.passive.service

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.SystemClock
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleService
import com.healthcvapp.acquisition.passive.runtime.PassiveCaptureRuntime
import com.healthcvapp.acquisition.passive.runtime.PassiveCaptureRuntimes
import com.healthcvapp.acquisition.passive.trigger.PassiveCycleDecision
import com.healthcvapp.acquisition.passive.trigger.PassiveCycleGate
import com.healthcvapp.acquisition.rppg.model.RPPGTerminationReason
import com.healthcvapp.acquisition.rppg.runtime.AndroidRPPGPassiveSessionFactory
import com.healthcvapp.acquisition.rppg.session.RPPGSession
import com.healthcvapp.acquisition.rppg.session.RPPGSessionOperationResult
import com.healthcvapp.acquisition.rppg.session.RPPGSessionPhase
import com.healthcvapp.acquisition.rppg.session.RPPGSessionSnapshot
import com.margelo.nitro.acquisition.PassiveCaptureConfig
import com.margelo.nitro.acquisition.PassiveCaptureState
import java.util.UUID
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.ceil
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.selects.select
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/** 一次后台 RPPG 会话的停止请求及 terminal 状态屏障。 */
private class ActivePassiveSession(
  /** 本次解锁机会的代次，用于拒绝迟到的会话回调。 */
  val generation: Long,
  /** 与被动三件套目录一致的会话标识。 */
  val sessionId: String,
  /** 独占相机租约、算法、计时和完整输出的会话。 */
  val session: RPPGSession,
  /** 收到正式终态快照后唤醒唯一协调任务。 */
  val terminal: CompletableDeferred<RPPGSessionSnapshot>,
) {
  /** 屏幕锁定、用户关闭或系统条件失效的停止请求。 */
  val stopSignal = CompletableDeferred<PassiveSessionStop>()
  /** 打开、停止、发布及释放资源的唯一协调任务。 */
  var job: Job? = null
}

/** 描述当前候选会话收到的合法中断。 */
private data class PassiveSessionStop(
  /** 保留给低频状态展示的原因代码。 */
  val reason: String,
  /** 被动流程统一以 interrupted 写入已形成的完整会话。 */
  val termination: RPPGTerminationReason = RPPGTerminationReason.INTERRUPTED,
)

/** Android 前台服务；等待期间不绑定或占用相机。 */
class PassiveCaptureService : LifecycleService() {
  private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private val eventMutex = Mutex()
  private val shutdownMutex = Mutex()
  private val captureEventLock = Any()
  private lateinit var runtime: PassiveCaptureRuntime
  @Volatile private var acceptingEvents = false
  private var receiverRegistered = false
  @Volatile private var capture: ActivePassiveSession? = null
  @Volatile private var cycleGate: PassiveCycleGate? = null
  private var currentConfig: PassiveCaptureConfig? = null
  private var captureGeneration = 0L

  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      when (intent.action) {
        Intent.ACTION_USER_PRESENT -> serviceScope.launch { handleUnlockEvent() }
        Intent.ACTION_SCREEN_OFF -> serviceScope.launch { handleScreenOff() }
      }
    }
  }

  /** 初始化应用级控制器，不在 Service 创建或首次进入应用时打开相机。 */
  override fun onCreate() {
    super.onCreate()
    runtime = PassiveCaptureRuntimes.get(applicationContext)
  }

  /** 用户可见页面启动服务；通知按钮通过同一入口触发原生关闭。 */
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    super.onStartCommand(intent, flags, startId)
    if (intent?.action == ACTION_DISABLE) {
      serviceScope.launch { stopForUser() }
      return START_NOT_STICKY
    }
    if (!acceptingEvents) startForegroundWaiting()
    return START_NOT_STICKY
  }

  /** 立即前台化后进入等待状态；整个阶段都不启动相机。 */
  private fun startForegroundWaiting() {
    PassiveCaptureNotifications.ensureChannel(applicationContext)
    PassiveCaptureNotifications.availabilityFailure(applicationContext)?.let { (code, message) ->
      runtime.onServiceStartFailed(code, message)
      stopSelf()
      return
    }

    try {
      val config = runtime.getSnapshot().config
      val notification = PassiveCaptureNotifications.build(
        applicationContext,
        PassiveCaptureState.WAITING,
        config.measurementDurationSeconds,
      )
      val foregroundType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
      } else {
        0
      }
      ServiceCompat.startForeground(
        this,
        PassiveCaptureNotifications.NOTIFICATION_ID,
        notification,
        foregroundType,
      )
      currentConfig = config
      cycleGate = PassiveCycleGate(secondsToNanos(config.intervalSeconds))
      synchronized(captureEventLock) { acceptingEvents = true }
      registerScreenReceiver()
      runtime.onServiceReady(this)
      updateNotification(PassiveCaptureState.WAITING)
    } catch (error: Throwable) {
      val message = error.message ?: "系统拒绝启动相机前台服务。"
      runtime.onServiceStartFailed("FOREGROUND_SERVICE_START_FAILED", message)
      ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
      stopSelf()
    }
  }

  /** 在应用重新进入时异步核对运行所需权限和通知渠道。 */
  fun verifyConditions() {
    serviceScope.launch {
      eventMutex.withLock {
        if (!acceptingEvents) return@withLock
        PassiveCaptureNotifications.availabilityFailure(applicationContext)?.let {
          stopForConditionFailure(it)
        }
      }
    }
  }

  /** 用户从应用命令或通知操作关闭服务并等待当前会话资源屏障。 */
  suspend fun stopForUser() = withContext(Dispatchers.Main.immediate) {
    eventMutex.withLock {
      shutdownMutex.withLock {
        if (!acceptingEvents && capture == null) {
          removeForegroundNotification()
          runtime.onServiceStopped(this@PassiveCaptureService)
          stopSelf()
          return@withLock
        }
        val activeCapture = synchronized(captureEventLock) {
          acceptingEvents = false
          capture
        }
        unregisterScreenReceiver()
        runtime.update(
          state = PassiveCaptureState.STOPPING,
          sessionId = activeCapture?.sessionId,
          reason = "USER_DISABLED",
          clearError = true,
        )
        updateNotification(PassiveCaptureState.STOPPING)
        activeCapture?.stopSignal?.complete(PassiveSessionStop("USER_DISABLED"))
        activeCapture?.job?.join()
        removeForegroundNotification()
        runtime.onServiceStopped(this@PassiveCaptureService)
        stopSelf()
      }
    }
  }

  /** 条件失效时停止接收解锁事件，收尾后保留错误并要求用户重新启用。 */
  private suspend fun stopForConditionFailure(failure: Pair<String, String>) =
    withContext(Dispatchers.Main.immediate) {
      shutdownMutex.withLock {
        if (!acceptingEvents) return@withLock
        val activeCapture = synchronized(captureEventLock) {
          acceptingEvents = false
          capture
        }
        unregisterScreenReceiver()
        runtime.update(
          state = PassiveCaptureState.FAILED,
          sessionId = activeCapture?.sessionId,
          reason = failure.first,
          error = failure,
        )
        updateNotification(PassiveCaptureState.FAILED)
        activeCapture?.stopSignal?.complete(PassiveSessionStop(failure.first))
        activeCapture?.job?.join()
        runtime.update(
          state = PassiveCaptureState.FAILED,
          reason = failure.first,
          error = failure,
        )
        removeForegroundNotification()
        runtime.onServiceStopped(this@PassiveCaptureService)
        stopSelf()
      }
    }

  /** 解锁只产生一次候选机会；不在锁屏、忙或周期未到时排队重试。 */
  private suspend fun handleUnlockEvent() = eventMutex.withLock {
    if (!acceptingEvents) return@withLock
    PassiveCaptureNotifications.availabilityFailure(applicationContext)?.let {
      stopForConditionFailure(it)
      return@withLock
    }
    val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    if (keyguard.isKeyguardLocked) {
      updateRuntime(PassiveCaptureState.WAITING, reason = "DEVICE_STILL_LOCKED")
      return@withLock
    }

    val decision = cycleGate?.decide(
      nowElapsedNanos = SystemClock.elapsedRealtimeNanos(),
      busy = capture != null,
    ) ?: PassiveCycleDecision.BUSY
    when (decision) {
      PassiveCycleDecision.BUSY -> {
        if (capture == null) updateRuntime(PassiveCaptureState.WAITING, reason = "CAPTURE_BUSY")
        else runtime.updateReason("CAPTURE_BUSY")
      }
      PassiveCycleDecision.TOO_EARLY -> updateRuntime(PassiveCaptureState.WAITING, reason = "CYCLE_NOT_ELAPSED")
      PassiveCycleDecision.START -> beginCapture()
    }
  }

  /** 屏幕锁定只中断当前会话；已启用服务继续等待真实解锁候选。 */
  private suspend fun handleScreenOff() = eventMutex.withLock {
    val activeCapture = synchronized(captureEventLock) {
      if (acceptingEvents) capture else null
    }
    if (activeCapture != null) {
      runtime.update(
        state = PassiveCaptureState.STOPPING,
        sessionId = activeCapture.sessionId,
        reason = "SCREEN_LOCKED",
      )
      updateNotification(PassiveCaptureState.STOPPING)
      activeCapture.stopSignal.complete(PassiveSessionStop("SCREEN_LOCKED"))
    }
  }

  /** 对当前解锁机会启动一次无预览 RPPG 会话。 */
  private fun beginCapture() {
    val config = currentConfig ?: return
    val generation = ++captureGeneration
    val sessionId = UUID.randomUUID().toString()
    val terminal = CompletableDeferred<RPPGSessionSnapshot>()
    val lastPhase = AtomicReference<RPPGSessionPhase?>(null)
    val lastInstantHeartRate =
      AtomicReference<com.healthcvapp.acquisition.rppg.model.RPPGInstantHeartRate?>(null)
    val session = try {
      AndroidRPPGPassiveSessionFactory(
        context = applicationContext,
        lifecycleOwner = this,
        filesDirectory = applicationContext.filesDir,
        measurementDurationNanos = secondsToNanos(config.measurementDurationSeconds),
        scope = serviceScope,
      ).create(
        onFirstFrame = { deliveredSessionId, elapsedRealtimeNanos ->
          synchronized(captureEventLock) {
            val activeCapture = capture
            val phase = activeCapture?.session?.snapshot?.phase
            if (
              acceptingEvents &&
              activeCapture != null &&
              !activeCapture.stopSignal.isCompleted &&
              deliveredSessionId == sessionId &&
              activeCapture.generation == generation &&
              activeCapture.sessionId == deliveredSessionId &&
              (phase == RPPGSessionPhase.OPENING ||
                phase == RPPGSessionPhase.OBSERVING ||
                phase == RPPGSessionPhase.MEASURING)
            ) {
              cycleGate?.recordFirstFrameAt(elapsedRealtimeNanos)
            }
          }
        },
        onSnapshot = { snapshot ->
          if (snapshot.phase == RPPGSessionPhase.COMPLETED ||
            snapshot.phase == RPPGSessionPhase.FAILED ||
            snapshot.phase == RPPGSessionPhase.CLOSED
          ) {
            terminal.complete(snapshot)
          }
          val phaseChanged = lastPhase.getAndSet(snapshot.phase) != snapshot.phase
          val instantChanged = lastInstantHeartRate.getAndSet(snapshot.latestInstantHeartRate) !=
            snapshot.latestInstantHeartRate
          if (phaseChanged || instantChanged) {
            publishSessionSnapshot(generation, snapshot, phaseChanged)
          }
        },
      )
    } catch (error: Throwable) {
      val message = error.message ?: "无法准备被动 RPPG 会话。"
      runtime.update(
        state = PassiveCaptureState.WAITING,
        reason = "SESSION_CREATE_FAILED",
        error = "SESSION_CREATE_FAILED" to message,
      )
      updateNotification(PassiveCaptureState.WAITING)
      return
    }

    val activeCapture = ActivePassiveSession(generation, sessionId, session, terminal)
    synchronized(captureEventLock) { capture = activeCapture }
    runtime.update(
      state = PassiveCaptureState.STARTING,
      sessionId = sessionId,
      reason = "UNLOCK_TRIGGERED",
      clearError = true,
    )
    updateNotification(PassiveCaptureState.STARTING)
    activeCapture.job = serviceScope.launch { runCapture(activeCapture) }
  }

  /** 只在阶段变化时更新通知；逐搏变更独立交给当前会话的低频快照。 */
  private fun publishSessionSnapshot(
    generation: Long,
    snapshot: RPPGSessionSnapshot,
    phaseChanged: Boolean,
  ) {
    val state = when (snapshot.phase) {
      RPPGSessionPhase.OPENING -> PassiveCaptureState.STARTING
      RPPGSessionPhase.OBSERVING -> PassiveCaptureState.OBSERVING
      RPPGSessionPhase.MEASURING -> PassiveCaptureState.MEASURING
      RPPGSessionPhase.STOPPING -> PassiveCaptureState.STOPPING
      else -> return
    }
    serviceScope.launch {
      val activeCapture = capture ?: return@launch
      if (!acceptingEvents || activeCapture.stopSignal.isCompleted || activeCapture.generation != generation) return@launch
      val reason = when (snapshot.phase) {
        RPPGSessionPhase.OPENING -> "SESSION_OPENING"
        RPPGSessionPhase.OBSERVING -> "FACE_OBSERVATION"
        RPPGSessionPhase.MEASURING -> "MEASUREMENT_STARTED"
        RPPGSessionPhase.STOPPING -> "MEASUREMENT_STOPPING"
        else -> return@launch
      }
      if (phaseChanged) {
        runtime.update(
          state = state,
          sessionId = snapshot.sessionId ?: activeCapture.sessionId,
          reason = reason,
          clearError = state == PassiveCaptureState.STARTING,
        )
        updateNotification(state)
      }
      runtime.updateInstantHeartRate(
        sessionId = activeCapture.sessionId,
        value = snapshot.latestInstantHeartRate,
      )
    }
  }

  /** 串行等待相机启动、首个人脸就绪或合法停止，并执行一次完整收尾。 */
  private suspend fun runCapture(attempt: ActivePassiveSession) {
    var finalReason = "SESSION_START_FAILED"
    var finalError: Pair<String, String>? = null
    try {
      val openingJob = serviceScope.async {
        attempt.session.startAnalysisOnly(attempt.sessionId)
      }
      val opened = select<RPPGSessionOperationResult?> {
        openingJob.onAwait { it }
        attempt.stopSignal.onAwait { null }
      }
      if (opened == null) {
        val stop = attempt.stopSignal.await()
        openingJob.cancel()
        openingJob.join()
        val openingResult = runCatching { openingJob.await() }.getOrNull()
        if (openingResult?.accepted == true) {
          val stopped = attempt.session.stop(stop.termination)
          val failure = stopped.error ?: stopped.snapshot.error
          finalReason = failure?.code ?: stopped.snapshot.termination?.wireValue ?: stop.reason
          finalError = failure?.let { it.code to it.message }
        } else {
          val failure = openingResult?.error ?: openingResult?.snapshot?.error
          finalReason = failure?.code ?: stop.reason
          finalError = failure?.let { it.code to it.message }
        }
        return
      }
      if (!opened.accepted) {
        val failure = opened.error ?: opened.snapshot.error
        finalReason = failure?.code ?: "SESSION_START_FAILED"
        finalError = failure?.let { it.code to it.message }
        return
      }

      when (val end = select<PassiveSessionEnd> {
        attempt.terminal.onAwait { PassiveSessionEnd.Terminal(it) }
        attempt.stopSignal.onAwait { PassiveSessionEnd.Stop(it) }
      }) {
        is PassiveSessionEnd.Terminal -> {
          val failure = end.snapshot.error
          finalReason = failure?.code ?: end.snapshot.termination?.wireValue ?: "SESSION_FINISHED"
          finalError = failure?.let { it.code to it.message }
        }
        is PassiveSessionEnd.Stop -> {
          val stopped = attempt.session.stop(end.stop.termination)
          val failure = stopped.error ?: stopped.snapshot.error
          finalReason = failure?.code ?: stopped.snapshot.termination?.wireValue ?: end.stop.reason
          finalError = failure?.let { it.code to it.message }
        }
      }
    } catch (error: CancellationException) {
      finalReason = if (attempt.stopSignal.isCompleted) {
        attempt.stopSignal.await().reason
      } else {
        "SERVICE_DESTROYED"
      }
      throw error
    } catch (error: Throwable) {
      finalReason = "SESSION_FAILED"
      finalError = "SESSION_FAILED" to (error.message ?: "被动 RPPG 会话失败。")
    } finally {
      withContext(NonCancellable) {
        if (!attempt.session.resourcesReleased) {
          val stopReason = if (attempt.stopSignal.isCompleted) {
            attempt.stopSignal.await().termination
          } else {
            RPPGTerminationReason.INTERRUPTED
          }
          try {
            val stopped = attempt.session.stop(stopReason)
            val failure = stopped.error ?: stopped.snapshot.error
            if (failure != null && finalError == null) {
              finalReason = failure.code
              finalError = failure.code to failure.message
            }
          } catch (error: Throwable) {
            if (finalError == null) {
              finalReason = "SESSION_CLEANUP_FAILED"
              finalError = "SESSION_CLEANUP_FAILED" to (error.message ?: "无法完成被动会话收尾。")
            }
          }
        }
        if (attempt.session.resourcesReleased) {
          try {
            attempt.session.close()
          } catch (error: Throwable) {
            if (finalError == null) {
              finalReason = "SESSION_CLOSE_FAILED"
              finalError = "SESSION_CLOSE_FAILED" to (error.message ?: "无法关闭被动 RPPG 会话。")
            }
          }
        }
        synchronized(captureEventLock) {
          if (capture === attempt) capture = null
        }
        if (acceptingEvents) {
          runtime.update(
            state = PassiveCaptureState.WAITING,
            sessionId = attempt.sessionId,
            reason = finalReason,
            error = finalError,
            clearError = finalError == null,
          )
          updateNotification(PassiveCaptureState.WAITING)
        }
      }
    }
  }


  /** 更新低频原生状态并复用当前服务通知 ID。 */
  private fun updateRuntime(
    state: PassiveCaptureState,
    reason: String,
    error: Pair<String, String>? = null,
  ) {
    runtime.update(state = state, reason = reason, error = error)
    updateNotification(state)
  }

  /** 更新低频原生状态并复用当前服务通知 ID。 */
  private fun updateNotification(state: PassiveCaptureState) {
    runCatching {
      val measurementDurationSeconds =
        currentConfig?.measurementDurationSeconds ?: runtime.getSnapshot().config.measurementDurationSeconds
      NotificationManagerCompat.from(applicationContext).notify(
        PassiveCaptureNotifications.NOTIFICATION_ID,
        PassiveCaptureNotifications.build(applicationContext, state, measurementDurationSeconds),
      )
    }
  }

  /** 注册本服务运行期间的解锁和屏幕关闭候选事件。 */
  private fun registerScreenReceiver() {
    if (receiverRegistered) return
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_USER_PRESENT)
      addAction(Intent.ACTION_SCREEN_OFF)
    }
    ContextCompat.registerReceiver(this, screenReceiver, filter, ContextCompat.RECEIVER_EXPORTED)
    receiverRegistered = true
  }

  /** 在停止接收新触发前注销动态系统事件。 */
  private fun unregisterScreenReceiver() {
    if (!receiverRegistered) return
    runCatching { unregisterReceiver(screenReceiver) }
    receiverRegistered = false
  }

  /** 移除唯一持续通知，不留下会误导用户的采集状态。 */
  private fun removeForegroundNotification() {
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    NotificationManagerCompat.from(applicationContext).cancel(PassiveCaptureNotifications.NOTIFICATION_ID)
  }

  /** 将已验证的有限秒数向上换算为正纳秒周期。 */
  private fun secondsToNanos(seconds: Double): Long =
    ceil(seconds * NANOS_PER_SECOND).toLong().coerceAtLeast(1L)

  override fun onDestroy() {
    val activeCapture = synchronized(captureEventLock) {
      acceptingEvents = false
      capture
    }
    unregisterScreenReceiver()
    activeCapture?.stopSignal?.complete(PassiveSessionStop("SERVICE_DESTROYED"))
    if (activeCapture == null) {
      removeForegroundNotification()
      if (::runtime.isInitialized) runtime.onServiceStopped(this)
      serviceScope.cancel()
    } else {
      serviceScope.launch {
        activeCapture.job?.join()
        removeForegroundNotification()
        if (::runtime.isInitialized) runtime.onServiceStopped(this@PassiveCaptureService)
        serviceScope.cancel()
      }
    }
    super.onDestroy()
  }

  private sealed interface PassiveSessionEnd {
    data class Terminal(val snapshot: RPPGSessionSnapshot) : PassiveSessionEnd
    data class Stop(val stop: PassiveSessionStop) : PassiveSessionEnd
  }

  companion object {
    internal const val ACTION_DISABLE = "com.healthcvapp.acquisition.passive.DISABLE"
    private const val NANOS_PER_SECOND = 1_000_000_000.0
  }
}
