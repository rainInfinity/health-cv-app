/** 将已接受的脉搏样本分批分发给彼此隔离的有限订阅队列。 */

package com.healthcvapp.acquisition.rppg.realtime

import com.healthcvapp.acquisition.rppg.model.RPPGConfig
import com.healthcvapp.acquisition.rppg.model.RPPGPulseSample
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlin.math.ceil
import kotlin.math.roundToLong

/** 表示一个同片段、等间隔且可检测漏批的实时展示批次。 */
internal data class RPPGRealtimeBatch(
  /** 所属采集会话。 */
  val sessionId: String,
  /** 不跨越的连续信号片段序号。 */
  val segmentIndex: Long,
  /** 会话内单调递增的展示批次序号；缺号表示该订阅丢过批次。 */
  val sequence: Long,
  /** 首个波形样本相对会话采集原点的时间，单位毫秒。 */
  val startTimeMs: Double,
  /** 批内相邻样本的采集间隔，单位毫秒。 */
  val sampleIntervalMs: Double,
  /** 按采集时间排列的脉搏幅值，任意单位。 */
  val values: List<Double>,
)

/** 可幂等解除单个实时展示订阅的句柄。 */
internal class RPPGRealtimeBatchSubscription internal constructor(
  /** 从批次中心移除此订阅的动作。 */
  private val unsubscribe: () -> Unit,
) : AutoCloseable {
  private val closed = AtomicBoolean(false)

  /** 取消接收并释放订阅缓冲。 */
  override fun close() {
    if (closed.compareAndSet(false, true)) unsubscribe()
  }
}

