/** 血压本轮拥有覆盖与 IMU 准入、共同接收窗口及组内完整关闭。 */
package com.healthcvapp.acquisition.ppg.bloodpressure

import com.healthcvapp.acquisition.ppg.bloodpressure.imu.BloodPressureImuProcessor
import com.healthcvapp.acquisition.ppg.fingertip.FingertipCoverage
import com.healthcvapp.acquisition.ppg.fingertip.FingertipCoverageGate
import com.healthcvapp.acquisition.ppg.fingertip.FingertipFinishResult
import com.healthcvapp.acquisition.ppg.fingertip.FingertipHost
import com.healthcvapp.acquisition.ppg.fingertip.FingertipSignalConfig
import com.healthcvapp.acquisition.ppg.fingertip.FingertipSnapshotData
import com.healthcvapp.acquisition.ppg.model.PPGArtifact
import com.healthcvapp.acquisition.ppg.model.PPGCaptureRecord
import com.healthcvapp.acquisition.ppg.model.PPGConfigSummary
import com.healthcvapp.acquisition.ppg.session.PPGCaptureFailure
import com.healthcvapp.acquisition.ppg.session.PPGCaptureSession
import com.healthcvapp.acquisition.sensors.model.SensorArtifact
import com.healthcvapp.acquisition.sensors.model.SensorCaptureFailure
import com.healthcvapp.acquisition.sensors.model.SensorKind
import com.healthcvapp.acquisition.sensors.session.SensorCaptureSession
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** 命令与既有相机串行；回调只更新本轮有限事实，计时不依赖 JS。 */
internal class BloodPressureController(
  private val scope: CoroutineScope,
  private val commands: Mutex,
  private val host: FingertipHost,
  private val sensors: BloodPressureSensors,
  private val clock: () -> Long,
) {
  /** 每次重新贴胸准备都有新的来源身份，旧回调只能落在旧令牌。 */
  private class Observation {
    val accId = UUID.randomUUID().toString()
    val gyroId = UUID.randomUUID().toString()
    val live = AtomicBoolean(true)
    var acc: SensorCaptureSession? = null
    var gyro: SensorCaptureSession? = null
    var ready = false
  }

  /** 正式窗口与文件身份均仅归本轮所有，不查询历史列表。 */
  private class Round(val owner: String, val id: String, val duration: Long, val config: PPGConfigSummary) {
    val gate = FingertipCoverageGate()
    val imu = BloodPressureImuProcessor()
    val activated = AtomicBoolean(false)
    var phase = "observing_finger"
    var observation: Observation? = null
    var resetting = false
    var session: PPGCaptureSession? = null
    var start: Long? = null
    var end: Long? = null
    var stopped: Long? = null
    var reason: String? = null
    var failure: PPGCaptureFailure? = null
    var resourceFailure: PPGCaptureFailure? = null
    var artifact: PPGArtifact? = null
    var accArtifact: SensorArtifact? = null
    var resourcesReleased = false
    var cameraReleased = false
    var cancelled = false
    var lostSince: Long? = null
    var count = 0L
    var first: Long? = null
    var last: Long? = null
    var lastNotify = Long.MIN_VALUE
    var timer: Job? = null
    var barrier: CompletableDeferred<FingertipFinishResult>? = null
  }

  private val lock = Any()
  private var round: Round? = null
  private val ids = AtomicLong()
  private val listeners = LinkedHashMap<Long, Pair<String, (BloodPressureSnapshotData?) -> Unit>>()

  /** 显式入口只建立覆盖观测，不提前注册 IMU 或创建正式文件。 */
  suspend fun start(owner: String, duration: Long): String = commands.withLock {
    if (duration !in 1L..86_400_000L) throw PPGCaptureFailure("BLOOD_PRESSURE_CONFIG_INVALID", "血压时长必须为有效正整数毫秒。")
    synchronized(lock) {
      if (round?.let { it.phase in ACTIVE || !it.resourcesReleased } == true) {
        throw PPGCaptureFailure("CAPTURE_STATE_INVALID", "血压上一轮尚未完整关闭。")
      }
      val config = host.configuration(owner) ?: throw PPGCaptureFailure("CAMERA_NOT_READY", "调用方尚未持有就绪的相机预览。")
      if (config.blockLayout.blockCount != 1L) throw PPGCaptureFailure("BLOOD_PRESSURE_CONFIG_INVALID", "血压采集必须使用单块布局。")
      val current = Round(owner, UUID.randomUUID().toString(), duration, config)
      round = current
      current.timer = scope.launch { while (true) { delay(50); tick(current) } }
      notifyLocked(current, true)
      current.id
    }
  }

  /** 读取仅属于本调用方的低频事实，没有设备副作用。 */
  fun snapshot(owner: String): BloodPressureSnapshotData? = synchronized(lock) {
    round?.takeIf { it.owner == owner }?.let(::snapshotLocked)
  }

  /** 注册本所有者订阅，原生观测及截止不依赖订阅数量。 */
  fun addListener(owner: String, listener: (BloodPressureSnapshotData?) -> Unit): Long = synchronized(lock) {
    val id = ids.incrementAndGet()
    listeners[id] = owner to listener
    listener(round?.takeIf { it.owner == owner }?.let(::snapshotLocked))
    id
  }

  /** 解除低频通知而不停止观测。 */
  fun removeListener(id: Long) = synchronized(lock) { listeners.remove(id); Unit }

  /** 关闭意图立即撤销共同激活，先于任何等待中的准备命令。 */
  fun requestEnd(owner: String, id: String? = null, reason: String = "user_stopped") = synchronized(lock) {
    val current = round?.takeIf { it.owner == owner && (id == null || id == it.id) } ?: return@synchronized
    if (current.phase !in ACTIVE) return@synchronized
    sealLocked(current, reason)
  }

  /** 旧轮或非所有者停止无副作用，并发关闭复用同一屏障。 */
  suspend fun stop(owner: String, id: String? = null, reason: String = "user_stopped"): FingertipFinishResult? {
    requestEnd(owner, id, reason)
    val barrier = synchronized(lock) {
      val current = round?.takeIf { it.owner == owner && (id == null || id == it.id) } ?: return@synchronized null
      closingLocked(current)
    } ?: return null
    return barrier.await()
  }

  /** 覆盖是实际像素事实；准备失效与正式维持规则分别处理。 */
  fun onCoverage(coverage: FingertipCoverage, now: Long) = synchronized(lock) {
    val current = round ?: return@synchronized
    if (current.phase !in ACTIVE || current.cancelled) return@synchronized
    if (current.phase == "capturing" && expiredLocked(current, now)) return@synchronized
    val previous = current.gate.lastFrameNanos
    current.gate.update(coverage, now)
    if (current.phase == "capturing") {
      if (coverage.usable) current.lostSince = null
      else if (current.lostSince == null) current.lostSince = previous?.takeIf { now - it > FingertipCoverageGate.FRESH_NANOS } ?: now
    } else evaluatePreparationLocked(current, now)
    notifyLocked(current, false)
  }

  /** 任一路必要来源失败只封闭本轮组，不影响其他所有者。 */
  fun fail(code: String, message: String) = synchronized(lock) {
    round?.takeIf { it.phase in ACTIVE }?.let { failLocked(it, PPGCaptureFailure(code, message)) }
  }

  /** 原生独立计时同时撤销陈旧覆盖与准备资格。 */
  private fun tick(current: Round) = synchronized(lock) {
    if (round !== current || current.phase !in ACTIVE || current.cancelled) return@synchronized
    val now = clock()
    if (current.phase == "capturing") expiredLocked(current, now)
    else {
      current.gate.expire(now)
      evaluatePreparationLocked(current, now)
    }
    notifyLocked(current, false)
  }

  /** 覆盖失效重建观测；稳定或替代路径失效只等待新的有效判定。 */
  private fun evaluatePreparationLocked(current: Round, now: Long) {
    val ready = current.gate.ready(now)
    if (!ready && current.phase in CHEST) {
      current.phase = "observing_finger"
      current.observation?.live?.set(false)
      current.imu.reset()
      if (!current.resetting) {
        current.resetting = true
        scope.launch { resetObservation(current) }
      }
      notifyLocked(current, true)
    } else if (ready && current.phase == "observing_finger" && !current.resetting) {
      val observation = Observation()
      current.imu.reset()
      current.observation = observation
      current.phase = "awaiting_chest"
      notifyLocked(current, true)
      scope.launch { registerObservation(current, observation) }
    } else if (ready && current.phase == "awaiting_chest" && current.observation?.ready == true && current.imu.snapshot(now).admitted) {
      current.phase = "starting"
      notifyLocked(current, true)
      scope.launch { automaticStart(current) }
    }
  }

  /** 每条真实 ACC 同源分流到判定与原始保存；gyro 只观测。 */
  private suspend fun registerObservation(current: Round, observation: Observation) = commands.withLock {
    if (synchronized(lock) { round !== current || current.cancelled || current.observation !== observation || !observation.live.get() }) return@withLock
    try {
      observation.acc = sensors.reserve(SensorKind.ACCELEROMETER, current.owner, observation.accId, 5_000,
        { if (observation.live.get()) current.imu.onAccelerometer(it) },
        { sensorFailed(current, observation, "ACC", it) })
      if (synchronized(lock) { current.cancelled || !observation.live.get() }) return@withLock
      observation.gyro = sensors.reserve(SensorKind.GYROSCOPE, current.owner, observation.gyroId, 20_000,
        { if (observation.live.get()) current.imu.onGyroscope(it) },
        { sensorFailed(current, observation, "gyro", it) })
      synchronized(lock) { observation.ready = !current.cancelled && observation.live.get() }
    } catch (error: Throwable) {
      synchronized(lock) { failLocked(current, error.asBloodPressureFailure("IMU_REGISTRATION_FAILED", "血压 IMU 观测无法启动。")) }
    }
  }

  /** 将来源错误绑定到确切观测代次，旧监听不得改变当前轮次。 */
  private fun sensorFailed(current: Round, observation: Observation, source: String, error: SensorCaptureFailure) = synchronized(lock) {
    if (round === current && current.observation === observation && observation.live.get() && current.phase in ACTIVE) {
      if (error.code == "APP_NOT_FOREGROUND" || error.code == "RUNTIME_DESTROYED") {
        sealLocked(current, if (error.code == "APP_NOT_FOREGROUND") "app_background" else "host_destroyed")
        closingLocked(current)
      } else failLocked(current, PPGCaptureFailure(error.code, "$source：${error.message}", error))
    }
  }

  /** 所有 writer 准备后再次读取当前真实准入，再统一激活半开接收窗口。 */
  private suspend fun automaticStart(current: Round) = commands.withLock {
    if (synchronized(lock) { round !== current || current.cancelled || current.phase != "starting" }) return@withLock
    try {
      val observation = checkNotNull(current.observation)
      val acc = checkNotNull(observation.acc)
      val session = host.prepare({ accepted(current, it) }, { error -> synchronized(lock) {
        if (round === current && current.phase in ACTIVE) failLocked(current, error)
      } })
      synchronized(lock) { current.session = session }
      acc.prepareOutput()
      val activate = synchronized(lock) {
        val now = clock()
        if (current.cancelled || current.phase != "starting" || !current.gate.ready(now) || !current.imu.snapshot(now).admitted) false
        else {
          val end = now + current.duration * 1_000_000L
          session.installGroupActivation(current.activated::get)
          acc.openWindow(now, end, current.activated::get)
          host.activate(session, now, end)
          current.start = now
          current.end = end
          current.phase = "capturing"
          current.activated.set(true)
          notifyLocked(current, true)
          true
        }
      }
      if (!activate) {
        host.discard(session)
        acc.discardPreparedOutput()
        synchronized(lock) {
          current.session = null
          if (!current.cancelled && current.phase == "starting") {
            current.phase = "awaiting_chest"
            evaluatePreparationLocked(current, clock())
            notifyLocked(current, true)
          }
        }
      }
    } catch (error: Throwable) {
      synchronized(lock) {
        if (!current.cancelled) failLocked(current, error.asBloodPressureFailure("CAPTURE_PREPARATION_FAILED", "血压联合采集准备失败。"))
        else closingLocked(current)
      }
    }
  }

  /** 只统计已精确配对且接受的 PPG 原始记录，不生成血压展示波形。 */
  private fun accepted(current: Round, record: PPGCaptureRecord) = synchronized(lock) {
    if (round !== current) return@synchronized
    val timestamp = record.metadata.timestampFrameNanos ?: return@synchronized
    current.count++
    if (current.first == null) current.first = timestamp
    current.last = timestamp
  }

  /** 未开窗覆盖退回后释放旧观测，下一次使用全新真实输入。 */
  private suspend fun resetObservation(current: Round) = commands.withLock {
    val observation = synchronized(lock) { current.observation } ?: return@withLock
    try {
      releaseObservation(current, observation)
      synchronized(lock) {
        if (current.observation === observation) current.observation = null
        current.resetting = false
        current.imu.reset()
      }
    } catch (error: Throwable) {
      synchronized(lock) { failLocked(current, error.asBloodPressureFailure("IMU_CLOSE_FAILED", "血压准备观测释放失败。")) }
    }
  }

  /** 两源独立截止与覆盖宽限同时适用，先到者决定本轮真实终止。 */
  private fun expiredLocked(current: Round, now: Long): Boolean {
    val end = current.end ?: return false
    val missing = (current.gate.lastFrameNanos ?: current.start!!) + FingertipSignalConfig.COVERAGE_LOSS_NANOS
    val lowCoverage = current.lostSince?.let { it + FingertipSignalConfig.COVERAGE_LOSS_NANOS } ?: Long.MAX_VALUE
    val loss = minOf(missing, lowCoverage)
    val deadline = minOf(end, loss)
    if (now < deadline) return false
    current.stopped = deadline
    sealLocked(current, if (end <= loss) "duration_reached" else "coverage_lost")
    closingLocked(current)
    return true
  }

  /** 同步撤销激活并封闭两源入口；在途配对及尾批仍按原合同收尾。 */
  private fun sealLocked(current: Round, reason: String) {
    current.cancelled = true
    current.reason = current.reason ?: reason
    current.stopped = current.stopped ?: current.end?.let { minOf(clock(), it) } ?: clock()
    current.activated.set(false)
    current.session?.sealEntrance()
    current.observation?.acc?.sealEntrance()
    current.observation?.live?.set(false)
    notifyLocked(current, true)
  }

  /** 技术错误不覆盖更早根因，关闭屏障仍尝试所有本轮资源。 */
  private fun failLocked(current: Round, error: PPGCaptureFailure) {
    if (current.phase !in ACTIVE) return
    current.failure = current.failure ?: error
    sealLocked(current, "technical_failure")
    closingLocked(current)
  }

  /** 所有并发结束共享屏障，只有失败后的显式关闭才建立下一次尝试。 */
  private fun closingLocked(current: Round): CompletableDeferred<FingertipFinishResult> {
    current.barrier?.takeIf { !it.isCompleted }?.let { return it }
    return CompletableDeferred<FingertipFinishResult>().also { barrier ->
      current.barrier = barrier
      scope.launch {
        try { barrier.complete(commands.withLock { finishLocked(current) }) }
        catch (error: Throwable) { barrier.completeExceptionally(error) }
      }
    }
  }

  /** 即使一路注销失败仍尝试另一路；失败对象保留供再次关闭。 */
  private suspend fun releaseObservation(current: Round, observation: Observation) {
    observation.live.set(false)
    var failure: Throwable? = null
    try {
      if (observation.acc != null || sensors.isReserved(SensorKind.ACCELEROMETER, current.owner, observation.accId)) {
        sensors.release(SensorKind.ACCELEROMETER, current.owner, observation.accId)?.let { current.accArtifact = it }
      }
    } catch (error: Throwable) { failure = error }
    try {
      if (observation.gyro != null || sensors.isReserved(SensorKind.GYROSCOPE, current.owner, observation.gyroId)) {
        sensors.release(SensorKind.GYROSCOPE, current.owner, observation.gyroId)
      }
    }
    catch (error: Throwable) { if (failure == null) failure = error else failure.addSuppressed(error) }
    failure?.let { throw it }
  }

  /** 文件事实与释放事实分别保留，三份非空文件及全部释放才整体完成。 */
  private suspend fun finishLocked(current: Round): FingertipFinishResult {
    synchronized(lock) {
      if (current.resourcesReleased) return FingertipFinishResult(current.artifact, null, null, true)
      sealLocked(current, current.reason ?: "user_stopped")
      current.phase = "stopping"
      notifyLocked(current, true)
    }
    var camera = FingertipFinishResult(current.artifact, null, null, current.cameraReleased)
    if (!current.cameraReleased) {
      try { camera = host.finish(current.session) }
      catch (error: Throwable) { camera = FingertipFinishResult(current.artifact, null, error.asBloodPressureFailure("CAMERA_CLOSE_FAILED", "相机关闭失败。"), false) }
      current.cameraReleased = camera.resourcesReleased
    }
    var sensorFailure: PPGCaptureFailure? = null
    val observation = current.observation
    if (observation != null) {
      try { releaseObservation(current, observation) }
      catch (error: Throwable) { sensorFailure = error.asBloodPressureFailure("IMU_CLOSE_FAILED", "IMU 释放或文件收尾失败。") }
    }
    val imuReleased = observation == null ||
      (!sensors.isReserved(SensorKind.ACCELEROMETER, current.owner, observation.accId) &&
        !sensors.isReserved(SensorKind.GYROSCOPE, current.owner, observation.gyroId))
    synchronized(lock) {
      current.artifact = camera.artifact ?: current.artifact
      current.failure = current.failure ?: camera.fileFailure ?: sensorFailure
      current.resourceFailure = camera.resourceFailure ?: sensorFailure?.takeIf { !imuReleased }
      current.resourcesReleased = current.cameraReleased && imuReleased
      val statistics = observation?.acc?.statistics()
      current.phase = when {
        current.failure != null || current.resourceFailure != null || !current.resourcesReleased -> "failed"
        current.reason == "duration_reached" && current.artifact != null && current.count > 0 && current.accArtifact != null && (statistics?.sampleCount ?: 0) > 0 -> "completed"
        current.reason == "duration_reached" -> {
          current.failure = PPGCaptureFailure("NO_CAPTURE_DATA", "联合正式窗口缺少本轮非空完成文件。")
          "failed"
        }
        else -> "interrupted"
      }
      current.timer?.cancel()
      notifyLocked(current, true)
    }
    return FingertipFinishResult(current.artifact, current.failure, current.resourceFailure, current.resourcesReleased)
  }

  /** 计划窗口与实际封闭时间分别返回；原始源采样时间不改写为控制时间。 */
  private fun snapshotLocked(current: Round): BloodPressureSnapshotData {
    val now = clock()
    val elapsed = current.start?.let { ((current.stopped ?: now) - it).coerceAtLeast(0) / 1_000_000.0 }?.coerceAtMost(current.duration.toDouble()) ?: 0.0
    val statistics = current.observation?.acc?.statistics()
    val capture = FingertipSnapshotData(current.id, current.session?.sessionId.takeIf { current.start != null }, current.phase,
      current.gate.coverage, current.gate.ready(now) && !current.cancelled, current.duration, elapsed, current.duration - elapsed,
      current.reason, (current.failure ?: current.resourceFailure)?.code, (current.failure ?: current.resourceFailure)?.message,
      current.artifact, current.start, current.end, current.count, current.first, current.last,
      current.artifact?.cameraConfigSummary ?: current.config, current.resourcesReleased)
    return BloodPressureSnapshotData(capture, current.observation?.accId, current.imu.snapshot(now), current.accArtifact,
      statistics?.sampleCount ?: 0, statistics?.firstEventTimestampNanos, statistics?.lastEventTimestampNanos,
      current.stopped.takeIf { current.start != null })
  }

  /** 普通快照最多每 250ms，阶段、错误和终态即时通知。 */
  private fun notifyLocked(current: Round, immediate: Boolean) {
    val now = clock()
    if (!immediate && current.lastNotify != Long.MIN_VALUE && now - current.lastNotify < 250_000_000L) return
    current.lastNotify = now
    val snapshot = snapshotLocked(current)
    for ((owner, listener) in listeners.values) if (owner == current.owner) {
      try { listener(snapshot) } catch (_: Throwable) { /* 订阅失败不得改变原生采集。 */ }
    }
  }

  private companion object {
    val ACTIVE = setOf("observing_finger", "awaiting_chest", "starting", "capturing", "stopping")
    val CHEST = setOf("awaiting_chest", "starting")
  }
}

/** 保留源内稳定错误码，不把设备错误折叠为通用启动失败。 */
private fun Throwable.asBloodPressureFailure(code: String, message: String): PPGCaptureFailure = when (this) {
  is PPGCaptureFailure -> this
  is SensorCaptureFailure -> PPGCaptureFailure(this.code, this.message ?: message, this)
  else -> PPGCaptureFailure(code, this.message ?: message, this)
}
