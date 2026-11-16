/** 串行控制单一传感器会话并发布权威低频状态。 */

package com.healthcvapp.acquisition.sensors.runtime

import com.healthcvapp.acquisition.sensors.model.SensorArtifact
import com.healthcvapp.acquisition.sensors.model.SensorCaptureFailure
import com.healthcvapp.acquisition.sensors.model.SensorCapabilities
import com.healthcvapp.acquisition.sensors.model.SensorConfig
import com.healthcvapp.acquisition.sensors.model.SensorKind
import com.healthcvapp.acquisition.sensors.model.SensorPhase
import com.healthcvapp.acquisition.sensors.model.SensorSnapshot
import com.healthcvapp.acquisition.sensors.model.SensorSample
import com.healthcvapp.acquisition.sensors.session.AndroidSensorCaptureClock
import com.healthcvapp.acquisition.sensors.session.SensorCaptureClock
import com.healthcvapp.acquisition.sensors.session.SensorCaptureSession
import com.healthcvapp.acquisition.sensors.source.AndroidSensorSource
import java.io.File
import java.util.LinkedHashMap
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** 负责单类型设备、活动会话、停止结果与订阅者，不共享其它类型状态。 */
internal class SensorController(
  private val kind: SensorKind,
  filesDirectory: File,
  private val source: AndroidSensorSource,
  private val isForeground: () -> Boolean,
  private val controllerDispatcher: CoroutineDispatcher = Dispatchers.Main.immediate,
  private val clock: SensorCaptureClock = AndroidSensorCaptureClock,
  private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
  private val consumerDispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
  private val lock = Any()
  private val commands = Mutex()
  private val controllerScope = CoroutineScope(SupervisorJob() + controllerDispatcher)
  private val listenerIds = AtomicLong(0)
  private val listeners = ConcurrentHashMap<Double, (SensorSnapshot) -> Unit>()
  private val completedArtifacts = LinkedHashMap<String, SensorArtifact>()
  private val applicationFilesDirectory = filesDirectory
  private var phase = SensorPhase.IDLE
  private var activeSession: SensorCaptureSession? = null
  private var lastSession: SensorCaptureSession? = null
  private data class OwnedSession(
    val ownerId: String,
    val session: SensorCaptureSession,
    val onLifecycleInterrupt: ((SensorCaptureFailure) -> Unit)?,
  )
  private val sessions = LinkedHashMap<String, OwnedSession>()
  private var lastArtifact: SensorArtifact? = null
  private var requestedSamplingPeriodMicros: Int? = null
  private var registeredSamplingPeriodMicros: Int? = null
  private var errorCode: String? = null
  private var errorMessage: String? = null

  /** 返回本类型真实默认设备能力，不启动采样。 */
  fun getCapabilities(): SensorCapabilities = source.getCapabilities(kind)

  /** 返回权威低频状态快照，不触发设备副作用。 */
  fun getSnapshot(): SensorSnapshot = synchronized(lock) { snapshotLocked() }

  /** 订阅本类型状态转换并立即排队发送当前快照。 */
  fun addListener(listener: (SensorSnapshot) -> Unit): Double {
    val listenerId = listenerIds.incrementAndGet().toDouble()
    listeners[listenerId] = listener
    dispatchSnapshot(listenerId, getSnapshot())
    return listenerId
  }

  /** 解除指定状态订阅，不影响采集或其它客户端。 */
  fun removeListener(listenerId: Double) {
    listeners.remove(listenerId)
  }

  /** 独立采集也必须绑定客户端和确切会话，不存在按类型停止旁路。 */
  suspend fun startCapture(ownerId: String, sessionId: String, samplingPeriodMicros: Double) {
    acquire(ownerId, sessionId, SensorConfig.fromRequest(kind.wireName, samplingPeriodMicros), null, {}, true)
  }

  /** 同类型互斥取得观测，准备期不创建正式文件。 */
  suspend fun reserve(
    ownerId: String,
    sessionId: String,
    config: SensorConfig,
    onSample: (SensorSample) -> Unit,
    onFailure: (SensorCaptureFailure) -> Unit,
  ): SensorCaptureSession = acquire(ownerId, sessionId, config, onSample, onFailure, false)

  private suspend fun acquire(
    ownerId: String,
    sessionId: String,
    request: SensorConfig,
    onSample: ((SensorSample) -> Unit)?,
    onFailure: (SensorCaptureFailure) -> Unit,
    independent: Boolean,
  ): SensorCaptureSession {
    require(ownerId.isNotBlank() && sessionId.isNotBlank() && request.kind == kind)
    if (!isForeground()) throw SensorCaptureFailure("APP_NOT_FOREGROUND", "应用不在可采集的前台状态。")
    if (synchronized(lock) { activeSession != null }) {
      throw SensorCaptureFailure("SENSOR_BUSY", "${kind.wireName} 已有活动会话。")
    }
    return commands.withLock {
      synchronized(lock) {
        if (activeSession != null) throw SensorCaptureFailure("SENSOR_BUSY", "${kind.wireName} 已有活动会话。")
        if (sessions.containsKey(sessionId)) throw SensorCaptureFailure("SENSOR_SESSION_MISMATCH", "不能重复使用传感器会话标识。")
      }
      if (!isForeground()) throw SensorCaptureFailure("APP_NOT_FOREGROUND", "应用不在可采集的前台状态。")
      val capability = getCapabilities()
      if (!capability.available) throw SensorCaptureFailure("SENSOR_UNAVAILABLE", "设备不提供 ${kind.wireName} 默认传感器。")
      val config = request.withSensorMinDelay(capability.minSamplingPeriodMicros ?: 0)
      lateinit var session: SensorCaptureSession
      session = SensorCaptureSession(
        filesDirectory = applicationFilesDirectory,
        config = config,
        source = source,
        sessionId = sessionId,
        clock = clock,
        ioDispatcher = ioDispatcher,
        consumerDispatcher = consumerDispatcher,
        onSample = onSample,
        onFailure = { failure ->
          onSessionFailure(session, failure)
          onFailure(failure)
        },
      )
      updateSnapshot {
        sessions[sessionId] = OwnedSession(ownerId, session, if (independent) null else onFailure)
        activeSession = session
        lastSession = session
        phase = SensorPhase.STARTING
        requestedSamplingPeriodMicros = config.requestedSamplingPeriodMicros
        registeredSamplingPeriodMicros = config.registeredSamplingPeriodMicros
        errorCode = null
        errorMessage = null
      }
      try {
        if (independent) session.start() else session.observe()
        session.terminalFailure()?.let { throw it }
        updateSnapshot {
          session.terminalFailure()?.let { throw it }
          if (activeSession !== session || phase != SensorPhase.STARTING) {
            throw SensorCaptureFailure("SENSOR_REGISTRATION_FAILED", "传感器在开始期间已中断。")
          }
          phase = SensorPhase.CAPTURING
        }
        session
      } catch (error: Throwable) {
        val failure = error.asSensorFailure("SENSOR_REGISTRATION_FAILED", "传感器无法开始采集。")
        try { session.closeObservation() } catch (_: Throwable) {
          // 保留启动根因；未释放资源继续占用本类型并允许确切会话重试关闭。
        }
        updateSnapshot {
          if (session.resourcesReleased() && activeSession === session) activeSession = null
          phase = SensorPhase.FAILED
          errorCode = failure.code
          errorMessage = failure.message
        }
        throw failure
      }
    }
  }

  suspend fun stopCapture(ownerId: String, sessionId: String): SensorArtifact {
    val artifact = release(ownerId, sessionId)
    synchronized(lock) { sessions[sessionId]?.session?.terminalFailure() }?.let { throw it }
    return artifact ?: throw SensorCaptureFailure("SENSOR_NOT_CAPTURING", "当前会话没有正式采集窗口。")
  }

  /** reserve 抛出前已经登记的对象也可核查，不能把没有返回对象视为释放成功。 */
  fun isReserved(ownerId: String, sessionId: String): Boolean = synchronized(lock) {
    val owned = sessions[sessionId]
    owned != null && owned.ownerId == ownerId && !owned.session.resourcesReleased()
  }

  /** 关闭确切轮次；历史停止只访问自己的对象，不读取当前类型占用者。 */
  suspend fun release(ownerId: String, sessionId: String): SensorArtifact? {
    val target = synchronized(lock) {
      val owned = sessions[sessionId]
        ?: throw SensorCaptureFailure("SENSOR_SESSION_MISMATCH", "不存在指定的传感器会话。")
      if (owned.ownerId != ownerId) throw SensorCaptureFailure("SENSOR_NOT_OWNER", "不能停止其他调用方的传感器会话。")
      owned.session
    }
    target.sealEntrance()
    updateSnapshot {
      if (activeSession === target && phase != SensorPhase.FAILED) phase = SensorPhase.STOPPING
    }
    return commands.withLock {
      if (target.resourcesReleased() && target.terminalFailure() != null) {
        updateSnapshot { if (activeSession === target) activeSession = null }
        return@withLock null
      }
      try {
        val artifact = target.closeObservation()
        updateSnapshot {
          if (artifact != null) completedArtifacts[target.sessionId] = artifact
          if (activeSession === target) {
            activeSession = null
            lastSession = target
            if (artifact != null) lastArtifact = artifact
            phase = SensorPhase.IDLE
            errorCode = null
            errorMessage = null
          }
        }
        artifact
      } catch (error: Throwable) {
        val failure = error.asSensorFailure("FILE_FINALIZATION_FAILED", "传感器采集未能正常完成。")
        updateSnapshot {
          if (activeSession === target) {
            if (target.resourcesReleased()) activeSession = null
            lastSession = target
            phase = SensorPhase.FAILED
            errorCode = failure.code
            errorMessage = failure.message
          }
        }
        throw failure
      }
    }
  }

  /** 返回本进程内按会话顺序完成的本类型产物，不扫描磁盘。 */
  fun listArtifacts(): List<SensorArtifact> = synchronized(lock) { completedArtifacts.values.toList() }

  /** 独立源按失败收尾；显式组内源由协调器保留中断原因并定稿已接受数据。 */
  fun interrupt(cause: SensorCaptureFailure) {
    val owned = synchronized(lock) {
      activeSession?.let { sessions[it.sessionId] }
    } ?: return
    val groupInterrupt = owned.onLifecycleInterrupt
    if (groupInterrupt == null) {
      owned.session.fail(cause)
    } else {
      owned.session.sealEntrance()
      groupInterrupt(cause)
    }
  }

  /** 在状态锁内更新字段并按同一顺序派发快照。 */
  private fun updateSnapshot(change: () -> Unit) {
    synchronized(lock) {
      change()
      dispatchSnapshot(snapshotLocked())
    }
  }

  /** 将当前状态转换为无样本字段的低频快照。 */
  private fun snapshotLocked() = SensorSnapshot(
    kind = kind,
    phase = phase,
    sessionId = activeSession?.sessionId ?: lastSession?.sessionId,
    requestedSamplingPeriodMicros = requestedSamplingPeriodMicros,
    registeredSamplingPeriodMicros = registeredSamplingPeriodMicros,
    errorCode = errorCode,
    errorMessage = errorMessage,
    lastArtifact = lastArtifact,
  )

  /** 将快照派发给所有当前订阅者。 */
  private fun dispatchSnapshot(snapshot: SensorSnapshot) {
    controllerScope.launch {
      for ((listenerId, _) in listeners) dispatchSnapshot(listenerId, snapshot)
    }
  }

  /** 在控制器调度器通知单个订阅者；订阅者异常不影响设备或其它监听。 */
  private fun dispatchSnapshot(listenerId: Double, snapshot: SensorSnapshot) {
    controllerScope.launch {
      listeners[listenerId]?.let { listener ->
        try {
          listener(snapshot)
        } catch (_: Throwable) {
          // 订阅者异常不能中断设备控制或其它低频通知。
        }
      }
    }
  }

  /** 收到会话失败后先发布失败状态，再等待该会话彻底回收。 */
  private fun onSessionFailure(session: SensorCaptureSession, failure: SensorCaptureFailure) {
    updateSnapshot {
      if (activeSession === session) {
        phase = SensorPhase.FAILED
        errorCode = failure.code
        errorMessage = failure.message ?: "传感器采集失败。"
      }
    }
    val owner = synchronized(lock) { sessions[session.sessionId]?.ownerId } ?: return
    controllerScope.launch {
      try {
        release(owner, session.sessionId)
      } catch (_: Throwable) {
        // 原始错误和未释放会话保留；后续关闭可以重试资源屏障。
      }
    }
  }

}

/** 保留会话明确错误码，未知异常按当前命令映射并记录根因。 */
private fun Throwable.asSensorFailure(code: String, message: String): SensorCaptureFailure =
  this as? SensorCaptureFailure ?: SensorCaptureFailure(code, message, this)
