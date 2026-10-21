/** 作为被动采集运行期持有前摄服务、解锁事件、录像计时与通知。 */

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
import com.healthcvapp.acquisition.camera.ownership.CameraUseGuard
import com.healthcvapp.acquisition.camera.ownership.CameraUseLease
import com.healthcvapp.acquisition.passive.capture.PassiveCaptureAttemptLifecycle
import com.healthcvapp.acquisition.passive.capture.PassiveVideoRecordingSession
import com.healthcvapp.acquisition.passive.output.PassiveVideoArtifactStore
import com.healthcvapp.acquisition.passive.runtime.PassiveCaptureRuntime
import com.healthcvapp.acquisition.passive.runtime.PassiveCaptureRuntimes
import com.healthcvapp.acquisition.passive.trigger.PassiveCycleDecision
import com.healthcvapp.acquisition.passive.trigger.PassiveCycleGate
import com.margelo.nitro.acquisition.PassiveCaptureConfig
import com.margelo.nitro.acquisition.PassiveCaptureState
import java.io.File
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.selects.select
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

/** 由前台服务拥有的单段录像及其取消屏障。 */
private class ActivePassiveCapture(
  /** 本段录像唯一会话 ID。 */
  val sessionId: String,
  /** 仅在 Finalize 与媒体检查成功后才会提升的临时文件。 */
  val temporaryFile: File,
  /** 该录像独占的相机持有令牌。 */
  val cameraLease: CameraUseLease,
) {
  /** 屏幕锁定或用户关闭时唤醒录像协调任务的原因。 */
  val stopSignal = CompletableDeferred<CaptureStop>()
  /** 打开、计时、收尾和发布的唯一任务。 */
  var job: Job? = null
  /** 用同步状态机隔离取消、收尾及文件提交的竞争。 */
  val lifecycle = PassiveCaptureAttemptLifecycle()
}

/** 一次录像结束于目标时长或一个明确的中断原因。 */
private data class CaptureStop(
  /** 可写入低频状态的稳定结束原因。 */
  val reason: String,
  /** 是否由原生目标时长到达，而不是中途停止。 */
  val reachedTargetDuration: Boolean,
)

