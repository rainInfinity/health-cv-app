/** 管理每个原生数据流独立的有界批处理与排空生命周期。 */

package com.healthcvapp.acquisition.pipeline

import java.util.AbstractList
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** 表示一条记录是否被该数据流接受。 */
enum class DataHubOfferResult {
  ACCEPTED,
  CAPACITY_EXCEEDED,
  CLOSED,
  FAILED,
}

/** 顺序消费有界数据流；单批数据仅在 consumer 返回后释放容量。 */
class DataHub<T>(
  private val capacity: Int = 256,
  private val batchSize: Int = 50,
  private val intervalMillis: Long = 1_000,
  dispatcher: CoroutineDispatcher = Dispatchers.IO,
  private val consumer: suspend (List<T>) -> Unit,
) {
  private val lock = ReentrantLock()
  private val wake = Channel<Unit>(Channel.CONFLATED)
  private val scope = CoroutineScope(SupervisorJob() + dispatcher)
  private val values = arrayOfNulls<Any>(capacity)
  private var readIndex = 0
  private var reservedCount = 0
  private var queuedCount = 0
  private var inFlightCount = 0
  private var accepting = true
  private var timerFired = false
  private var timerJob: Job? = null
  private var terminalError: Throwable? = null
  @Volatile private var visibleBatchStart = 0
  @Volatile private var visibleBatchSize = 0
  @Volatile private var activeBatchView: BatchView? = null
  private val workerJob: Job

  init {
    require(capacity > 0) { "capacity must be positive" }
    require(batchSize in 1..capacity) { "batchSize must be between 1 and capacity" }
    require(intervalMillis > 0) { "intervalMillis must be positive" }
    workerJob = scope.launch(start = CoroutineStart.UNDISPATCHED) { consumeLoop() }
  }

  /** 在生产线程短暂入队；不会同步调用消费者或等待磁盘操作。 */
  fun offer(value: T): DataHubOfferResult = lock.withLock {
    if (terminalError != null) return DataHubOfferResult.FAILED
    if (!accepting) return DataHubOfferResult.CLOSED
    if (reservedCount == capacity) return DataHubOfferResult.CAPACITY_EXCEEDED

    val startsNewBatch = queuedCount == 0
    val writeIndex = (readIndex + reservedCount) % capacity
    values[writeIndex] = value
    reservedCount += 1
    queuedCount += 1
    if (startsNewBatch) startTimerLocked()

    if (queuedCount >= batchSize) wake.trySend(Unit)
    DataHubOfferResult.ACCEPTED
  }

  /** 关闭新数据入口、消费尾批并等待实际消费者完成；重复调用共享同一屏障。 */
  suspend fun closeAndDrain() {
    lock.withLock {
      accepting = false
      cancelTimerLocked()
    }
    wake.trySend(Unit)
    workerJob.join()
    failure?.let { throw it }
  }

  /** 以终态错误停止接收；当前消费完成后丢弃剩余队列并唤醒所有等待者。 */
  fun fail(cause: Throwable) {
    lock.withLock {
      if (terminalError == null) terminalError = cause
      accepting = false
      cancelTimerLocked()
    }
    wake.trySend(Unit)
  }

  /** 返回首个终态消费错误；正常关闭时为空。 */
  val failure: Throwable?
    get() = lock.withLock { terminalError }

  /** 串行消费数量阈值、定时阈值和正常关闭触发的批次。 */
  private suspend fun consumeLoop() {
    try {
      while (true) {
        var currentBatch: BatchView? = null
        val count = lock.withLock {
          if (terminalError != null) {
            discardQueuedLocked()
            return@withLock -1
          }
          if (!accepting && queuedCount == 0) return@withLock -1

          val ready = queuedCount >= batchSize || timerFired || !accepting
          if (!ready || queuedCount == 0) return@withLock 0

          val nextCount = minOf(batchSize, queuedCount)
          cancelTimerLocked()
          visibleBatchStart = readIndex
          visibleBatchSize = nextCount
          currentBatch = BatchView()
          activeBatchView = currentBatch
          inFlightCount = nextCount
          queuedCount -= nextCount
          nextCount
        }

        if (count < 0) return
        if (count == 0) {
          wake.receive()
          continue
        }

        try {
          consumer(checkNotNull(currentBatch))
        } catch (error: Throwable) {
          lock.withLock {
            if (terminalError == null) terminalError = error
            accepting = false
            releaseInFlightLocked()
            discardQueuedLocked()
            cancelTimerLocked()
          }
          return
        }

        lock.withLock {
          releaseInFlightLocked()
          if (terminalError != null) {
            discardQueuedLocked()
            cancelTimerLocked()
          } else if (queuedCount > 0) {
            if (queuedCount >= batchSize || timerFired) {
              wake.trySend(Unit)
            } else {
              startTimerLocked()
            }
          }
        }
      }
    } catch (error: Throwable) {
      lock.withLock {
        if (terminalError == null) terminalError = error
        accepting = false
        discardQueuedLocked()
        cancelTimerLocked()
      }
    } finally {
      lock.withLock {
        activeBatchView = null
        cancelTimerLocked()
      }
      wake.close()
      scope.cancel()
    }
  }

  /** 保留固定环形数组中仍待消费的容量额度。 */
  private fun releaseInFlightLocked() {
    val count = inFlightCount
    for (offset in 0 until count) {
      values[(readIndex + offset) % capacity] = null
    }
    readIndex = (readIndex + count) % capacity
    reservedCount -= count
    inFlightCount = 0
    activeBatchView = null
    visibleBatchSize = 0
  }

  /** 终态错误后清除尚未交付的记录，不将其伪装为正常消费。 */
  private fun discardQueuedLocked() {
    val remaining = reservedCount
    for (offset in 0 until remaining) {
      values[(readIndex + offset) % capacity] = null
    }
    readIndex = (readIndex + remaining) % capacity
    reservedCount = 0
    queuedCount = 0
    inFlightCount = 0
    activeBatchView = null
    visibleBatchSize = 0
  }

  /** 从首条待消费记录开始计时，后续入队不会重置批次期限。 */
  private fun startTimerLocked() {
    if (timerJob != null || queuedCount == 0 || !accepting) return
    timerFired = false
    timerJob = scope.launch(start = CoroutineStart.UNDISPATCHED) {
      delay(intervalMillis)
      lock.withLock {
        timerJob = null
        if (queuedCount > 0) timerFired = true
      }
      wake.trySend(Unit)
    }
  }

  /** 取消当前待消费批次的计时任务。 */
  private fun cancelTimerLocked() {
    timerJob?.cancel()
    timerJob = null
    timerFired = false
  }

  /** 只在 consumer 的同步/挂起调用期间暴露环形缓冲，不复制批次。 */
  private inner class BatchView : AbstractList<T>() {
    override val size: Int
      get() {
        check(activeBatchView === this) { "DataHub batch is no longer valid" }
        return visibleBatchSize
      }

    @Suppress("UNCHECKED_CAST")
    override fun get(index: Int): T {
      check(activeBatchView === this) { "DataHub batch is no longer valid" }
      if (index !in 0 until visibleBatchSize) throw IndexOutOfBoundsException(index)
      val valueIndex = (visibleBatchStart + index) % capacity
      return values[valueIndex] as T
    }
  }
}
