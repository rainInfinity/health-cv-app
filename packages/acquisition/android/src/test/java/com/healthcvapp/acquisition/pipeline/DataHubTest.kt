/** 验证有界批处理的容量、调度、隔离与终态屏障。 */

package com.healthcvapp.acquisition.pipeline

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class DataHubTest {
  @Test
  fun capacityIncludesTheBatchAwaitingConsumerCompletion() = runTest {
    val entered = CompletableDeferred<Unit>()
    val release = CompletableDeferred<Unit>()
    val consumed = mutableListOf<Int>()
    val hub = DataHub(
      capacity = 2,
      batchSize = 1,
      dispatcher = StandardTestDispatcher(testScheduler),
    ) { batch ->
      entered.complete(Unit)
      release.await()
      consumed.addAll(batch)
    }

    assertEquals(DataHubOfferResult.ACCEPTED, hub.offer(1))
    assertFalse(entered.isCompleted)
    runCurrent()
    assertTrue(entered.isCompleted)
    assertEquals(DataHubOfferResult.ACCEPTED, hub.offer(2))
    assertEquals(DataHubOfferResult.CAPACITY_EXCEEDED, hub.offer(3))

    release.complete(Unit)
    runCurrent()
    hub.closeAndDrain()

    assertEquals(listOf(1, 2), consumed)
  }

  @Test
  fun timerFlushUsesVirtualTimeFromTheFirstQueuedRecord() = runTest {
    var retainedBatch: List<Int>? = null
    val batches = mutableListOf<List<Int>>()
    val hub = DataHub(
      capacity = 8,
      batchSize = 4,
      intervalMillis = 1_000,
      dispatcher = StandardTestDispatcher(testScheduler),
    ) { batch ->
      retainedBatch = batch
      batches.add(batch.toList())
    }

    assertEquals(DataHubOfferResult.ACCEPTED, hub.offer(7))
    runCurrent()
    advanceTimeBy(999)
    runCurrent()
    assertTrue(batches.isEmpty())

    advanceTimeBy(1)
    runCurrent()
    assertEquals(listOf(listOf(7)), batches)
    hub.closeAndDrain()
    assertThrows(IllegalStateException::class.java) { checkNotNull(retainedBatch).size }
  }

  @Test
  fun elapsedTimerFlushesTailAfterSlowConsumerReturns() = runTest {
    val firstEntered = CompletableDeferred<Unit>()
    val releaseFirst = CompletableDeferred<Unit>()
    val batches = mutableListOf<List<Int>>()
    val hub = DataHub(
      capacity = 4,
      batchSize = 2,
      intervalMillis = 1_000,
      dispatcher = StandardTestDispatcher(testScheduler),
    ) { batch ->
      if (batch.first() == 1) {
        firstEntered.complete(Unit)
        releaseFirst.await()
      }
      batches.add(batch.toList())
    }

    hub.offer(1)
    hub.offer(2)
    runCurrent()
    assertTrue(firstEntered.isCompleted)
    hub.offer(3)
    advanceTimeBy(1_000)
    runCurrent()
    assertTrue(batches.isEmpty())

    releaseFirst.complete(Unit)
    runCurrent()
    assertEquals(listOf(listOf(1, 2), listOf(3)), batches)
    hub.closeAndDrain()
  }

  @Test
  fun numberTriggersRemainOrderedAndNeverOverlapAndExpirePriorBatchViews() = runTest {
    val firstEntered = CompletableDeferred<Unit>()
    val releaseFirst = CompletableDeferred<Unit>()
    val secondEntered = CompletableDeferred<Unit>()
    val releaseSecond = CompletableDeferred<Unit>()
    val batches = mutableListOf<List<Int>>()
    var retainedFirstBatch: List<Int>? = null
    var activeConsumers = 0
    var maximumConcurrentConsumers = 0
    val hub = DataHub(
      capacity = 8,
      batchSize = 2,
      dispatcher = StandardTestDispatcher(testScheduler),
    ) { batch ->
      activeConsumers += 1
      maximumConcurrentConsumers = maxOf(maximumConcurrentConsumers, activeConsumers)
      if (batch.first() == 1) {
        retainedFirstBatch = batch
        firstEntered.complete(Unit)
        releaseFirst.await()
      } else {
        secondEntered.complete(Unit)
        releaseSecond.await()
      }
      batches.add(batch.toList())
      activeConsumers -= 1
    }

    hub.offer(1)
    hub.offer(2)
    runCurrent()
    assertTrue(firstEntered.isCompleted)
    hub.offer(3)
    hub.offer(4)
    runCurrent()
    assertTrue(batches.isEmpty())

    releaseFirst.complete(Unit)
    runCurrent()
    assertTrue(secondEntered.isCompleted)
    assertThrows(IllegalStateException::class.java) { checkNotNull(retainedFirstBatch).size }

    releaseSecond.complete(Unit)
    runCurrent()
    hub.closeAndDrain()

    assertEquals(listOf(listOf(1, 2), listOf(3, 4)), batches)
    assertEquals(1, maximumConcurrentConsumers)

  }

  @Test
  fun normalCloseRejectsNewDataAndWaitsForTheTailBatch() = runTest {
    val entered = CompletableDeferred<Unit>()
    val release = CompletableDeferred<Unit>()
    val consumed = mutableListOf<Int>()
    val hub = DataHub(
      capacity = 8,
      batchSize = 5,
      dispatcher = StandardTestDispatcher(testScheduler),
    ) { batch ->
      entered.complete(Unit)
      release.await()
      consumed.addAll(batch)
    }

    hub.offer(4)
    hub.offer(5)
    val firstClose = async { hub.closeAndDrain() }
    val secondClose = async { hub.closeAndDrain() }
    runCurrent()
    assertTrue(entered.isCompleted)
    assertEquals(DataHubOfferResult.CLOSED, hub.offer(6))
    assertFalse(firstClose.isCompleted)
    assertFalse(secondClose.isCompleted)

    release.complete(Unit)
    runCurrent()
    firstClose.await()
    secondClose.await()

    assertEquals(listOf(4, 5), consumed)
  }

  @Test
  fun closingOneDataStreamDoesNotCloseOrMixAnother() = runTest {
    val dispatcher = StandardTestDispatcher(testScheduler)
    val firstStreamBatches = mutableListOf<List<Int>>()
    val secondStreamBatches = mutableListOf<List<Int>>()
    val firstStream = DataHub(
      capacity = 2,
      batchSize = 2,
      dispatcher = dispatcher,
    ) { batch -> firstStreamBatches.add(batch.toList()) }
    val secondStream = DataHub(
      capacity = 2,
      batchSize = 2,
      dispatcher = dispatcher,
    ) { batch -> secondStreamBatches.add(batch.toList()) }

    assertEquals(DataHubOfferResult.ACCEPTED, firstStream.offer(1))
    assertEquals(DataHubOfferResult.ACCEPTED, secondStream.offer(20))
    firstStream.closeAndDrain()
    assertEquals(DataHubOfferResult.ACCEPTED, secondStream.offer(21))
    secondStream.closeAndDrain()

    assertEquals(listOf(listOf(1)), firstStreamBatches)
    assertEquals(listOf(listOf(20, 21)), secondStreamBatches)
  }

  @Test
  fun consumerFailureIsTerminalAndVisibleToClose() = runTest {
    val failure = IllegalStateException("write failed")
    val hub = DataHub<Int>(
      capacity = 4,
      batchSize = 1,
      dispatcher = StandardTestDispatcher(testScheduler),
    ) { throw failure }

    assertEquals(DataHubOfferResult.ACCEPTED, hub.offer(1))
    runCurrent()
    assertSame(failure, hub.failure)
    assertEquals(DataHubOfferResult.FAILED, hub.offer(2))

    val observed = try {
      hub.closeAndDrain()
      null
    } catch (error: Throwable) {
      error
    }
    assertSame(failure, observed)
  }
}
