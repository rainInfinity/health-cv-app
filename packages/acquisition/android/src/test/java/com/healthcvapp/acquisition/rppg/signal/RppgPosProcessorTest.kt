/** 验证 POS 数值、退化拒绝、重叠定稿和片段尾部范围。 */
package com.healthcvapp.acquisition.rppg.signal

import com.healthcvapp.acquisition.rppg.model.RPPGConfig
import kotlin.math.sqrt
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** 使用独立数值参考检查滑动 POS 的对外样本语义。 */
class RppgPosProcessorTest {
  @Test
  fun matchesIndependentProjectionAndNormalizesOnlyActualWindowContributions() {
    val config = shortWindowConfig()
    val processor = RppgPosProcessor(config)
    val input = RppgResampledRgb()
    val output = RppgPosOutput()
    val tail = RppgPosDiscardedTail()
    val red = doubleArrayOf(72.0, 91.0, 63.0, 88.0, 76.0, 97.0)
    val green = doubleArrayOf(95.0, 73.0, 104.0, 82.0, 110.0, 87.0)
    val blue = doubleArrayOf(54.0, 68.0, 49.0, 75.0, 58.0, 79.0)
    val contributions = Array(red.size) { ArrayList<Double>() }
    val windowSize = processor.windowSampleCount

    for (start in 0..red.size - windowSize) {
      val projection = referencePosWindow(red, green, blue, start, windowSize)
      for (offset in 0 until windowSize) contributions[start + offset].add(projection[offset])
    }

    val finalized = BooleanArray(red.size)
    val values = DoubleArray(red.size)
    var firstFinalizedValue = Double.NaN
    for (index in red.indices) {
      input.set(
        segmentIndex = 0L,
        sampleIndex = index.toLong(),
        timestampNanos = index * 50_000_000L,
        red = red[index],
        green = green[index],
        blue = blue[index],
      )
      val event = processor.accept(input, output, tail)
      if (index < windowSize - 1) {
        assertEquals(RppgPosEvent.ACCUMULATING_WINDOW, event)
        assertFalse(output.hasSample)
        continue
      }

      assertEquals(RppgPosEvent.SAMPLE_FINALIZED, event)
      assertTrue(output.hasSample)
      assertTrue(output.valid)
      val sampleIndex = output.sampleIndex.toInt()
      assertFalse(finalized[sampleIndex])
      finalized[sampleIndex] = true
      values[sampleIndex] = output.value
      assertEquals(contributions[sampleIndex].size, output.contributionCount)
      assertEquals(
        contributions[sampleIndex].sum() / contributions[sampleIndex].size,
        output.value,
        1e-10,
      )
      assertEquals(sampleIndex * 50_000_000L, output.timestampNanos)
      if (sampleIndex == 0) firstFinalizedValue = output.value
    }

    assertEquals(3, finalized.count { it })
    assertEquals(values[0], firstFinalizedValue, 0.0)
    assertTrue(processor.finishSegment(tail))
    assertEquals(0L, tail.segmentIndex)
    assertEquals(3L, tail.firstSampleIndex)
    assertEquals(5L, tail.lastSampleIndex)
    assertFalse(processor.finishSegment(tail))
    assertFalse(tail.hasRange)
  }

  @Test
  fun rejectsConstantWindowsWithoutPublishingNanOrInfinity() {
    val processor = RppgPosProcessor(shortWindowConfig())
    val input = RppgResampledRgb()
    val output = RppgPosOutput()
    val tail = RppgPosDiscardedTail()

    for (index in 0 until processor.windowSampleCount) {
      input.set(0L, index.toLong(), index * 50_000_000L, 80.0, 100.0, 60.0)
      val event = processor.accept(input, output, tail)
      if (index < processor.windowSampleCount - 1) {
        assertEquals(RppgPosEvent.ACCUMULATING_WINDOW, event)
      } else {
        assertEquals(RppgPosEvent.SAMPLE_FINALIZED, event)
        assertTrue(output.hasSample)
        assertFalse(output.valid)
        assertEquals(RppgPosRejectionReason.NO_VALID_WINDOW_CONTRIBUTION, output.rejectionReason)
        assertTrue(output.value.isFinite())
        assertEquals(0.0, output.value, 0.0)
        assertEquals(0, output.contributionCount)
      }
    }
  }

  @Test
  fun segmentSwitchResetsWindowAndReturnsPreviousUnfinalizedTail() {
    val processor = RppgPosProcessor(shortWindowConfig())
    val input = RppgResampledRgb()
    val output = RppgPosOutput()
    val tail = RppgPosDiscardedTail()

    for (index in 0L..3L) {
      input.set(0L, index, index * 50_000_000L, 70.0 + index, 95.0 - index, 52.0 + index * 2.0)
      processor.accept(input, output, tail)
    }
    assertTrue(output.hasSample)
    assertEquals(0L, output.sampleIndex)

    input.set(1L, 4L, 500_000_000L, 82.0, 105.0, 64.0)
    assertEquals(RppgPosEvent.ACCUMULATING_WINDOW, processor.accept(input, output, tail))
    assertFalse(output.hasSample)
    assertTrue(tail.hasRange)
    assertEquals(0L, tail.segmentIndex)
    assertEquals(1L, tail.firstSampleIndex)
    assertEquals(3L, tail.lastSampleIndex)

    for (index in 5L..7L) {
      input.set(1L, index, 500_000_000L + (index - 4L) * 50_000_000L, 82.0 + index, 105.0 - index, 64.0 + index)
      processor.accept(input, output, tail)
    }
    assertTrue(output.hasSample)
    assertEquals(1L, output.segmentIndex)
    assertEquals(4L, output.sampleIndex)
    assertNull(output.rejectionReason)
  }

  /** 使用 200 ms POS 窗口的版本化参数构造四点参考窗口。 */
  private fun shortWindowConfig() = RPPGConfig.EXPERIMENTAL_V1.copy(posWindowNanos = 200_000_000L)

  /** 独立实现单窗归一化、POS 投影与去均值，作为生产算法的数值 oracle。 */
  private fun referencePosWindow(
    red: DoubleArray,
    green: DoubleArray,
    blue: DoubleArray,
    start: Int,
    length: Int,
  ): DoubleArray {
    var redMean = 0.0
    var greenMean = 0.0
    var blueMean = 0.0
    for (offset in 0 until length) {
      redMean += red[start + offset]
      greenMean += green[start + offset]
      blueMean += blue[start + offset]
    }
    redMean /= length
    greenMean /= length
    blueMean /= length

    val first = DoubleArray(length)
    val second = DoubleArray(length)
    var firstMean = 0.0
    var secondMean = 0.0
    for (offset in 0 until length) {
      val r = red[start + offset] / redMean
      val g = green[start + offset] / greenMean
      val b = blue[start + offset] / blueMean
      first[offset] = g - b
      second[offset] = -2.0 * r + g + b
      firstMean += first[offset]
      secondMean += second[offset]
    }
    firstMean /= length
    secondMean /= length

    var firstVariance = 0.0
    var secondVariance = 0.0
    for (offset in 0 until length) {
      firstVariance += (first[offset] - firstMean) * (first[offset] - firstMean)
      secondVariance += (second[offset] - secondMean) * (second[offset] - secondMean)
    }
    val alpha = sqrt(firstVariance / length) / sqrt(secondVariance / length)
    val result = DoubleArray(length)
    var resultMean = 0.0
    for (offset in 0 until length) {
      result[offset] = first[offset] + alpha * second[offset]
      resultMean += result[offset]
    }
    resultMean /= length
    for (offset in result.indices) result[offset] -= resultMean
    return result
  }
}
