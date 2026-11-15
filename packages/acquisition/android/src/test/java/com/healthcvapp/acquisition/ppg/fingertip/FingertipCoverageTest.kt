/** 验证实际空间像素、裁剪步长与连续覆盖时钟，不使用动画或源码断言。 */
package com.healthcvapp.acquisition.ppg.fingertip

import com.healthcvapp.acquisition.pixels.PixelCropRect
import org.junit.Assert.*
import org.junit.Test

class FingertipCoverageTest {
  private val estimator = FingertipCoverageEstimator()
  private val full = FingertipCoverage(100.0, FingertipCoverage.State.COMPLETE)

  @Test fun realStridedCroppedPixelsDistinguishPartialCompleteAndUnknown() {
    assertEquals(100.0, estimator.estimate(fingertipPixelFrame()).percent!!, 0.0)
    val partial = estimator.estimate(fingertipPixelFrame { x, _ ->
      if (x < 32) Triple(90, 90, 210) else Triple(100, 128, 128)
    })
    assertEquals(FingertipCoverage.State.PARTIAL, partial.state)
    assertEquals(50.0, partial.percent!!, 0.01)
    assertEquals(0.0, estimator.estimate(fingertipPixelFrame { _, _ -> Triple(100, 128, 128) }).percent!!, 0.0)
    for (color in listOf(Triple(0, 128, 128), Triple(255, 128, 128))) {
      assertNull(estimator.estimate(fingertipPixelFrame { _, _ -> color }).percent)
      val mixed = estimator.estimate(fingertipPixelFrame { x, _ -> if (x < 32) Triple(90, 90, 210) else color })
      assertEquals(FingertipCoverage.State.PARTIAL, mixed.state)
      assertEquals(50.0, mixed.percent!!, 0.01)
    }
  }

  @Test fun centerSquareCircleIgnoresOutsideCropButDoesNotRoundPartialToFull() {
    val frame = fingertipPixelFrame(width = 96, height = 64, crop = PixelCropRect(8, 8, 88, 56)) { x, y ->
      if (x in 24 until 72 && y in 8 until 56) Triple(90, 90, 210) else Triple(100, 128, 128)
    }
    assertEquals(100.0, estimator.estimate(frame).percent!!, 0.0)
    val partial = estimator.estimate(fingertipPixelFrame(width = 128, height = 128,
      crop = PixelCropRect(0, 0, 128, 128)) { x, y ->
      if (x in 62..65 && y in 62..65) Triple(100, 128, 128) else Triple(90, 90, 210)
    })
    assertTrue(partial.percent!! > 99.0)
    assertTrue(partial.percent < 100.0)
    assertEquals(FingertipCoverage.State.PARTIAL, partial.state)
  }

  @Test fun stable3SecondsRequiresFreshFramesAndInvalidInputResetsAccumulation() {
    val gate = FingertipCoverageGate()
    for (millis in 0L until 3000L step 100) assertFalse(gate.update(full, millis * MS))
    assertFalse(gate.update(full, 3000 * MS - 1))
    assertTrue(gate.update(full, 3000 * MS))
    assertTrue(gate.ready(3200 * MS))
    assertFalse(gate.ready(3200 * MS + 1))
    gate.expire(3200 * MS + 1)
    assertEquals(FingertipCoverage.UNKNOWN, gate.coverage)
    assertFalse(gate.update(full, 3201 * MS))
    gate.update(FingertipCoverage.UNKNOWN, 3250 * MS)
    for (millis in 3300L until 6300L step 100) assertFalse(gate.update(full, millis * MS))
    assertTrue(gate.update(full, 6300 * MS))
    assertFalse(gate.update(full, 6200 * MS))
  }

  @Test fun partialPixelsNeverBecomeFullByWaiting() {
    val frame = fingertipPixelFrame { x, _ -> if (x < 32) Triple(90, 90, 210) else Triple(100, 128, 128) }
    val gate = FingertipCoverageGate()
    repeat(100) { assertFalse(gate.update(estimator.estimate(frame), it * 100 * MS)) }
    assertEquals(50.0, gate.coverage.percent!!, 0.01)
  }
  @Test fun maintenanceThresholdDoesNotPromotePartialOrUnknownToReady() {
    val gate = FingertipCoverageGate()
    val nearlyFull = FingertipCoverage(95.0, FingertipCoverage.State.PARTIAL)
    assertTrue(nearlyFull.usable)
    assertFalse(FingertipCoverage(94.999, FingertipCoverage.State.PARTIAL).usable)
    assertFalse(FingertipCoverage.UNKNOWN.usable)
    assertFalse(FingertipCoverage(99.0, FingertipCoverage.State.UNKNOWN).usable)
    repeat(10) { assertFalse(gate.update(nearlyFull, it * 100 * MS)) }
    assertEquals(95.0, gate.coverage.percent!!, 0.0)
    assertEquals(FingertipCoverage.State.PARTIAL, gate.coverage.state)
    assertFalse(gate.coverage.complete)
  }

  private companion object { const val MS = 1_000_000L }
}
