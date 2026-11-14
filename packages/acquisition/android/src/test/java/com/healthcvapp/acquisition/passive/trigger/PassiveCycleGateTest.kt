/** 用虚拟单调时钟验证解锁周期及首帧触发边界。 */

package com.healthcvapp.acquisition.passive.trigger

import org.junit.Assert.assertEquals
import org.junit.Test

/** 覆盖首次机会、首帧周期、预首帧失败、忙状态和单调时间。 */
class PassiveCycleGateTest {
  @Test
  fun `first unlock is eligible and exact interval boundary is due`() {
    val clock = VirtualClock(elapsedNanos = 1_000_000_000L)
    val gate = PassiveCycleGate(intervalNanos = 1_000_000_000L)

    assertEquals(PassiveCycleDecision.START, gate.decide(clock.elapsedNanos, busy = false))
    gate.recordFirstFrameAt(clock.elapsedNanos)
    clock.advanceElapsedBy(999_000_000L)
    assertEquals(PassiveCycleDecision.TOO_EARLY, gate.decide(clock.elapsedNanos, busy = false))
    clock.advanceElapsedBy(1_000_000L)
    assertEquals(PassiveCycleDecision.START, gate.decide(clock.elapsedNanos, busy = false))
  }

  @Test
  fun `wall clock changes do not affect elapsed cycle`() {
    val clock = VirtualClock(elapsedNanos = 5_000_000_000L)
    val gate = PassiveCycleGate(intervalNanos = 2_000_000_000L)
    gate.recordFirstFrameAt(clock.elapsedNanos)

    clock.wallMillis -= 86_400_000L
    assertEquals(PassiveCycleDecision.TOO_EARLY, gate.decide(clock.elapsedNanos, busy = false))
    clock.advanceElapsedBy(2_000_000_000L)
    clock.wallMillis += 172_800_000L
    assertEquals(PassiveCycleDecision.START, gate.decide(clock.elapsedNanos, busy = false))
  }

  @Test
  fun `failure before first frame does not establish a cycle`() {
    val clock = VirtualClock(elapsedNanos = 500_000_000L)
    val gate = PassiveCycleGate(intervalNanos = 10_000_000_000L)

    assertEquals(PassiveCycleDecision.START, gate.decide(clock.elapsedNanos, busy = false))
    clock.advanceElapsedBy(100_000_000L)
    assertEquals(PassiveCycleDecision.START, gate.decide(clock.elapsedNanos, busy = false))
  }

  @Test
  fun `first frame consumes cycle even when no face becomes ready`() {
    val clock = VirtualClock(elapsedNanos = 8_000_000_000L)
    val gate = PassiveCycleGate(intervalNanos = 3_000_000_000L)
    gate.recordFirstFrameAt(clock.elapsedNanos)

    assertEquals(PassiveCycleDecision.BUSY, gate.decide(clock.elapsedNanos, busy = true))
    clock.advanceElapsedBy(2_999_000_000L)
    assertEquals(PassiveCycleDecision.TOO_EARLY, gate.decide(clock.elapsedNanos, busy = false))
    clock.advanceElapsedBy(1_000_000L)
    assertEquals(PassiveCycleDecision.START, gate.decide(clock.elapsedNanos, busy = false))
  }
}

/** 只推进单调时间或墙上时间的测试时钟。 */
private class VirtualClock(var elapsedNanos: Long, var wallMillis: Long = 1_000_000L) {
  /** 推进单调时间，不隐式改变墙上时间。 */
  fun advanceElapsedBy(deltaNanos: Long) {
    elapsedNanos += deltaNanos
  }
}
