/** 用受控信号只验证数学/时间规则，不将正弦信号当作人体采集验收。 */
package com.healthcvapp.acquisition.ppg.fingertip

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin
import kotlin.math.sqrt
import org.junit.Assert.*
import org.junit.Test

class FingertipPulseProcessorTest {
  @Test fun actualIrregularTimestampsPreservePulseAndExcludeFirstContinuousSecond() {
    val processor = FingertipPulseProcessor()
    var timestamp = 0L
    val points = ArrayList<FingertipPulsePoint>()
    repeat(240) { index ->
      timestamp += if (index % 2 == 0) 20_000_000 else 46_000_000
      processor.process(timestamp, 80 + 3 * sin(2 * PI * 1.2 * timestamp / 1e9), true)?.let(points::add)
    }
    assertTrue(points.size > 150)
    assertTrue(points.first().timeMillis >= 1000)
    assertTrue(points.maxOf { it.value } > 1.0)
    assertTrue(points.minOf { it.value } < -1.0)
    assertTrue(points.zipWithNext().all { (a, b) -> b.timeMillis > a.timeMillis })
    assertTrue(points.zipWithNext().any { (a, b) -> abs(b.timeMillis - a.timeMillis - 20.0) < 0.001 })
    assertTrue(points.zipWithNext().any { (a, b) -> abs(b.timeMillis - a.timeMillis - 46.0) < 0.001 })
  }

  @Test fun constantDoesNotManufacturePeriodicOrZeroDisplayPoints() {
    val processor = FingertipPulseProcessor()
    repeat(400) { assertNull(processor.process(it * 33_000_000L, 42.0, true)) }
  }

  @Test fun invalidCoverageGapAndNonIncreasingTimeBreakSegmentsAndRestartWarmup() {
    val processor = FingertipPulseProcessor()
    var last: FingertipPulsePoint? = null
    fun feed(start: Long, count: Int) {
      repeat(count) { index ->
        val time = start + index * 50_000_000L
        processor.process(time, 40 + sin(time / 1e8), true)?.let { last = it }
      }
    }
    feed(0, 31)
    val firstSegment = last!!.segmentId
    assertNull(processor.process(1_550_000_000, 40.0, false))
    repeat(20) { index ->
      val time = 1_600_000_000 + index * 50_000_000L
      assertNull(processor.process(time, 40 + sin(time / 1e8), true))
    }
    feed(2_600_000_000, 4)
    assertTrue(last!!.segmentId > firstSegment)
    val second = last!!.segmentId
    assertNull(processor.process(3_000_000_001, 44.0, true))
    feed(3_050_000_001, 22)
    assertTrue(last!!.segmentId > second)
    assertNull(processor.process(4_000_000_000, 44.0, true))
    assertNull(processor.process(4_100_000_000, Double.NaN, true))
  }

  @Test fun exactly200MillisIsNotAGapButOneNanosecondMoreIs() {
    val processor = FingertipPulseProcessor()
    var point: FingertipPulsePoint? = null
    repeat(7) { index ->
      point = processor.process(index * 200_000_000L, sin(index * 0.4 * PI), true) ?: point
    }
    assertNotNull(point)
    assertEquals(0L, point!!.segmentId)
    assertNull(processor.process(1_400_000_001, 8.0, true))
  }

  @Test fun sameYuvStatisticsKeepRealRedPulseWhenGreenIsAtColorFloor() {
    val redProcessor = FingertipPulseProcessor()
    val greenProcessor = FingertipPulseProcessor()
    val redPoints = ArrayList<FingertipPulsePoint>()
    val greenPoints = ArrayList<FingertipPulsePoint>()
    repeat(360) { index ->
      val time = index * 33_000_000L
      val u = 97.0
      val v = 220.0 + 2.0 * sin(2 * PI * 1.2 * time / 1e9)
      // 同源均值模拟真机绿色约 0.4、红色仍有真实波动的颜色处理地板。
      val y = 0.4 + FingertipSignalConfig.GREEN_U * (u - 128) + FingertipSignalConfig.GREEN_V * (v - 128)
      val green = y - FingertipSignalConfig.GREEN_U * (u - 128) - FingertipSignalConfig.GREEN_V * (v - 128)
      greenProcessor.process(time, green, true)?.let(greenPoints::add)
      redProcessor.process(time, FingertipSignalConfig.red(y, v), true)?.let(redPoints::add)
    }
    assertTrue(redPoints.size > 250)
    assertTrue(redPoints.maxOf { it.value } > 2.5)
    assertTrue(redPoints.minOf { it.value } < -2.5)
    assertTrue(greenPoints.all { abs(it.value) < 1e-10 })
  }

