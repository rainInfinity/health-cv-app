/** 验证试验参数版本、会话快照完整性及物理配置边界。 */
package com.healthcvapp.acquisition.rppg.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Test

/** 验证版本化配置快照是否保留会话处理参数。 */
class RPPGConfigTest {
  @Test
  fun sessionSnapshotContainsVersionedProcessingValuesBeyondRequestedFps() {
    val config = RPPGConfig.EXPERIMENTAL_V1
    val snapshot = config.sessionSnapshot()
    val cameraRequest = snapshot["cameraRequest"] as Map<*, *>
    val faceReadiness = snapshot["faceReadiness"] as Map<*, *>

    assertEquals("rppg-experiment-v1", snapshot["configVersion"])
    assertEquals("pending-review", snapshot["reviewStatus"])
    assertEquals("front", cameraRequest["lensFacing"])
    assertEquals(true, cameraRequest["exposureAuto"])
    assertEquals(true, cameraRequest["whiteBalanceAuto"])
    assertEquals(true, cameraRequest["focusAuto"])
    assertEquals(false, cameraRequest["exposureLocked"])
    assertEquals(false, cameraRequest["whiteBalanceLocked"])
    assertEquals(false, cameraRequest["torchEnabled"])
    assertEquals(RPPGConfig.COLOR_ASSUMPTION_BT601_LIMITED_V1, snapshot["colorAssumptionId"])
    assertEquals(640, cameraRequest["preferredWidthPx"])
    assertEquals(480, cameraRequest["preferredHeightPx"])
    assertEquals(30.0, cameraRequest["preferredFps"])
    assertNotEquals(cameraRequest["preferredFps"], snapshot["resamplingRateHz"])

    assertEquals(0.25, faceReadiness["minimumFaceWidthFraction"])
    assertEquals(20.0, faceReadiness["maximumYawDegrees"])
    assertEquals(25.0, faceReadiness["maximumRollDegrees"])
    assertEquals(0.95, faceReadiness["minimumRoiCoverageFraction"])
    assertEquals(1_000_000_000L, faceReadiness["requiredContinuousNanos"])
    assertEquals(200_000_000L, faceReadiness["maximumAdjacentValidGapNanos"])

    assertEquals(5_000_000_000L, snapshot["observationTimeoutNanos"])
    assertEquals(30_000_000_000L, snapshot["targetMeasurementDurationNanos"])
    assertEquals(20.0, snapshot["resamplingRateHz"])
    assertEquals(100_000_000L, snapshot["maximumInterpolationGapNanos"])
    assertEquals(1_600_000_000L, snapshot["posWindowNanos"])
    assertEquals(2_000_000_000L, snapshot["filterStartupExclusionNanos"])
    assertEquals(0.75, snapshot["bandpassLowHz"])
    assertEquals(3.0, snapshot["bandpassHighHz"])
    assertEquals(45.0, snapshot["minimumHeartRateBpm"])
    assertEquals(180.0, snapshot["maximumHeartRateBpm"])
    assertEquals(12_000_000_000L, snapshot["heartRateWindowNanos"])
    assertEquals(1_000_000_000L, snapshot["heartRateStepNanos"])
    assertEquals(3.0, snapshot["minimumHeartRateSnrDb"])
    assertEquals(200_000_000L, snapshot["realtimeBatchNanos"])
    assertEquals(15_000_000_000L, snapshot["realtimeBufferNanos"])
  }

  @Test
  fun rejectsUnsupportedColorAssumptionsAndFrequencyValuesOutsideBandpass() {
    val config = RPPGConfig.EXPERIMENTAL_V1

    assertThrows(IllegalArgumentException::class.java) {
      config.copy(colorAssumptionId = "UNVERSIONED_COLOR")
    }
    assertThrows(IllegalArgumentException::class.java) {
      config.copy(bandpassHighHz = config.resamplingRateHz / 2.0)
    }
    assertThrows(IllegalArgumentException::class.java) {
      config.copy(maximumHeartRateBpm = 181.0)
    }
  }
}
