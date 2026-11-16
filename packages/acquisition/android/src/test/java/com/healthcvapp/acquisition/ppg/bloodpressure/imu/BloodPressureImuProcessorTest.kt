/** 受控输入只证明数学和状态规则，不能替代任务 2.4 的真实人体信号。 */
package com.healthcvapp.acquisition.ppg.bloodpressure.imu

import com.healthcvapp.acquisition.sensors.model.SensorSample
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.sin
import org.junit.Assert.*
import org.junit.Test

class BloodPressureImuProcessorTest {
  @Test fun noInputOrMissingGyroscopeRemainsUnknown() {
    val processor = BloodPressureImuProcessor()
    assertFalse(processor.snapshot(ORIGIN).fresh)
    processor.onAccelerometer(sample(ORIGIN, z = 9.81))
    val snapshot = processor.snapshot(ORIGIN)
    assertNull(snapshot.stable)
    assertNull(snapshot.scgCandidate)
    assertFalse(snapshot.admitted)
  }

  @Test fun initiallyTiltedNeedsFullWindowThenTwoContinuousSecondsButNoRaisingHistory() {
    val stream = Stream(angleDegrees = 60.0)
    stream.feed(950_000_000L)
    assertNull(stream.snapshot().stable)
    stream.feed(1_950_000_000L)
    assertEquals(false, stream.snapshot().stable)
    assertFalse(stream.snapshot().admitted)
    stream.feed(200_000_000L)
    assertEquals(true, stream.snapshot().stable)
    assertTrue(stream.snapshot().admitted)
    assertNull(stream.snapshot().scgCandidate)
  }

  /** 同一来源保持递增，但两路线程获得算法锁的先后不必等于接收先后。 */
  @Test fun crossSourceProcessingOrderDoesNotClearContinuousStableObservation() {
    val processor = BloodPressureImuProcessor()
    for (index in 0..160) {
      val time = ORIGIN + index * 20_000_000L
      processor.onGyroscope(sample(time, received = time + 2_000_000L))
      processor.onAccelerometer(sample(time, received = time + 1_000_000L, x = 9.81))
      if (index == 145) {
        assertEquals(false, processor.snapshot(time + 3_000_000L).stable)
        assertFalse(processor.snapshot(time + 3_000_000L).admitted)
      }
    }
    val completed = ORIGIN + 160 * 20_000_000L + 3_000_000L
    assertTrue(processor.snapshot(completed).stable == true)
    assertTrue(processor.snapshot(completed).admitted)
    assertFalse(processor.snapshot(completed + 200_000_001L).fresh)
  }

  @Test fun thirtyDegreeBoundaryIsIncludedButBelowBoundaryIsNot() {
    val boundary = Stream(angleDegrees = 30.0, gravity = 1.0)
    boundary.feed(3_200_000_000L)
    assertEquals(30.0, boundary.snapshot().tiltDegrees!!, 0.00001)
    assertTrue(boundary.snapshot().admitted)
    val below = Stream(angleDegrees = 29.99, gravity = 1.0)
    below.feed(3_200_000_000L)
    assertFalse(below.snapshot().admitted)
  }

  @Test fun faceUpAndFaceDownAreHorizontalAndUprightIsNinetyDegrees() {
    for (angle in listOf(0.0, 90.0, 180.0)) {
      val stream = Stream(angleDegrees = angle)
      stream.feed(3_200_000_000L)
      assertEquals(if (angle == 90.0) 90.0 else 0.0, stream.snapshot().tiltDegrees!!, 0.00001)
      assertEquals(angle == 90.0, stream.snapshot().admitted)
    }
  }

  @Test fun gyroOrLowFrequencyTranslationBlocksBothAdmissionPaths() {
    val turning = Stream(angleDegrees = 60.0, gyro = 0.06, signal = ::periodicScg)
    turning.feed(8_000_000_000L)
    assertEquals(true, turning.snapshot().scgCandidate)
    assertEquals(false, turning.snapshot().stable)
    assertFalse(turning.snapshot().admitted)
    val translating = Stream(angleDegrees = 0.0, signal = ::periodicScg, motion = { 2.0 * sin(2 * PI * it) })
    translating.feed(8_000_000_000L)
    assertEquals(true, translating.snapshot().scgCandidate)
    assertEquals(false, translating.snapshot().stable)
    assertFalse(translating.snapshot().admitted)
  }

