/** 管理单一传感器的正式窗口、有界接收、失败收尾与停止屏障。 */

package com.healthcvapp.acquisition.sensors.session

import com.healthcvapp.acquisition.pipeline.DataHub
import com.healthcvapp.acquisition.pipeline.DataHubOfferResult
import com.healthcvapp.acquisition.sensors.model.SensorArtifact
import com.healthcvapp.acquisition.sensors.model.SensorCaptureFailure
import com.healthcvapp.acquisition.sensors.model.SensorConfig
import com.healthcvapp.acquisition.sensors.model.SensorSample
import com.healthcvapp.acquisition.sensors.output.SensorSessionOutput
import com.healthcvapp.acquisition.sensors.source.AndroidSensorSource
import java.io.File
import java.util.UUID
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** 正式接受的样本事实；所有时间均为原始纳秒，不按请求频率推算。 */
internal data class SensorCaptureStatistics(
  val sampleCount: Long,
  val firstReceivedAtElapsedNanos: Long?,
  val lastReceivedAtElapsedNanos: Long?,
  val firstEventTimestampNanos: Long?,
  val lastEventTimestampNanos: Long?,
)

/** 一个类型只注册一次来源，观测与正式文件共享原始样本。 */
internal class SensorCaptureSession(
  filesDirectory: File,
  val config: SensorConfig,
  private val source: AndroidSensorSource,
  val sessionId: String = UUID.randomUUID().toString(),
  private val clock: SensorCaptureClock = AndroidSensorCaptureClock,
  private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
  private val consumerDispatcher: CoroutineDispatcher = Dispatchers.IO,
  private val capacity: Int = 256,
  private val batchSize: Int = 50,
  private val flushIntervalMillis: Long = 1_000,
  private val output: SensorSessionOutput = SensorSessionOutput(
    filesDirectory = filesDirectory,
    kind = config.kind,
    sessionId = sessionId,
    config = config,
    ioDispatcher = ioDispatcher,
  ),
  private val onFailure: (SensorCaptureFailure) -> Unit = {},
  private val onSample: ((SensorSample) -> Unit)? = null,
) {
  private val lock = Any()
  private val lifecycleCommands = Mutex()
  private val cleanupScope = CoroutineScope(SupervisorJob() + ioDispatcher)
  private var observing = false
  private var registered = false
  private var closing = false
  private var released = false
  private var accepting = false
  private var openedWindow = false
  private var prepared = false
  private var startedAtElapsedNanos = 0L
  private var endsAtElapsedNanos = Long.MAX_VALUE
  private var groupIsActive: (() -> Boolean)? = null
  private var failure: SensorCaptureFailure? = null
  private var failureNotified = false
  private var inFlightCallbacks = 0
  private var callbackDrain: CompletableDeferred<Unit>? = null
  private var dataHub: DataHub<SensorSample>? = null
  private var closeResult: CompletableDeferred<SensorArtifact?>? = null
  private var artifact: SensorArtifact? = null
  private var count = 0L
  private var firstReceived: Long? = null
  private var lastReceived: Long? = null
  private var firstEvent: Long? = null
  private var lastEvent: Long? = null

  init {
    require(capacity > 0 && batchSize in 1..capacity) { "invalid DataHub capacity or batch size" }
    require(flushIntervalMillis > 0) { "flushIntervalMillis must be positive" }
  }

  /** 独立入口保留先准备文件、自取起点、再注册监听的语义。 */
  suspend fun start() = lifecycleCommands.withLock {
    check(!observing && !closing)
    try {
      prepareOutputLocked()
      synchronized(lock) {
        startedAtElapsedNanos = clock.elapsedRealtimeNanos()
        openedWindow = true
        accepting = true
      }
      observeLocked()
    } catch (error: Throwable) {
      val cause = error.asSensorFailure("SENSOR_REGISTRATION_FAILED", "传感器会话无法启动。")
      markFailed(cause)
      throw cause
    }
  }

  /** 只注册原生观测，不创建 CSV 或正式队列。 */
  suspend fun observe() = lifecycleCommands.withLock {
    check(!observing && !closing)
    try {
      observeLocked()
    } catch (error: Throwable) {
      val cause = error.asSensorFailure("SENSOR_REGISTRATION_FAILED", "传感器观测无法启动。")
      markFailed(cause)
      throw cause
    }
  }

  private fun observeLocked() {
    synchronized(lock) {
      failure?.let { throw it }
      observing = true
      registered = true
    }
    source.register(config, ::onSensorEvent)
    synchronized(lock) { failure }?.let { throw it }
  }

  /** writer 准备期间观测继续，但正式保存入口保持关闭。 */
  suspend fun prepareOutput() = lifecycleCommands.withLock {
    try {
      prepareOutputLocked()
    } catch (error: Throwable) {
      val cause = error.asSensorFailure("FILE_OPEN_FAILED", "传感器输出准备失败。")
      markFailed(cause)
      throw cause
    }
  }

  private suspend fun prepareOutputLocked() {
    synchronized(lock) {
      failure?.let { throw it }
      check(!closing && !openedWindow)
      if (prepared) return
    }
    output.open()
    val hub = DataHub<SensorSample>(
      capacity = capacity,
      batchSize = batchSize,
      intervalMillis = flushIntervalMillis,
      dispatcher = consumerDispatcher,
    ) { samples ->
      try {
        output.writeBatch(samples)
      } catch (error: Throwable) {
        val cause = error.asSensorFailure("FILE_WRITE_FAILED", "传感器 CSV 写入失败。")
        markFailed(cause)
        throw cause
      }
    }
    synchronized(lock) {
      dataHub = hub
      prepared = true
      failure?.let { throw it }
    }
  }

  /** 安装共同接收窗口；只有组内激活后才接受，事件时间也使用双半开边界。 */
  fun openWindow(start: Long, end: Long, isActive: () -> Boolean) = synchronized(lock) {
    failure?.let { throw it }
    require(start >= 0 && end > start)
    check(observing && prepared && !closing && !openedWindow)
    startedAtElapsedNanos = start
    endsAtElapsedNanos = end
    groupIsActive = isActive
    openedWindow = true
    accepting = true
  }

  fun sealEntrance() = synchronized(lock) { accepting = false }

  /** 撤销未开窗文件但保留监听，之后可以重新准备。 */
  suspend fun discardPreparedOutput() = lifecycleCommands.withLock {
    synchronized(lock) { check(!openedWindow && !closing) }
    dataHub?.closeAndDrain()
    output.discard()
    synchronized(lock) {
      dataHub = null
      prepared = false
    }
  }

  fun statistics(): SensorCaptureStatistics = synchronized(lock) {
    SensorCaptureStatistics(count, firstReceived, lastReceived, firstEvent, lastEvent)
  }

  /** 错误与资源释放分别表达，不能把历史文件失败当成监听仍未注销。 */
  fun resourcesReleased(): Boolean = synchronized(lock) { released }

  suspend fun stop(): SensorArtifact = closeObservation()
    ?: throw SensorCaptureFailure("SENSOR_NOT_CAPTURING", "当前会话没有正式采集窗口。")

  /** 并发关闭共享一次完整屏障；注销失败允许再次发起关闭。 */
  suspend fun closeObservation(): SensorArtifact? {
    var startCleanup = false
    val result = synchronized(lock) {
      accepting = false
      observing = false
      closing = true
      closeResult ?: CompletableDeferred<SensorArtifact?>().also { deferred ->
        closeResult = deferred
        startCleanup = true
      }
    }
    if (startCleanup) cleanupScope.launch { finish(result) }
    return result.await()
  }

  fun fail(cause: SensorCaptureFailure) = markFailed(cause)

  fun terminalFailure(): SensorCaptureFailure? = synchronized(lock) { failure }

  private fun onSensorEvent(eventTimestampNanos: Long, values: FloatArray) {
    val receivedAtNanos = clock.elapsedRealtimeNanos()
    val save = synchronized(lock) {
      if (!observing || closing || failure != null) return
      inFlightCallbacks += 1
      accepting && eventTimestampNanos >= startedAtElapsedNanos &&
        (groupIsActive == null || (
          groupIsActive!!.invoke() &&
            receivedAtNanos >= startedAtElapsedNanos && receivedAtNanos < endsAtElapsedNanos &&
            eventTimestampNanos < endsAtElapsedNanos
          ))
    }
    try {
      if (!save && onSample == null) return
      if (values.size < 3) throw SensorCaptureFailure("SENSOR_DATA_INVALID", "传感器事件缺少三个轴值。")
      val sample = SensorSample(receivedAtNanos, eventTimestampNanos, clock.nanoTime(), values[0], values[1], values[2])
      onSample?.invoke(sample)
      if (!save) return
      val hub = synchronized(lock) { dataHub }
      when (hub?.offer(sample)) {
        DataHubOfferResult.ACCEPTED -> synchronized(lock) {
          count += 1
          if (firstReceived == null) {
            firstReceived = receivedAtNanos
            firstEvent = eventTimestampNanos
          }
          lastReceived = receivedAtNanos
          lastEvent = eventTimestampNanos
        }
        DataHubOfferResult.CAPACITY_EXCEEDED ->
          markFailed(SensorCaptureFailure("DATAHUB_CAPACITY_EXCEEDED", "传感器未消费数据已达到有界容量。"))
        DataHubOfferResult.CLOSED ->
          markFailed(SensorCaptureFailure("DATAHUB_CLOSED", "传感器数据入口已关闭。"))
        DataHubOfferResult.FAILED ->
          markFailed(hub.failure as? SensorCaptureFailure
            ?: SensorCaptureFailure("FILE_WRITE_FAILED", "传感器数据消费者失败。", hub.failure))
        null -> markFailed(SensorCaptureFailure("DATAHUB_UNAVAILABLE", "传感器数据队列尚未就绪。"))
      }
    } catch (error: Throwable) {
      markFailed(error.asSensorFailure("SENSOR_DATA_INVALID", "传感器样本无效。"))
    } finally {
      synchronized(lock) {
        inFlightCallbacks -= 1
        if (inFlightCallbacks == 0) callbackDrain?.complete(Unit)
      }
    }
  }

  private fun markFailed(cause: SensorCaptureFailure) {
    val notify = synchronized(lock) {
      if (released || failure != null) return
      failure = cause
      accepting = false
      observing = false
      if (failureNotified) false else {
        failureNotified = true
        true
      }
    }
    dataHub?.fail(cause)
    if (notify) onFailure(cause)
    cleanupScope.launch {
      try { closeObservation() } catch (_: Throwable) {
        // 根因仍由终态查询和关闭命令返回，资源失败允许再次关闭。
      }
    }
  }

  private suspend fun finish(result: CompletableDeferred<SensorArtifact?>) = lifecycleCommands.withLock {
    var cleanupFailure: SensorCaptureFailure? = null
    try {
      if (registered) {
        try {
          source.unregister()
          registered = false
        } catch (error: Throwable) {
          cleanupFailure = error.asSensorFailure("SENSOR_REGISTRATION_FAILED", "传感器监听注销失败。")
        }
      }
      awaitCallbacks()
      val hub = synchronized(lock) { dataHub }
      synchronized(lock) { failure }?.let { hub?.fail(it) }
      try {
        hub?.closeAndDrain()
      } catch (error: Throwable) {
        synchronized(lock) {
          if (failure == null) failure = error.asSensorFailure("FILE_WRITE_FAILED", "传感器尾批写入失败。")
        }
      }
      synchronized(lock) { dataHub = null }
      var outputClosed = false
      try {
        output.close()
        outputClosed = true
      } catch (error: Throwable) {
        val cause = error.asSensorFailure("FILE_FINALIZATION_FAILED", "传感器 CSV 关闭失败。")
        if (cleanupFailure == null) cleanupFailure = cause else cleanupFailure.addSuppressed(cause)
      }
      synchronized(lock) { released = !registered && outputClosed }
      cleanupFailure?.let { throw it }
      synchronized(lock) { failure }?.let { throw it }
      if (openedWindow && artifact == null) {
        artifact = output.publish(startedAtElapsedNanos / NANOS_PER_MILLISECOND, clock.elapsedRealtimeNanos() / NANOS_PER_MILLISECOND)
      } else if (!openedWindow) {
        output.discard()
      }
      result.complete(artifact)
    } catch (error: Throwable) {
      val cause = error.asSensorFailure("FILE_FINALIZATION_FAILED", "传感器会话未能正常完成。")
      val notify = synchronized(lock) {
        if (failure == null) failure = cause
        if (failureNotified) false else { failureNotified = true; true }
      }
      if (notify) onFailure(synchronized(lock) { failure } ?: cause)
      synchronized(lock) {
        if (!released && closeResult === result) closeResult = null
      }
      result.completeExceptionally(synchronized(lock) { failure } ?: cause)
    } finally {
      synchronized(lock) {
        if (!released && closeResult === result) closeResult = null
      }
    }
  }

  private suspend fun awaitCallbacks() {
    val barrier = synchronized(lock) {
      if (inFlightCallbacks == 0) null else CompletableDeferred<Unit>().also { callbackDrain = it }
    }
    barrier?.await()
  }

  private companion object {
    const val NANOS_PER_MILLISECOND = 1_000_000L
  }
}

/** 保留已有传感器错误码，未知异常按调用路径映射并记录根因。 */
private fun Throwable.asSensorFailure(code: String, message: String): SensorCaptureFailure =
  this as? SensorCaptureFailure ?: SensorCaptureFailure(code, message, this)
