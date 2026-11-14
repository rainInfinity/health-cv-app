/** 验证 RGB 环形缓冲的固定容量、覆盖顺序与清空复用。 */
package com.healthcvapp.acquisition.rppg.signal

import org.junit.Assert.assertEquals
import org.junit.Test

/** 检查固定容量缓冲在回绕后仍按采集顺序读取。 */
class RppgRgbRingBufferTest {
  @Test
  fun overwritesOldestSamplesWithoutGrowingAndCanBeCleared() {
    val buffer = RppgRgbRingBuffer(capacity = 2)
    val sample = RppgResampledRgb()

    buffer.append(0L, 0L, 0L, 10.0, 20.0, 30.0)
    buffer.append(0L, 1L, 50L, 11.0, 21.0, 31.0)
    buffer.append(0L, 2L, 100L, 12.0, 22.0, 32.0)

    assertEquals(2, buffer.size)
    buffer.copyAt(0, sample)
    assertEquals(1L, sample.sampleIndex)
    assertEquals(50L, sample.timestampNanos)
    assertEquals(11.0, sample.red, 0.0)
    buffer.copyAt(1, sample)
    assertEquals(2L, sample.sampleIndex)
    assertEquals(100L, sample.timestampNanos)

    buffer.clear()
    assertEquals(0, buffer.size)
    buffer.append(1L, 3L, 150L, 13.0, 23.0, 33.0)
    buffer.copyAt(0, sample)
    assertEquals(1L, sample.segmentIndex)
    assertEquals(3L, sample.sampleIndex)
  }
}
