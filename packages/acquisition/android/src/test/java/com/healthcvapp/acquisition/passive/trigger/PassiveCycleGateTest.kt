/** 用虚拟单调时钟验证解锁周期及失败计时语义。 */

package com.healthcvapp.acquisition.passive.trigger

import org.junit.Assert.assertEquals
import org.junit.Test

/** 覆盖首次机会、周期边界、墙钟变化、中断和忙状态。 */
class PassiveCycleGateTest {
  @Test
  fun `first unlock is eligible and exact interval boundary is due`() {
    val clock = VirtualClock(elapsedMillis = 1_000L)
    val gate = PassiveCycleGate(intervalMillis = 1_000L)

    assertEquals(PassiveCycleDecision.START, gate.decide(clock.elapsedMillis, busy = false))
    gate.recordStarted(clock.elapsedMillis)
    clock.advanceElapsedBy(999L)
    assertEquals(PassiveCycleDecision.TOO_EARLY, gate.decide(clock.elapsedMillis, busy = false))
    clock.advanceElapsedBy(1L)
    assertEquals(PassiveCycleDecision.START, gate.decide(clock.elapsedMillis, busy = false))
  }

  @Test
  fun `wall clock changes do not affect elapsed cycle`() {
    val clock = VirtualClock(elapsedMillis = 5_000L)
    val gate = PassiveCycleGate(intervalMillis = 2_000L)
    gate.recordStarted(clock.elapsedMillis)

    clock.wallMillis -= 86_400_000L
    assertEquals(PassiveCycleDecision.TOO_EARLY, gate.decide(clock.elapsedMillis, busy = false))
    clock.advanceElapsedBy(2_000L)
    clock.wallMillis += 172_800_000L
    assertEquals(PassiveCycleDecision.START, gate.decide(clock.elapsedMillis, busy = false))
  }

  @Test
  fun `attempt that never starts does not establish a cycle`() {
    val clock = VirtualClock(elapsedMillis = 500L)
    val gate = PassiveCycleGate(intervalMillis = 10_000L)

    assertEquals(PassiveCycleDecision.START, gate.decide(clock.elapsedMillis, busy = false))
    clock.advanceElapsedBy(100L)
    assertEquals(PassiveCycleDecision.START, gate.decide(clock.elapsedMillis, busy = false))
  }

  @Test
  fun `started interrupted clip still consumes cycle and busy events are skipped`() {
    val clock = VirtualClock(elapsedMillis = 8_000L)
    val gate = PassiveCycleGate(intervalMillis = 3_000L)
    gate.recordStarted(clock.elapsedMillis)

    assertEquals(PassiveCycleDecision.BUSY, gate.decide(clock.elapsedMillis, busy = true))
    clock.advanceElapsedBy(2_999L)
    assertEquals(PassiveCycleDecision.TOO_EARLY, gate.decide(clock.elapsedMillis, busy = false))
    clock.advanceElapsedBy(1L)
    assertEquals(PassiveCycleDecision.START, gate.decide(clock.elapsedMillis, busy = false))
  }
}

/** 只推进单调时间或墙上时间的测试时钟。 */
private class VirtualClock(var elapsedMillis: Long, var wallMillis: Long = 1_000_000L) {
  /** 推进单调时间，不隐式改变墙上时间。 */
  fun advanceElapsedBy(deltaMillis: Long) {
    elapsedMillis += deltaMillis
  }
}
