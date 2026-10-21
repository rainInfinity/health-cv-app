/** 串行控制单一传感器会话并发布权威低频状态。 */

package com.healthcvapp.acquisition.sensors.runtime

import com.healthcvapp.acquisition.sensors.model.SensorArtifact
import com.healthcvapp.acquisition.sensors.model.SensorCaptureFailure
import com.healthcvapp.acquisition.sensors.model.SensorCapabilities
import com.healthcvapp.acquisition.sensors.model.SensorConfig
import com.healthcvapp.acquisition.sensors.model.SensorKind
import com.healthcvapp.acquisition.sensors.model.SensorPhase
import com.healthcvapp.acquisition.sensors.model.SensorSnapshot
import com.healthcvapp.acquisition.sensors.session.AndroidSensorCaptureClock
import com.healthcvapp.acquisition.sensors.session.SensorCaptureClock
import com.healthcvapp.acquisition.sensors.session.SensorCaptureSession
import com.healthcvapp.acquisition.sensors.source.AndroidSensorSource
import java.io.File
import java.util.LinkedHashMap
import java.util.UUID
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

  /** 校验配置和前台边界后创建本类型唯一活动会话。 */
  suspend fun startCapture(samplingPeriodMicros: Double) {
    val request = SensorConfig.fromRequest(kind.wireName, samplingPeriodMicros)
    if (!isForeground()) throw SensorCaptureFailure("APP_NOT_FOREGROUND", "应用不在可采集的前台状态。")
    if (synchronized(lock) {
        activeSession != null || phase == SensorPhase.STARTING || phase == SensorPhase.CAPTURING || phase == SensorPhase.STOPPING
      }
    ) {
      throw SensorCaptureFailure("SENSOR_BUSY", "${kind.wireName} 已有活动采集会话。")
    }

    commands.withLock {
      synchronized(lock) {
        if (activeSession != null || phase == SensorPhase.STARTING || phase == SensorPhase.CAPTURING || phase == SensorPhase.STOPPING) {
          throw SensorCaptureFailure("SENSOR_BUSY", "${kind.wireName} 已有活动采集会话。")
        }
      }

      if (!isForeground()) {
        throw SensorCaptureFailure("APP_NOT_FOREGROUND", "应用不在可采集的前台状态。")
      }
      val capability = getCapabilities()
      if (!capability.available) {
        throw SensorCaptureFailure("SENSOR_UNAVAILABLE", "设备不提供 ${kind.wireName} 默认传感器。")
      }
      val config = request.withSensorMinDelay(capability.minSamplingPeriodMicros ?: 0)
      val sessionId = UUID.randomUUID().toString()
      lateinit var session: SensorCaptureSession
      session = SensorCaptureSession(
        filesDirectory = applicationFilesDirectory,
        config = config,
        source = source,
        sessionId = sessionId,
        clock = clock,
        ioDispatcher = ioDispatcher,
        consumerDispatcher = consumerDispatcher,
        onFailure = { failure -> onSessionFailure(session, failure) },
      )
      updateSnapshot {
        activeSession = session
        lastSession = session
        phase = SensorPhase.STARTING
        requestedSamplingPeriodMicros = config.requestedSamplingPeriodMicros
        registeredSamplingPeriodMicros = config.registeredSamplingPeriodMicros
        errorCode = null
        errorMessage = null
      }

      try {
        session.start()
        session.terminalFailure()?.let { throw it }
        synchronized(lock) {
          if (activeSession !== session || phase != SensorPhase.STARTING) {
            throw SensorCaptureFailure("SENSOR_REGISTRATION_FAILED", "传感器在开始期间已中断。")
          }
        }
        updateSnapshot { phase = SensorPhase.CAPTURING }
      } catch (error: Throwable) {
        val failure = error.asSensorFailure("SENSOR_REGISTRATION_FAILED", "传感器无法开始采集。")
        try {
          session.stop()
        } catch (_: Throwable) {
          // 等待启动失败的监听和输出资源完成收尾；保留启动根因。
        }
        updateSnapshot {
          if (activeSession === session) activeSession = null
          lastSession = session
          phase = SensorPhase.FAILED
          errorCode = failure.code
          errorMessage = failure.message ?: "传感器无法开始采集。"
        }
        throw failure
      }
    }
  }

  /** 停止调用时绑定当前会话，等待关闭、尾批和文件提升完成。 */
  suspend fun stopCapture(): SensorArtifact {
    val target = synchronized(lock) {
      activeSession ?: lastSession ?: throw SensorCaptureFailure("SENSOR_NOT_CAPTURING", "当前没有传感器采集会话。")
    }
    synchronized(lock) {
      if (activeSession === target && phase != SensorPhase.FAILED) phase = SensorPhase.STOPPING
      dispatchSnapshot(snapshotLocked())
    }

    return commands.withLock {
      try {
        val artifact = target.stop()
        updateSnapshot {
          completedArtifacts[target.sessionId] = artifact
          if (activeSession === target) {
            activeSession = null
            lastSession = target
            lastArtifact = artifact
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
            activeSession = null
            lastSession = target
            phase = SensorPhase.FAILED
            errorCode = failure.code
            errorMessage = failure.message ?: "传感器采集未能正常完成。"
          }
        }
        throw failure
      }
    }
  }

  /** 返回本进程内按会话顺序完成的本类型产物，不扫描磁盘。 */
  fun listArtifacts(): List<SensorArtifact> = synchronized(lock) { completedArtifacts.values.toList() }

  /** 宿主暂停或销毁时失败收尾当前会话，不尝试自动恢复。 */
  fun interrupt(cause: SensorCaptureFailure) {
    val session = synchronized(lock) { activeSession } ?: return
    session.fail(cause)
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
    controllerScope.launch {
      commands.withLock {
        if (synchronized(lock) { activeSession !== session }) return@withLock
        try {
          session.stop()
        } catch (_: Throwable) {
          // 会话已记录终态错误；等待源监听、回调和 writer 释放。
        }
        updateSnapshot {
          if (activeSession === session) activeSession = null
          lastSession = session
          phase = SensorPhase.FAILED
          errorCode = failure.code
          errorMessage = failure.message ?: "传感器采集失败。"
        }
      }
    }
  }

}

/** 保留会话明确错误码，未知异常按当前命令映射并记录根因。 */
private fun Throwable.asSensorFailure(code: String, message: String): SensorCaptureFailure =
  this as? SensorCaptureFailure ?: SensorCaptureFailure(code, message, this)
