/** 验证有限订阅、显式漏批、真实尾批及轮次身份。 */
package com.healthcvapp.acquisition.ppg.fingertip

import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class FingertipPulseHubTest {
  @Test fun slowSubscriberDropsOldestWithVisibleSequenceAndNoProducerBackpressure() = runTest {
    val hub = FingertipPulseHub(StandardTestDispatcher(testScheduler))
    val received = ArrayList<FingertipPulseBatchData>()
    val id = hub.addListener(received::add)
    hub.begin("capture", "session")
    repeat(10) { index -> hub.offer(FingertipPulsePoint(0, index * 33.0, index.toDouble())); hub.flush() }
    assertTrue(received.isEmpty())
    runCurrent()
    assertEquals(listOf(6L, 7L, 8L, 9L), received.map { it.sequence })
    hub.removeListener(id)
    repeat(100) { hub.offer(FingertipPulsePoint(0, 500.0 + it, it.toDouble())) }
    hub.flush()
    runCurrent()
    assertEquals(4, received.size)
  }

  @Test fun max64AndExplicitTimesTailSegmentsAndNewRoundArePreserved() = runTest {
    val hub = FingertipPulseHub(StandardTestDispatcher(testScheduler))
    val received = ArrayList<FingertipPulseBatchData>()
    val id = hub.addListener(received::add)
    hub.begin("one", "session-one")
    repeat(65) { hub.offer(FingertipPulsePoint(0, it * 31.25, it.toDouble())) }
    hub.offer(FingertipPulsePoint(1, 3000.0, -4.0))
    hub.flush()
    runCurrent()
    assertEquals(listOf(64, 1, 1), received.map { it.values.size })
    assertEquals(listOf(0L, 0L, 1L), received.map { it.segmentId })
    assertEquals(listOf(0L, 1L, 2L), received.map { it.sequence })
    assertEquals(2000.0, received[1].timesMillis.single(), 0.0)
    hub.begin("two", "session-two")
    hub.offer(FingertipPulsePoint(0, 1000.0, 2.0)); hub.flush()
    runCurrent()
    assertEquals("two", received.last().captureId)
    assertEquals("session-two", received.last().sessionId)
    assertEquals(0L, received.last().sequence)
    hub.removeListener(id)
  }
}