  @Test fun periodicMechanicalEnvelopeCanAdmitAtSmallTiltAfterTwoCompleteEvaluations() {
    val stream = Stream(angleDegrees = 0.0, signal = ::periodicScg)
    stream.feed(5_000_000_000L)
    assertNull(stream.snapshot().scgCandidate)
    assertFalse(stream.snapshot().admitted)
    stream.feed(165_000_000L)
    assertEquals(false, stream.snapshot().scgCandidate)
    assertFalse(stream.snapshot().admitted)
    stream.feed(250_000_000L)
    assertEquals(true, stream.snapshot().scgCandidate)
    assertEquals(true, stream.snapshot().stable)
    assertTrue(stream.snapshot().admitted)
    assertTrue(stream.snapshot().scgEnergyMeanSquare!! >= 0.0004)
    assertTrue(stream.snapshot().scgRepetition!! >= 0.65)
  }

  @Test fun tiltAdmissionDoesNotStopScgAndCandidateCanDisappearWithoutResettingProcessor() {
    var useSignal = true
    val stream = Stream(angleDegrees = 60.0, signal = { if (useSignal) periodicScg(it) else 0.0 })
    stream.feed(3_200_000_000L)
    assertTrue(stream.snapshot().admitted)
    assertNull(stream.snapshot().scgCandidate)
    stream.feed(4_800_000_000L)
    assertEquals(true, stream.snapshot().scgCandidate)
    useSignal = false
    stream.feed(6_000_000_000L)
    assertEquals(false, stream.snapshot().scgCandidate)
    assertEquals(true, stream.snapshot().stable)
    assertTrue(stream.snapshot().admitted)
  }

  @Test fun constantLowNoiseSingleImpactAndUnmodulatedCarrierAreNotCandidates() {
    val signals: List<(Double) -> Double> = listOf(
      { 0.0 },
      { 0.001 * (sin(2 * PI * 13.0 * it) + sin(2 * PI * 19.0 * it)) },
      { if (it >= 3.0 && it < 3.025) 8.0 else 0.0 },
      { 0.2 * sin(2 * PI * 16.0 * it) },
    )
    for (signal in signals) {
      val stream = Stream(angleDegrees = 0.0, signal = signal)
      repeat(36) {
        stream.feed(250_000_000L)
        assertNotEquals(true, stream.snapshot().scgCandidate)
        assertFalse(stream.snapshot().admitted)
      }
      assertEquals(false, stream.snapshot().scgCandidate)
    }
  }

  @Test fun eventGapOrRollbackOnEitherSourceDiscardsOldStableAndCandidate() {
    for (gyroGap in listOf(false, true)) {
      for (rollback in listOf(false, true)) {
        val stream = Stream(angleDegrees = 0.0, signal = ::periodicScg)
        stream.feed(8_000_000_000L)
        assertTrue(stream.snapshot().admitted)
        val time = stream.now + if (rollback) -1L else BloodPressureImuProcessor.FRESH_NANOS + 1L
        if (gyroGap) {
          stream.processor.onGyroscope(sample(time))
          stream.processor.onAccelerometer(sample(time, z = 9.81))
        } else {
          stream.processor.onAccelerometer(sample(time, z = 9.81))
          stream.processor.onGyroscope(sample(time))
        }
        val reset = stream.processor.snapshot(time)
        assertTrue(reset.fresh)
        assertNull(reset.stable)
        assertNull(reset.scgCandidate)
        assertFalse(reset.admitted)
      }
    }
  }

  @Test fun exactlyTwoHundredMillisIsFreshAndOneNanosecondMoreIsUnknown() {
    val stream = Stream(angleDegrees = 60.0)
    stream.feed(3_200_000_000L)
    val boundary = stream.processor.snapshot(stream.now + 200_000_000L)
    assertTrue(boundary.fresh)
    assertTrue(boundary.admitted)
    val expired = stream.processor.snapshot(stream.now + 200_000_001L)
    assertFalse(expired.fresh)
    assertNull(expired.tiltDegrees)
    assertNull(expired.stable)
    assertNull(expired.scgCandidate)
    assertFalse(expired.admitted)
  }

  @Test fun receivedGapAndLateHistoricalEventCannotPreserveAdmission() {
    val stream = Stream(angleDegrees = 60.0)
    stream.feed(3_200_000_000L)
    val event = stream.now + 5_000_000L
    val received = stream.now + 201_000_000L
    stream.processor.onAccelerometer(sample(event, received = received, z = 9.81))
    stream.processor.onGyroscope(sample(event, received = received))
    assertNull(stream.processor.snapshot(received).stable)
    stream.processor.onAccelerometer(sample(event + 1L, received = event + 200_000_002L, z = 9.81))
    assertFalse(stream.processor.snapshot(event + 200_000_002L).fresh)
  }