/** 为每个订阅保留有限 DROP_OLDEST 队列，不让 UI 反压持久化或算法。 */
internal class RPPGRealtimeBatchHub(
  private val sessionId: String,
  private val sensorTimeOriginNanos: Long,
  config: RPPGConfig,
  private val subscriberBufferCapacity: Int = DEFAULT_SUBSCRIBER_BUFFER_CAPACITY,
  private val subscriberDispatcher: CoroutineDispatcher = Dispatchers.Default,
) {
  private val lock = Any()
  private val subscribers = LinkedHashSet<Subscriber>()
  private val subscriberScope = CoroutineScope(SupervisorJob() + subscriberDispatcher)
  private val sampleIntervalNanos = (NANOS_PER_SECOND / config.resamplingRateHz).roundToLong()
  private val sampleIntervalMs = sampleIntervalNanos.toDouble() / NANOS_PER_MILLISECOND
  private val samplesPerBatch = maxOf(
    1,
    ceil(config.realtimeBatchNanos.toDouble() * config.resamplingRateHz / NANOS_PER_SECOND).toInt(),
  )
  private val pendingValues = ArrayList<Double>(samplesPerBatch)
  private var pendingSegmentIndex: Long? = null
  private var pendingStartTimestampNanos: Long? = null
  private var previousSegmentIndex: Long? = null
  private var previousSampleIndex: Long? = null
  private var previousTimestampNanos: Long? = null
  private var nextSequence = 0L
  private var closed = false

  init {
    require(sessionId.isNotBlank() && sensorTimeOriginNanos >= 0L)
    require(subscriberBufferCapacity > 0)
    require(sampleIntervalNanos > 0L)
  }

  /** 注册独立有限缓冲，并返回可取消句柄；已停止的会话不接受新订阅。 */
  fun subscribe(consumer: suspend (RPPGRealtimeBatch) -> Unit): RPPGRealtimeBatchSubscription {
    val subscriber = Subscriber(
      channel = Channel(
        capacity = subscriberBufferCapacity,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
      ),
    )
    synchronized(lock) {
      check(!closed) { "RPPG realtime hub is closed" }
      if (subscribers.isEmpty()) resetPendingAndTimeline()
      subscribers.add(subscriber)
      subscriber.job = subscriberScope.launch(start = CoroutineStart.DEFAULT) {
        try {
          for (batch in subscriber.channel) consumer(batch)
        } catch (error: CancellationException) {
          throw error
        } catch (_: Throwable) {
          // 单个展示观察者失败时只解除该订阅，不影响持久化。
        } finally {
          removeSubscriber(subscriber)
        }
      }
    }
    return RPPGRealtimeBatchSubscription { unsubscribe(subscriber) }
  }

  /** 在完整队列接受后追加脉搏样本；无订阅时不缓存展示数据。 */
  fun offer(sample: RPPGPulseSample) {
    synchronized(lock) {
      if (closed) return
      require(sample.timestampNanos >= sensorTimeOriginNanos) { "脉搏样本早于会话时间原点。" }
      if (subscribers.isEmpty()) {
        resetPendingAndTimeline()
        return
      }

      val previousIndex = this.previousSampleIndex
      val previousTimestamp = previousTimestampNanos
      val sampleIndexDiscontinuity = previousIndex?.let {
        it == Long.MAX_VALUE || sample.sampleIndex != it + 1L
      } ?: true
      val timestampDiscontinuity = previousTimestamp?.let {
        sample.timestampNanos - it != sampleIntervalNanos
      } ?: true
      val discontinuity = previousSegmentIndex != null && (
        sample.segmentIndex != previousSegmentIndex ||
          sampleIndexDiscontinuity ||
          timestampDiscontinuity
        )
      if (discontinuity) flushPendingLocked()

      if (pendingValues.isEmpty()) {
        pendingSegmentIndex = sample.segmentIndex
        pendingStartTimestampNanos = sample.timestampNanos
      }
      pendingValues.add(sample.value)
      previousSegmentIndex = sample.segmentIndex
      this.previousSampleIndex = sample.sampleIndex
      previousTimestampNanos = sample.timestampNanos
      if (pendingValues.size >= samplesPerBatch) flushPendingLocked()
    }
  }

  /** 定时器可调用此方法发出尚未凑满的同片段批次。 */
  fun flushPending() {
    synchronized(lock) {
      if (!closed) flushPendingLocked()
    }
  }

  /** 发出最终尾批并关闭订阅通道，不等待慢消费者完成回调。 */
  fun close() {
    synchronized(lock) {
      if (closed) return
      flushPendingLocked()
      closed = true
      subscribers.forEach { it.channel.close() }
    }
  }

  /** 当前已注册的活跃订阅数。 */
  val subscriberCount: Int
    get() = synchronized(lock) { subscribers.size }

  /** 非阻塞发出当前同片段批次并推进全会话序号。 */
  private fun flushPendingLocked() {
    if (pendingValues.isEmpty()) return
    val segmentIndex = checkNotNull(pendingSegmentIndex)
    val startTimestampNanos = checkNotNull(pendingStartTimestampNanos)
    val relativeNanos = startTimestampNanos - sensorTimeOriginNanos
    val batch = RPPGRealtimeBatch(
      sessionId = sessionId,
      segmentIndex = segmentIndex,
      sequence = nextSequence,
      startTimeMs = relativeNanos.toDouble() / NANOS_PER_MILLISECOND,
      sampleIntervalMs = sampleIntervalMs,
      values = pendingValues.toList(),
    )
    nextSequence = Math.addExact(nextSequence, 1L)
    subscribers.forEach { it.channel.trySend(batch) }
    pendingValues.clear()
    pendingSegmentIndex = null
    pendingStartTimestampNanos = null
  }

  /** 移除已取消、已关闭或回调失败的订阅。 */
  private fun removeSubscriber(subscriber: Subscriber) {
    synchronized(lock) {
      if (subscribers.remove(subscriber)) {
        subscriber.channel.close()
        if (subscribers.isEmpty() && !closed) resetPendingAndTimeline()
      }
    }
  }

  /** 解除订阅并取消正在执行的观察回调。 */
  private fun unsubscribe(subscriber: Subscriber) {
    removeSubscriber(subscriber)
    subscriber.job?.cancel()
  }

  /** 清除无人接收时的展示缓存和连续性状态。 */
  private fun resetPendingAndTimeline() {
    pendingValues.clear()
    pendingSegmentIndex = null
    pendingStartTimestampNanos = null
    previousSegmentIndex = null
    previousSampleIndex = null
    previousTimestampNanos = null
  }

  /** 保存某个订阅自己的有限队列和收集协程。 */
  private class Subscriber(
    /** 仅供该订阅者使用的丢旧批缓冲。 */
    val channel: Channel<RPPGRealtimeBatch>,
  ) {
    /** 取消后负责释放队列的收集任务。 */
    var job: Job? = null
  }

  private companion object {
    const val DEFAULT_SUBSCRIBER_BUFFER_CAPACITY = 8
    const val NANOS_PER_SECOND = 1_000_000_000.0
    const val NANOS_PER_MILLISECOND = 1_000_000.0
  }
}
