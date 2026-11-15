/** 指尖轮次拥有覆盖门控、原生计时和完整终态屏障；相机动作委派现有 PPG 控制边界。 */
package com.healthcvapp.acquisition.ppg.fingertip

import com.healthcvapp.acquisition.ppg.model.PPGArtifact
import com.healthcvapp.acquisition.ppg.model.PPGCaptureRecord
import com.healthcvapp.acquisition.ppg.model.PPGConfigSummary
import com.healthcvapp.acquisition.ppg.session.PPGCaptureFailure
import com.healthcvapp.acquisition.ppg.session.PPGCaptureSession
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock


/** 控制时间来自 elapsedRealtime；像素与配对记录分别驱动覆盖和真实展示。 */
internal class FingertipController(
  private val scope: CoroutineScope,
  private val commands: Mutex,
  private val host: FingertipHost,
  private val clock: () -> Long,
  /** 仅保存有限展示批次，不持有原始帧或文件 writer。 */
  val pulseHub: FingertipPulseHub = FingertipPulseHub(),
) {
  private class Round(val owner: String, val id: String, val duration: Long, val config: PPGConfigSummary) {
    val gate = FingertipCoverageGate()
    val pulse = FingertipPulseProcessor()
    var phase = "observing"
    var session: PPGCaptureSession? = null
    var start: Long? = null
    var end: Long? = null
    var stopped: Long? = null
    var reason: String? = null
    var failure: PPGCaptureFailure? = null
    var resourceFailure: PPGCaptureFailure? = null
    var artifact: PPGArtifact? = null
    var resourcesReleased = false
    var cancelled = false
    var lostSince: Long? = null
    var count = 0L
    var first: Long? = null
    var last: Long? = null
    var lastNotify = Long.MIN_VALUE
    var timer: Job? = null
    var ending = false
    var closeBarrier: CompletableDeferred<FingertipFinishResult>? = null
  }
  private val lock = Any()
  private var round: Round? = null
  private val ids = AtomicLong()
  private val listeners = LinkedHashMap<Long, Pair<String, (FingertipSnapshotData?) -> Unit>>()

  /** 指尖启动只建立观测轮次，不同步等待手指或正式采集。 */
  suspend fun start(owner: String, duration: Long): String = commands.withLock {
    require(duration in 1L..86_400_000L) { "指尖时长必须为有效的正毫秒数。" }
    synchronized(lock) {
      check(round?.let { it.phase in ACTIVE || !it.resourcesReleased } != true) { "指尖轮次尚未关闭。" }
      val config = checkNotNull(host.configuration(owner)) { "调用方尚未持有就绪的相机预览。" }
      check(config.blockLayout.rows == 1 && config.blockLayout.columns == 1) { "指尖原始网格必须为单块。" }
      val current = Round(owner, UUID.randomUUID().toString(), duration, config)
      round = current
      current.timer = scope.launch {
        while (true) { delay(50); tick(current) }
      }
      notifyLocked(current, true)
      current.id
    }
  }

  /** 无设备副作用地读取本调用方轮次；不暴露其他调用方的快照。 */
  fun snapshot(owner: String): FingertipSnapshotData? = synchronized(lock) {
    round?.takeIf { it.owner == owner }?.let(::snapshotLocked)
  }

  /** 注册本调用方低频事实并立即给出初值。 */
  fun addListener(owner: String, listener: (FingertipSnapshotData?) -> Unit): Long = synchronized(lock) {
    val id = ids.incrementAndGet()
    listeners[id] = owner to listener
    listener(round?.takeIf { it.owner == owner }?.let(::snapshotLocked))
    id
  }

  /** 解除低频订阅，不影响原生计时和采集。 */
  fun removeListener(id: Long) = synchronized(lock) { listeners.remove(id); Unit }

  /** 关闭意图同步生效，不必先获得可能正在等待锁确认的命令互斥。 */
  fun requestEnd(owner: String, id: String? = null, reason: String = "user_stopped") = synchronized(lock) {
    val current = round ?: return@synchronized
    if (current.owner != owner || (id != null && current.id != id)) return@synchronized
    if (current.phase !in ACTIVE) return@synchronized
    current.cancelled = true
    current.reason = current.reason ?: reason
    current.stopped = current.stopped ?: clock().let { now -> current.end?.let { minOf(now, it) } ?: now }
    current.session?.sealEntrance()
  }

  /** 指定旧轮次无副作用；当前轮次等待文件和相机完整屏障。 */
  suspend fun stop(owner: String, id: String? = null, reason: String = "user_stopped"): FingertipFinishResult? {
    requestEnd(owner, id, reason)
    val barrier = synchronized(lock) {
      val current = round?.takeIf { it.owner == owner && (id == null || it.id == id) }
        ?: return@synchronized null
      closingBarrier(current, current.reason ?: reason)
    } ?: return null
    return barrier.await()
  }

  /** 所有自动/显式关闭共享一次在途屏障；失败后的新调用才建立新重试。 */
  private fun closingBarrier(current: Round, reason: String): CompletableDeferred<FingertipFinishResult> =
    synchronized(lock) {
      current.closeBarrier?.takeIf { !it.isCompleted } ?: CompletableDeferred<FingertipFinishResult>().also { request ->
        current.closeBarrier = request
        scope.launch {
          try {
            request.complete(commands.withLock { finishLocked(current, current.reason ?: reason) })
          } catch (error: Throwable) {
            request.completeExceptionally(error)
          }
        }
      }
    }

  /** 每个真实像素帧调用；稳定累计与脉搏是否有效都来自同帧事实。 */
  fun onCoverage(coverage: FingertipCoverage, now: Long) = synchronized(lock) {
    val current = round ?: return@synchronized
    if (current.phase !in ACTIVE || current.cancelled) return@synchronized
    if (current.phase == "capturing" && endIfExpired(current, now)) return@synchronized
    val previous = current.gate.lastFrameNanos
    val ready = current.gate.update(coverage, now)
    if (current.phase == "capturing") {
      if (coverage.usable) current.lostSince = null
      else if (current.lostSince == null) {
        // 缺帧后紧接低覆盖仍是一段连续丢失，不能通过无效新帧重置宽限。
        current.lostSince = previous?.takeIf { now - it > FingertipCoverageGate.FRESH_NANOS } ?: now
      }
    } else if (current.phase == "observing" && ready) {
      current.phase = "starting"
      notifyLocked(current, true)
      scope.launch { automaticStart(current) }
    }
    notifyLocked(current, false)
  }

  /** 技术失败与正常覆盖/生命周期中断分开；先封闭入口，文件屏障仍会等待完成。 */
  fun fail(code: String, message: String) = synchronized(lock) {
    val current = round ?: return@synchronized
    if (current.phase !in ACTIVE) return@synchronized
    current.failure = PPGCaptureFailure(code, message)
    endAsync(current, "technical_failure")
  }

  private suspend fun automaticStart(current: Round) = commands.withLock {
    if (synchronized(lock) { round !== current || current.cancelled || current.phase != "starting" }) return@withLock
    try {
      val session = host.prepare(
        onRecord = { record -> accepted(current, record) },
        onFailure = { error -> synchronized(lock) {
          if (round === current && current.phase in ACTIVE) {
            current.failure = error; endAsync(current, "technical_failure")
          }
        } },
      )
      val activate = synchronized(lock) {
        current.session = session
        val now = clock()
        if (round !== current || current.cancelled || !current.gate.ready(now)) false
        else {
          current.start = now
          current.end = now + current.duration * 1_000_000L
          pulseHub.begin(current.id, session.sessionId)
          host.activate(session, now, current.end!!)
          current.phase = "capturing"
          notifyLocked(current, true)
          true
        }
      }
      if (!activate) {
        host.discard(session)
        synchronized(lock) {
          current.session = null
          if (!current.cancelled) { current.phase = "observing"; notifyLocked(current, true) }
        }
        if (current.cancelled) closingBarrier(current, current.reason ?: "user_stopped")
      }
    } catch (error: Throwable) {
      synchronized(lock) {
        if (!current.cancelled || current.reason == null || current.reason == "technical_failure") {
          current.failure = error as? PPGCaptureFailure
            ?: PPGCaptureFailure("CAPTURE_PREPARATION_FAILED", error.message ?: "指尖采集准备失败。", error)
        }
        current.cancelled = true
      }
      closingBarrier(current, current.reason ?: "technical_failure")
    }
  }

  private fun accepted(current: Round, record: PPGCaptureRecord) = synchronized(lock) {
    if (round !== current) return@synchronized
    val timestamp = record.metadata.timestampFrameNanos ?: return@synchronized
    current.count++
    if (current.first == null) current.first = timestamp
    current.last = timestamp
    val ppg = record.ppg
    val input = FingertipSignalConfig.red(ppg.averageY(0), ppg.averageV(0))
    current.pulse.process(timestamp, input, ppg.coverageUsable == true)?.let(pulseHub::offer)
  }

  private fun tick(current: Round) = synchronized(lock) {
    if (round !== current || current.phase !in ACTIVE) return@synchronized
    val now = clock()
    if (!current.cancelled && current.phase == "capturing") {
      endIfExpired(current, now)
    }
    current.gate.expire(now)
    pulseHub.flush()
    notifyLocked(current, false)
  }
  /** 先检查已到期窗口，再接纳恢复帧，避免过期后被新覆盖自动复活。 */
  private fun endIfExpired(current: Round, now: Long): Boolean {
    val end = current.end!!
    val noFrameDeadline = (current.gate.lastFrameNanos ?: current.start!!) + FingertipSignalConfig.COVERAGE_LOSS_NANOS
    val coverageDeadline = current.lostSince?.let { it + FingertipSignalConfig.COVERAGE_LOSS_NANOS } ?: Long.MAX_VALUE
    val lossDeadline = minOf(noFrameDeadline, coverageDeadline)
    val deadline = minOf(end, lossDeadline)
    if (now < deadline) return false
    current.stopped = deadline
    endAsync(current, if (end <= lossDeadline) "duration_reached" else "coverage_lost")
    return true
  }


  private fun endAsync(current: Round, reason: String) {
    if (current.ending) return
    current.ending = true
    current.cancelled = true
    current.reason = current.reason ?: reason
    current.stopped = current.stopped ?: clock().let { now -> current.end?.let { minOf(now, it) } ?: now }
    current.session?.sealEntrance()
    notifyLocked(current, true)
    closingBarrier(current, current.reason!!)
  }

  private suspend fun finishLocked(current: Round, reason: String): FingertipFinishResult {
    if (synchronized(lock) { current.phase !in ACTIVE && current.resourcesReleased }) {
      return FingertipFinishResult(current.artifact, current.failure, null, true)
    }
    synchronized(lock) {
      current.cancelled = true
      current.reason = current.reason ?: reason
      current.stopped = current.stopped ?: clock().let { now -> current.end?.let { minOf(now, it) } ?: now }
      current.session?.sealEntrance()
      current.phase = "stopping"
      notifyLocked(current, true)
    }
    val result = host.finish(current.session)
    // host.finish 已完成原始配对和双 CSV；此时才能提交展示尾批并发布终态。
    pulseHub.flush()
    synchronized(lock) {
      current.artifact = result.artifact ?: current.artifact
      current.failure = result.fileFailure ?: current.failure
      current.resourceFailure = result.resourceFailure
      current.resourcesReleased = result.resourcesReleased
      current.phase = when {
        current.failure != null || current.resourceFailure != null -> "failed"
        reason == "duration_reached" && current.count > 0 && current.artifact != null && result.resourcesReleased -> "completed"
        reason == "duration_reached" -> { current.failure = PPGCaptureFailure("NO_CAPTURE_DATA", "正式窗口没有可定稿数据。"); "failed" }
        else -> "interrupted"
      }
      current.timer?.cancel()
      notifyLocked(current, true)
    }
    return result
  }

  private fun snapshotLocked(current: Round): FingertipSnapshotData {
    val elapsed = current.start?.let { ((current.stopped ?: clock()) - it).coerceAtLeast(0) / 1_000_000.0 }
      ?.coerceAtMost(current.duration.toDouble()) ?: 0.0
    return FingertipSnapshotData(current.id, current.session?.sessionId.takeIf { current.start != null }, current.phase, current.gate.coverage,
      current.gate.ready(clock()) && !current.cancelled, current.duration, elapsed, current.duration - elapsed,
      current.reason, (current.failure ?: current.resourceFailure)?.code,
      (current.failure ?: current.resourceFailure)?.message, current.artifact,
      current.start, current.stopped.takeIf { current.start != null } ?: current.end,
      current.count, current.first, current.last, current.artifact?.cameraConfigSummary ?: current.config, current.resourcesReleased)
  }

  private fun notifyLocked(current: Round, immediate: Boolean) {
    val now = clock()
    if (!immediate && current.lastNotify != Long.MIN_VALUE && now - current.lastNotify < FingertipSignalConfig.STATUS_NOTIFY_NANOS) return
    current.lastNotify = now
    val snapshot = snapshotLocked(current)
    for ((owner, listener) in listeners.values) if (owner == current.owner) {
      try { listener(snapshot) } catch (_: Throwable) { /* 订阅异常不能改变原生轮次。 */ }
    }
  }

  companion object { private val ACTIVE = setOf("observing", "starting", "capturing", "stopping") }
}