  @Test fun eventGapBoundaryIsInclusiveAndLongerGapRequiresNewContinuousConfirmation() {
    val stream = Stream(angleDegrees = 90.0)
    stream.feed(3_200_000_000L)
    val boundary = stream.now + 200_000_000L
    stream.processor.onAccelerometer(sample(boundary, x = 9.81))
    stream.processor.onGyroscope(sample(boundary))
    assertTrue(stream.processor.snapshot(boundary).admitted)
    val restart = boundary + 200_000_001L
    stream.processor.onGyroscope(sample(restart))
    stream.processor.onAccelerometer(sample(restart, x = 9.81))
    assertNull(stream.processor.snapshot(restart).stable)
    for (index in 1..640) {
      val time = restart + index * 5_000_000L
      stream.processor.onAccelerometer(sample(time, x = 9.81))
      if (index % 4 == 0) stream.processor.onGyroscope(sample(time))
      if (index == 580) {
        assertEquals(false, stream.processor.snapshot(time).stable)
        assertFalse(stream.processor.snapshot(time).admitted)
      }
    }
    assertTrue(stream.processor.snapshot(restart + 3_200_000_000L).admitted)
  }

  @Test fun insufficientActualNyquistIsUnknownWithoutBlockingTiltPath() {
    val stream = Stream(angleDegrees = 60.0, accStep = 25_000_000L, signal = ::periodicScg)
    stream.feed(9_000_000_000L)
    val snapshot = stream.snapshot()
    assertEquals(40.0, snapshot.accelerometerRateHz!!, 0.0001)
    assertNull(snapshot.scgCandidate)
    assertEquals(true, snapshot.stable)
    assertTrue(snapshot.admitted)
  }

  @Test fun samplingRateChangeReestablishesFilterAndCannotReuseCandidate() {
    val stream = Stream(angleDegrees = 0.0, signal = ::periodicScg)
    stream.feed(8_000_000_000L)
    assertEquals(true, stream.snapshot().scgCandidate)
    stream.accStep = 10_000_000L
    stream.feed(500_000_000L)
    assertNull(stream.snapshot().scgCandidate)
    assertFalse(stream.snapshot().admitted)
    stream.feed(6_000_000_000L)
    assertEquals(100.0, stream.snapshot().accelerometerRateHz!!, 0.0001)
    assertEquals(true, stream.snapshot().scgCandidate)
  }

  @Test fun realIrregularIntervalsUseElapsedDurationAndResetDropsAllFacts() {
    val processor = BloodPressureImuProcessor()
    var time = ORIGIN
    repeat(601) { index ->
      processor.onAccelerometer(sample(time, y = 9.81))
      if (index % 4 == 0) processor.onGyroscope(sample(time))
      time += if (index % 2 == 0) 4_000_000L else 6_000_000L
    }
    val snapshot = processor.snapshot(time - 4_000_000L)
    assertEquals(true, snapshot.stable)
    assertTrue(snapshot.admitted)
    processor.reset()
    val reset = processor.snapshot(time)
    assertFalse(reset.fresh)
    assertNull(reset.stable)
    assertNull(reset.scgCandidate)
    assertFalse(reset.admitted)
  }

  private class Stream(
    val angleDegrees: Double,
    val gravity: Double = 9.81,
    val gyro: Double = 0.0,
    var accStep: Long = 5_000_000L,
    val signal: (Double) -> Double = { 0.0 },
    val motion: (Double) -> Double = { 0.0 },
  ) {
    val processor = BloodPressureImuProcessor()
    var now = ORIGIN
      private set
    private var nextAcc = ORIGIN
    private var nextGyro = ORIGIN

    fun feed(duration: Long) {
      val end = now + duration
      while (minOf(nextAcc, nextGyro) <= end) {
        val time = minOf(nextAcc, nextGyro)
        val seconds = (time - ORIGIN) / 1e9
        if (time == nextAcc) {
          val radians = angleDegrees * PI / 180.0
          processor.onAccelerometer(sample(time,
            x = gravity * sin(radians) + motion(seconds),
            z = gravity * cos(radians) + signal(seconds)))
          nextAcc += accStep
        }
        if (time == nextGyro) {
          processor.onGyroscope(sample(time, x = gyro))
          nextGyro += 20_000_000L
        }
      }
      now = end
    }

    fun snapshot(): ImuAdmissionSnapshot = processor.snapshot(now)
  }

  companion object {
    private const val ORIGIN = 1_000_000_000L

    private fun periodicScg(seconds: Double): Double {
      val beat = max(0.0, sin(2 * PI * 1.25 * seconds))
      return 0.22 * (0.15 + 0.85 * beat.pow(4)) * sin(2 * PI * 16.0 * seconds)
    }

    private fun sample(time: Long, received: Long = time, x: Double = 0.0, y: Double = 0.0, z: Double = 0.0): SensorSample =
      SensorSample(received, time, received, x.toFloat(), y.toFloat(), z.toFloat())
  }
}
