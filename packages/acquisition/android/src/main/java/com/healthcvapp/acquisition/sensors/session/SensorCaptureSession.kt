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
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** 绑定一个类型的来源、DataHub 与 CSV 输出，停止结果供并发等待者共享。 */
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
) {
  private enum class Phase { NEW, PREPARING, CAPTURING, STOPPING, COMPLETED, FAILED }

  private val lock = Any()
  private val lifecycleCommands = Mutex()
  private val cleanupScope = CoroutineScope(SupervisorJob() + ioDispatcher)
  private val cleanupStarted = AtomicBoolean(false)
  private var phase = Phase.NEW
  private var accepting = false
  private var startedAtElapsedNanos = 0L
  private var failure: SensorCaptureFailure? = null
  private var failureNotified = false
  private var inFlightCallbacks = 0
  private var callbackDrain: CompletableDeferred<Unit>? = null
  private var dataHub: DataHub<SensorSample>? = null
  private var stopResult: CompletableDeferred<SensorArtifact>? = null
  private var artifact: SensorArtifact? = null

  init {
    require(capacity > 0 && batchSize in 1..capacity) { "invalid DataHub capacity or batch size" }
    require(flushIntervalMillis > 0) { "flushIntervalMillis must be positive" }
  }

  /** 先打开文件与有界队列，再建立正式时间边界并注册设备监听。 */
  suspend fun start() {
    lifecycleCommands.withLock { startLocked() }
  }

  /** 串行完成文件准备与设备注册，避免失败收尾先于迟到注册完成。 */
  private suspend fun startLocked() {
    synchronized(lock) {
      failure?.let { throw it }
      check(phase == Phase.NEW) { "sensor capture session can only start once" }
      phase = Phase.PREPARING
    }

    try {
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
        failure?.let { throw it }
        startedAtElapsedNanos = clock.elapsedRealtimeNanos()
        accepting = true
        phase = Phase.CAPTURING
      }
      synchronized(lock) { failure }?.let { throw it }
      source.register(config, ::onSensorEvent)
      synchronized(lock) { failure }?.let { throw it }
    } catch (error: Throwable) {
      val startFailure = error.asSensorFailure("FILE_OPEN_FAILED", "传感器会话无法启动。")
      markFailed(startFailure)
      throw startFailure
    }
  }

  /** 关闭正式入口并返回同一停止结果；迟到停止不会重新读取活动会话。 */
  suspend fun stop(): SensorArtifact {
    val result: CompletableDeferred<SensorArtifact>
    var startCleanup = false
    synchronized(lock) {
      artifact?.let { return it }
      result = stopResult ?: CompletableDeferred<SensorArtifact>().also { stopResult = it }
      if (failure == null && phase == Phase.CAPTURING) phase = Phase.STOPPING
      accepting = false
      startCleanup = cleanupStarted.compareAndSet(false, true)
    }

    if (startCleanup) cleanupScope.launch { finish(result) }
    return result.await()
  }

  /** 失败时立即关闭入口，异步收尾并阻止部分文件被发布。 */
  fun fail(cause: SensorCaptureFailure) {
    markFailed(cause)
  }

  /** 返回失败后的稳定根因，供控制器在启动竞态中判断。 */
  fun terminalFailure(): SensorCaptureFailure? = synchronized(lock) { failure }

  /** 在回调线程复制三轴和时间，并将结果登记到本会话 DataHub。 */
  private fun onSensorEvent(eventTimestampNanos: Long, values: FloatArray) {
    val receivedAtNanos = clock.elapsedRealtimeNanos()
    val hub = synchronized(lock) {
      if (!accepting || phase != Phase.CAPTURING || eventTimestampNanos < startedAtElapsedNanos) return
      inFlightCallbacks += 1
      dataHub
    }

    try {
      if (values.size < 3) throw SensorCaptureFailure("SENSOR_DATA_INVALID", "传感器事件缺少三个轴值。")
      val sample = SensorSample(
        receivedAtElapsedNanos = receivedAtNanos,
        eventTimestampNanos = eventTimestampNanos,
        systemTimestampNanos = clock.nanoTime(),
        x = values[0],
        y = values[1],
        z = values[2],
      )
      when (hub?.offer(sample)) {
        DataHubOfferResult.ACCEPTED -> Unit
        DataHubOfferResult.CAPACITY_EXCEEDED -> {
          markFailed(SensorCaptureFailure("DATAHUB_CAPACITY_EXCEEDED", "传感器未消费数据已达到有界容量。"))
        }
        DataHubOfferResult.CLOSED -> {
          markFailed(SensorCaptureFailure("DATAHUB_CLOSED", "传感器数据入口已关闭。"))
        }
        DataHubOfferResult.FAILED -> {
          val cause = (hub.failure as? SensorCaptureFailure)
            ?: SensorCaptureFailure("FILE_WRITE_FAILED", "传感器数据消费者失败。", hub.failure)
          markFailed(cause)
        }
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

  /** 同步记录首个失败并只启动一次资源回收。 */
  private fun markFailed(cause: SensorCaptureFailure) {
    var hub: DataHub<SensorSample>? = null
    var result: CompletableDeferred<SensorArtifact>? = null
    var notifyFailure = false
    val startCleanup: Boolean
    synchronized(lock) {
      if (phase == Phase.COMPLETED || failure != null) return
      failure = cause
      accepting = false
      phase = Phase.FAILED
      hub = dataHub
      result = stopResult ?: CompletableDeferred<SensorArtifact>().also { stopResult = it }
      if (!failureNotified) {
        failureNotified = true
        notifyFailure = true
      }
      startCleanup = cleanupStarted.compareAndSet(false, true)
    }
    hub?.fail(cause)
    if (notifyFailure) onFailure(cause)
    if (startCleanup) cleanupScope.launch { finish(checkNotNull(result)) }
  }

  /** 注销监听、等待回调、排空队列并仅在无错误时关闭和发布文件。 */
  private suspend fun finish(result: CompletableDeferred<SensorArtifact>) {
    lifecycleCommands.withLock { finishLocked(result) }
  }

  /** 按生命周期互斥顺序注销来源、排空消费者并完成文件发布或失败。 */
  private suspend fun finishLocked(result: CompletableDeferred<SensorArtifact>) {
    var primaryFailure = synchronized(lock) { failure }
    val hub = synchronized(lock) { dataHub }
    try {
      try {
        source.unregister()
      } catch (error: Throwable) {
        val cleanupFailure = error.asSensorFailure("SENSOR_REGISTRATION_FAILED", "传感器监听注销失败。")
        if (primaryFailure == null) primaryFailure = cleanupFailure else primaryFailure.addSuppressed(cleanupFailure)
      }

      awaitCallbacks()
      primaryFailure = synchronized(lock) { failure ?: primaryFailure }
      if (primaryFailure == null) {
        hub?.closeAndDrain()
      } else {
        hub?.fail(primaryFailure)
        try {
          hub?.closeAndDrain()
        } catch (error: Throwable) {
          if (error !== primaryFailure) primaryFailure.addSuppressed(error)
        }
      }

      primaryFailure = synchronized(lock) { failure ?: primaryFailure }
      try {
        output.close()
      } catch (error: Throwable) {
        val closeFailure = error.asSensorFailure("FILE_FINALIZATION_FAILED", "传感器 CSV 文件关闭失败。")
        if (primaryFailure == null) primaryFailure = closeFailure else primaryFailure.addSuppressed(closeFailure)
      }
      primaryFailure = synchronized(lock) { failure ?: primaryFailure }
      primaryFailure?.let { throw it }

      val startedAtMillis = synchronized(lock) { startedAtElapsedNanos / NANOS_PER_MILLISECOND }
      val artifact = output.publish(startedAtMillis, clock.elapsedRealtimeNanos() / NANOS_PER_MILLISECOND)
      synchronized(lock) {
        this.artifact = artifact
        phase = Phase.COMPLETED
      }
      result.complete(artifact)
    } catch (error: Throwable) {
      val finalFailure = error.asSensorFailure("FILE_FINALIZATION_FAILED", "传感器会话未能正常完成。")
      synchronized(lock) {
        if (failure == null) failure = finalFailure
        phase = Phase.FAILED
        accepting = false
      }
      hub?.fail(finalFailure)
      try {
        output.close()
      } catch (closeError: Throwable) {
        if (closeError !== finalFailure) finalFailure.addSuppressed(closeError)
      }
      notifyFailureOnce(finalFailure)
      result.completeExceptionally(synchronized(lock) { failure ?: finalFailure })
    } finally {
      cleanupScope.cancel()
    }
  }

  /** 等待已进入本会话的回调完成样本快照或失败处理。 */
  private suspend fun awaitCallbacks() {
    val barrier = synchronized(lock) {
      if (inFlightCallbacks == 0) null else CompletableDeferred<Unit>().also { callbackDrain = it }
    }
    barrier?.await()
  }

  /** 对启动或异步处理异常保留稳定错误码及根因。 */
  private fun notifyFailureOnce(cause: SensorCaptureFailure) {
    val shouldNotify = synchronized(lock) {
      if (failureNotified) false else {
        failureNotified = true
        true
      }
    }
    if (shouldNotify) onFailure(cause)
  }

  private companion object {
    const val NANOS_PER_MILLISECOND = 1_000_000L
  }
}

/** 保留已有传感器错误码，未知异常按调用路径映射并记录根因。 */
private fun Throwable.asSensorFailure(code: String, message: String): SensorCaptureFailure =
  this as? SensorCaptureFailure ?: SensorCaptureFailure(code, message, this)