/** Android Camera 前台服务；等待期间不绑定或占用相机。 */
class PassiveCaptureService : LifecycleService() {
  private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private val eventMutex = Mutex()
  private val shutdownMutex = Mutex()
  private lateinit var runtime: PassiveCaptureRuntime
  private var acceptingEvents = false
  private var receiverRegistered = false
  private var capture: ActivePassiveCapture? = null
  private var cycleGate: PassiveCycleGate? = null
  private var currentConfig: PassiveCaptureConfig? = null

  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      when (intent.action) {
        Intent.ACTION_USER_PRESENT -> serviceScope.launch { handleUnlockEvent() }
        Intent.ACTION_SCREEN_OFF -> serviceScope.launch { interruptCapture("SCREEN_LOCKED") }
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
      val notification = PassiveCaptureNotifications.build(applicationContext, PassiveCaptureState.WAITING)
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
      val config = runtime.getSnapshot().config
      currentConfig = config
      cycleGate = PassiveCycleGate(secondsToMillis(config.intervalSeconds))
      acceptingEvents = true
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
        PassiveCaptureNotifications.availabilityFailure(applicationContext)?.let { stopForConditionFailure(it) }
      }
    }
  }

  /** 用户从应用命令或通知操作关闭服务并等待相机会话结束。 */
  suspend fun stopForUser() = withContext(Dispatchers.Main.immediate) {
    eventMutex.withLock {
      shutdownMutex.withLock {
        if (!acceptingEvents && capture == null) {
          removeForegroundNotification()
          runtime.onServiceStopped(this@PassiveCaptureService)
          stopSelf()
          return@withLock
        }
        acceptingEvents = false
        unregisterScreenReceiver()
        val activeCapture = capture
        runtime.update(
          state = PassiveCaptureState.STOPPING,
          sessionId = activeCapture?.sessionId,
          reason = "USER_DISABLED",
          clearError = true,
        )
        updateNotification(PassiveCaptureState.STOPPING)
        activeCapture?.lifecycle?.cancel()
        activeCapture?.stopSignal?.complete(CaptureStop("USER_DISABLED", reachedTargetDuration = false))
        activeCapture?.job?.join()
        removeForegroundNotification()
        runtime.onServiceStopped(this@PassiveCaptureService)
        stopSelf()
      }
    }
  }

  /** 在下一次解锁或页面核对发现前提失效时停止接收并收尾。 */
  private suspend fun stopForConditionFailure(failure: Pair<String, String>) = withContext(Dispatchers.Main.immediate) {
    shutdownMutex.withLock {
      if (!acceptingEvents) return@withLock
      acceptingEvents = false
      unregisterScreenReceiver()
      val activeCapture = capture
      runtime.update(
        state = PassiveCaptureState.FAILED,
        sessionId = activeCapture?.sessionId,
        reason = failure.first,
        error = failure,
      )
      updateNotification(PassiveCaptureState.FAILED)
      activeCapture?.lifecycle?.cancel()
      activeCapture?.stopSignal?.complete(CaptureStop(failure.first, reachedTargetDuration = false))
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
      nowElapsedMillis = SystemClock.elapsedRealtime(),
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

  /** 仅对当前有效解锁机会尝试一次打开，不积压或自动重试。 */
  private fun beginCapture() {
    val sessionId = UUID.randomUUID().toString()
    val cameraLease = CameraUseGuard.tryAcquire(sessionId)
    if (cameraLease == null) {
      updateRuntime(PassiveCaptureState.WAITING, reason = "CAMERA_BUSY")
      return
    }

    val store = PassiveVideoArtifactStore(applicationContext)
    val temporaryFile = try {
      store.createTemporaryFile(sessionId)
    } catch (error: Throwable) {
      cameraLease.close()
      val message = error.message ?: "无法创建被动视频会话文件。"
      updateRuntime(
        PassiveCaptureState.WAITING,
        reason = "VIDEO_STORAGE_FAILED",
        error = "VIDEO_STORAGE_FAILED" to message,
      )
      return
    }

    val attempt = ActivePassiveCapture(sessionId, temporaryFile, cameraLease)
    capture = attempt
    runtime.update(
      state = PassiveCaptureState.STARTING,
      sessionId = sessionId,
      reason = "UNLOCK_TRIGGERED",
      clearError = true,
    )
    updateNotification(PassiveCaptureState.STARTING)
    attempt.job = serviceScope.launch(start = CoroutineStart.LAZY) { runCapture(attempt) }
    attempt.job?.start()
  }

  /** 按 Start 实际时间计时，只有目标完成并通过 Finalize 才发布产物。 */
  private suspend fun runCapture(attempt: ActivePassiveCapture) {
    val store = PassiveVideoArtifactStore(applicationContext)
    val recordingSession = PassiveVideoRecordingSession(applicationContext, this, attempt.temporaryFile)
    var published = false
    var cameraClosed = false
    var recordingStarted = false
    var resultReason = "CAPTURE_INTERRUPTED"
    var resultError: Pair<String, String>? = null
    var openingJob: Deferred<Long>? = null

    try {
      val activeOpeningJob = serviceScope.async { recordingSession.start() }
      openingJob = activeOpeningJob
      val startedAt = select<Long?> {
        activeOpeningJob.onAwait { it }
        attempt.stopSignal.onAwait { null }
      }
      if (startedAt == null) {
        activeOpeningJob.cancel()
        activeOpeningJob.join()
        resultReason = attempt.stopSignal.await().reason
        return
      }

      recordingStarted = true
      cycleGate?.recordStarted(startedAt)
      attempt.lifecycle.markRecordingStarted()
      runtime.update(
        state = PassiveCaptureState.RECORDING,
        sessionId = attempt.sessionId,
        reason = "VIDEO_STARTED",
        clearError = true,
      )
      updateNotification(PassiveCaptureState.RECORDING)

      val durationMillis = secondsToMillis(checkNotNull(currentConfig).durationSeconds)
      val elapsedSinceStart = (SystemClock.elapsedRealtime() - startedAt).coerceAtLeast(0L)
      val remainingMillis = (durationMillis - elapsedSinceStart).coerceAtLeast(0L)
      val requestedStop = withTimeoutOrNull(remainingMillis) { attempt.stopSignal.await() }
      val end = requestedStop ?: CaptureStop("TARGET_DURATION", reachedTargetDuration = true)
      resultReason = end.reason
      attempt.lifecycle.beginFinalization(end.reachedTargetDuration)
      runtime.update(
        state = PassiveCaptureState.STOPPING,
        sessionId = attempt.sessionId,
        reason = end.reason,
      )
      updateNotification(PassiveCaptureState.STOPPING)

      val finalizeResult = recordingSession.stopAndAwaitFinalize()
      if (!finalizeResult.succeeded) {
        resultReason = "VIDEO_FINALIZE_FAILED"
        resultError = "VIDEO_FINALIZE_FAILED" to (finalizeResult.errorMessage ?: "CameraX 无法正常完成视频文件。")
        return
      }
      try {
        recordingSession.close()
        cameraClosed = true
      } catch (error: Throwable) {
        resultReason = "CAMERA_CLOSE_FAILED"
        resultError = "CAMERA_CLOSE_FAILED" to (error.message ?: "无法释放被动录像会话。")
        return
      }

      if (end.reachedTargetDuration && acceptingEvents) {
        try {
          withContext(Dispatchers.IO) {
            store.publish(attempt.sessionId, attempt.temporaryFile, attempt.lifecycle::claimPublication)
          }
          attempt.lifecycle.completePublication(succeeded = true)
          published = true
          resultReason = "VIDEO_COMPLETED"
        } catch (error: CancellationException) {
          throw error
        } catch (error: Throwable) {
          attempt.lifecycle.completePublication(succeeded = false)
          resultReason = "VIDEO_PUBLISH_FAILED"
          resultError = "VIDEO_PUBLISH_FAILED" to (error.message ?: "无法发布完成的视频文件。")
        }
      } else {
        resultReason = if (end.reachedTargetDuration) "CAPTURE_CANCELLED" else end.reason
      }
    } catch (error: CancellationException) {
      attempt.lifecycle.cancel()
      resultReason = "CAPTURE_CANCELLED"
      throw error
    } catch (error: Throwable) {
      attempt.lifecycle.cancel()
      resultReason = if (recordingStarted) "CAPTURE_FAILED" else "VIDEO_START_FAILED"
      resultError = resultReason to (error.message ?: "被动录像失败。")
    } finally {
      withContext(NonCancellable) {
        if (!published) attempt.lifecycle.cancel()
        openingJob?.cancel()
        openingJob?.join()
        if (!cameraClosed) {
          runCatching { recordingSession.close() }.onFailure { closeError ->
            if (resultError == null) {
              resultReason = "CAMERA_CLOSE_FAILED"
              resultError = "CAMERA_CLOSE_FAILED" to (closeError.message ?: "无法释放被动录像会话。")
            }
          }
        }
        if (!published) store.discardTemporaryFile(attempt.temporaryFile)
        attempt.cameraLease.close()
        if (capture === attempt) capture = null
        if (acceptingEvents) {
          runtime.update(
            state = PassiveCaptureState.WAITING,
            reason = resultReason,
            error = resultError,
            clearError = true,
          )
          updateNotification(PassiveCaptureState.WAITING)
        }
      }
    }
  }

  /** 锁屏中止当前片段，但保留已启用服务等待下一次解锁。 */
  private suspend fun interruptCapture(reason: String) {
    val activeCapture = capture ?: return
    if (activeCapture.stopSignal.isCompleted) return
    activeCapture.lifecycle.cancel()
    if (activeCapture.stopSignal.complete(CaptureStop(reason, reachedTargetDuration = false))) {
      runtime.update(
        state = PassiveCaptureState.STOPPING,
        sessionId = activeCapture.sessionId,
        reason = reason,
      )
      updateNotification(PassiveCaptureState.STOPPING)
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

  /** 更新持续通知正文，不发声、不振动或创建新提醒。 */
  private fun updateNotification(state: PassiveCaptureState) {
    runCatching {
      NotificationManagerCompat.from(applicationContext).notify(
        PassiveCaptureNotifications.NOTIFICATION_ID,
        PassiveCaptureNotifications.build(applicationContext, state),
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

  private fun removeForegroundNotification() {
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    NotificationManagerCompat.from(applicationContext).cancel(PassiveCaptureNotifications.NOTIFICATION_ID)
  }

  /** 把有限秒数按毫秒向上取整，保证正数时长至少有一个原生时钟刻度。 */
  private fun secondsToMillis(seconds: Double): Long =
    kotlin.math.ceil(seconds * MILLIS_PER_SECOND).toLong().coerceAtLeast(1L)

  override fun onDestroy() {
    acceptingEvents = false
    unregisterScreenReceiver()
    capture?.let { activeCapture ->
      activeCapture.lifecycle.cancel()
      activeCapture.stopSignal.complete(CaptureStop("SERVICE_DESTROYED", reachedTargetDuration = false))
    }
    serviceScope.cancel()
    if (::runtime.isInitialized) runtime.onServiceStopped(this)
    super.onDestroy()
  }

  companion object {
    internal const val ACTION_DISABLE = "com.healthcvapp.acquisition.passive.DISABLE"
    private const val MILLIS_PER_SECOND = 1_000.0
  }
}