  @Test fun largeInitialDcDoesNotCreateStartupTransientOrChangePulseAmplitude() {
    val reference = FingertipPulseProcessor()
    val largeDc = FingertipPulseProcessor()
    val points = ArrayList<FingertipPulsePoint>()
    repeat(450) { index ->
      val timestamp = index * 33_000_000L
      val input = 2 * sin(2 * PI * 1.2 * timestamp / 1e9)
      val expected = reference.process(timestamp, input, true)
      val actual = largeDc.process(timestamp, input + 10_000, true)
      assertEquals(expected == null, actual == null)
      if (expected != null && actual != null) {
        assertEquals(expected.value, actual.value, 1e-10)
        points.add(actual)
      }
    }
    assertTrue(points.size > 400)
    assertTrue(points.all { abs(it.value) < 2.5 })
    assertTrue(points.maxOf { it.value } > 1.2)
    assertTrue(points.minOf { it.value } < -1.2)
  }

  @Test fun actualDcStepIsNotSilentlyClippedOrRenormalized() {
    val processor = FingertipPulseProcessor()
    val points = ArrayList<FingertipPulsePoint>()
    repeat(300) { index ->
      val time = index * 33_000_000L
      processor.process(time, 100 + (if (time >= 4_000_000_000L) 100 else 0) +
        2 * sin(2 * PI * 1.2 * time / 1e9), true)?.let(points::add)
    }
    // 已确认的真实幅值合同保留实际DC变化的滤波响应；它不是数学初值产生的假波。
    assertTrue(points.filter { it.timeMillis in 4000.0..4300.0 }.maxOf { it.value } > 20.0)
    val settled = points.filter { it.timeMillis >= 8000 }
    assertTrue(settled.all { abs(it.value) < 2.5 })
    assertTrue(settled.maxOf { it.value } > 1.2)
    assertTrue(settled.minOf { it.value } < -1.2)
  }

  @Test fun invalidCoverageAndGapDiscardOldBaselineButKeepFormalOriginAndPulseAmplitude() {
    for (invalidCoverage in listOf(true, false)) {
      val processor = FingertipPulseProcessor()
      val before = ArrayList<FingertipPulsePoint>()
      repeat(100) { index ->
        val time = 10_000_000_000L + index * 33_000_000L
        processor.process(time, 90 + 2 * sin(2 * PI * 1.2 * time / 1e9), true)?.let(before::add)
      }
      if (invalidCoverage) assertNull(processor.process(13_300_000_000L, 0.0, false))
      val restart = if (invalidCoverage) 13_333_000_000L else 13_500_000_001L
      val after = ArrayList<FingertipPulsePoint>()
      repeat(240) { index ->
        val time = restart + index * 33_000_000L
        processor.process(time, 210 + 2 * sin(2 * PI * 1.2 * time / 1e9), true)?.let(after::add)
      }
      assertTrue(after.size > 150)
      assertTrue(after.first().segmentId > before.last().segmentId)
      assertTrue(after.first().timeMillis >= (restart - 10_000_000_000L) / 1e6 + 1000)
      assertTrue(after.all { abs(it.value) < 2.5 })
      assertTrue(after.maxOf { it.value } > 1.2)
      assertTrue(after.minOf { it.value } < -1.2)
    }
  }

  @Test fun lowestSupportedFrequencyRetainsBothPolaritiesWithoutRepeatedReestablishment() {
    val processor = FingertipPulseProcessor()
    val points = ArrayList<FingertipPulsePoint>()
    repeat(600) { index ->
      val time = index * 33_000_000L
      processor.process(time, 180 + 3 * sin(2 * PI * 0.75 * time / 1e9), true)?.let(points::add)
    }
    val settled = points.filter { it.timeMillis >= 5000 }
    assertTrue(settled.size > 430)
    assertEquals(1, settled.map { it.segmentId }.distinct().size)
    assertTrue(settled.maxOf { it.value } > 1.5)
    assertTrue(settled.minOf { it.value } < -1.5)
  }

  /** 检查低频漂移和高频噪声相对通带脉动衰减，防止频带意外回退。 */
  @Test fun narrowedBandAttenuatesLowDriftAndHighFrequencyNoiseRelativeToPulse() {
    fun settledRms(frequency: Double): Double {
      val processor = FingertipPulseProcessor()
      var sumSquares = 0.0
      var count = 0
      repeat(900) { index ->
        val time = index * 33_333_333L
        val point = processor.process(time, 100 + sin(2 * PI * frequency * time / 1e9), true)
        if (point != null && point.timeMillis >= 10_000) {
          sumSquares += point.value * point.value
          count++
        }
      }
      return sqrt(sumSquares / count)
    }
    val pulse = settledRms(1.5)
    assertTrue(pulse > 0.45)
    assertTrue(settledRms(0.25) < pulse * 0.45)
    assertTrue(settledRms(6.0) < pulse * 0.65)
  }
}
