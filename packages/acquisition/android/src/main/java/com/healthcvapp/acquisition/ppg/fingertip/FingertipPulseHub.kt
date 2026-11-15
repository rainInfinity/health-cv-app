/** 指尖标量批次与每订阅四批的丢旧队列，不反压原始 CSV。 */
package com.healthcvapp.acquisition.ppg.fingertip

import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch

/** 显式时间数组不假定等间隔；批次序号用于辨识订阅缺批。 */
internal data class FingertipPulseBatchData(
  /** 产品轮次标识。 */
  val captureId: String,
  /** 正式原始文件会话标识。 */
  val sessionId: String,
  /** 连续信号片段序号。 */
  val segmentId: Long,
  /** 轮次内递增批次序号，缺号表示展示订阅漏批。 */
  val sequence: Long,
  /** 各点相对正式首帧的真实毫秒时间。 */
  val timesMillis: List<Double>,
  /** 与时间数组一一对应的真实滤波幅值。 */
  val values: List<Double>,
)

/** 只在短锁内生成和投递不可变批次，订阅者在独立协程消费。 */
internal class FingertipPulseHub(
  private val dispatcher: CoroutineDispatcher = Dispatchers.Default,
) {
  private data class Subscriber(val channel: Channel<FingertipPulseBatchData>, val job: Job)
  private val scope = CoroutineScope(SupervisorJob() + dispatcher)
  private val lock = Any()
  private val ids = AtomicLong()
  private val subscribers = LinkedHashMap<Long, Subscriber>()
  private var captureId = ""
  private var sessionId = ""
  private var segment = -1L
  private var sequence = 0L
  private val times = ArrayList<Double>(64)
  private val values = ArrayList<Double>(64)

  /** 新轮只重置生产缓冲，已排队的旧批保留其身份供消费者丢弃。 */
  fun begin(captureId: String, sessionId: String) = synchronized(lock) {
    flushLocked()
    this.captureId = captureId
    this.sessionId = sessionId
    segment = -1
    sequence = 0
  }

  /** 新订阅只接收后续批次，不回放旧轮或替代 UI 局部历史。 */
  fun addListener(listener: (FingertipPulseBatchData) -> Unit): Long = synchronized(lock) {
    val id = ids.incrementAndGet()
    val channel = Channel<FingertipPulseBatchData>(4, BufferOverflow.DROP_OLDEST)
    val job = scope.launch {
      for (batch in channel) {
        try { listener(batch) } catch (_: Throwable) { /* 显示错误不影响文件消费者。 */ }
      }
    }
    subscribers[id] = Subscriber(channel, job)
    id
  }

  /** 幂等解除单一订阅，不停止采集或影响其他消费者。 */
  fun removeListener(id: Long) = synchronized(lock) {
    subscribers.remove(id)?.let { it.channel.cancel(); it.job.cancel() }
    Unit
  }

  /** 同片段最多聚合 64 点，断段时先提交旧片段尾部。 */
  fun offer(point: FingertipPulsePoint) = synchronized(lock) {
    if (point.segmentId != segment) { flushLocked(); segment = point.segmentId }
    times.add(point.timeMillis)
    values.add(point.value)
    if (times.size >= 64) flushLocked()
  }

  /** 原生每 50ms 调用，停止屏障再调用一次提交真实尾批。 */
  fun flush() = synchronized(lock) { flushLocked() }

  private fun flushLocked() {
    if (times.isEmpty()) return
    val batch = FingertipPulseBatchData(captureId, sessionId, segment, sequence++, times.toList(), values.toList())
    times.clear(); values.clear()
    for (subscriber in subscribers.values) subscriber.channel.trySend(batch)
  }
}
