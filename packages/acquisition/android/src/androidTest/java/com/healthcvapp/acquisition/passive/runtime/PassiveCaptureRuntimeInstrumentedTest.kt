/** 验证旧版测量时长升级保留配置但不启用服务，并拒绝不可表示的输入。 */
package com.healthcvapp.acquisition.passive.runtime

import android.content.Context
import androidx.test.platform.app.InstrumentationRegistry
import com.healthcvapp.acquisition.camera.ownership.CameraUseGuard
import com.healthcvapp.acquisition.rppg.model.RPPGInstantHeartRate
import com.margelo.nitro.acquisition.PassiveCaptureConfig
import com.margelo.nitro.acquisition.PassiveCaptureState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PassiveCaptureRuntimeInstrumentedTest {
  /** 当前值不能越过会话或停止边界，忙状态原因更新也不能误清测量值。 */
  @Test
  fun instantHeartRateRejectsStaleSessionsAndClearsOutsideMeasurement() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext
    val runtime = PassiveCaptureRuntime(context)
    val value = RPPGInstantHeartRate(
      segmentIndex = 0L,
      previousPeakTimestampNanos = 1_000_000_000L,
      peakTimestampNanos = 2_000_000_000L,
      intervalNanos = 1_000_000_000L,
      heartRateBpm = 60.0,
    )
    runtime.update(PassiveCaptureState.MEASURING, sessionId = "first")
    runtime.updateInstantHeartRate("first", value)
    runtime.updateReason("CAPTURE_BUSY")
    assertEquals(60.0, runtime.getSnapshot().latestInstantHeartRate?.asSecondOrNull()?.heartRateBpm)

    runtime.update(PassiveCaptureState.WAITING, sessionId = "first")
    assertNull(runtime.getSnapshot().latestInstantHeartRate?.asSecondOrNull())
    runtime.update(PassiveCaptureState.MEASURING, sessionId = "second")
    runtime.updateInstantHeartRate("first", value)
    assertNull(runtime.getSnapshot().latestInstantHeartRate?.asSecondOrNull())
    runtime.updateInstantHeartRate("second", value)
    runtime.update(PassiveCaptureState.STOPPING, sessionId = "second")
    runtime.updateInstantHeartRate("second", value)
    assertNull(runtime.getSnapshot().latestInstantHeartRate?.asSecondOrNull())
  }

  @Test
  fun preservesLegacyDurationWithoutEnablingServiceOrAcquiringCamera() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext
    val preferences = context.getSharedPreferences("passive_capture", Context.MODE_PRIVATE)
    val hadDuration = preferences.contains("duration_millis")
    val previousDuration = preferences.getLong("duration_millis", 0L)
    try {
      preferences.edit().putLong("duration_millis", 9_000L).commit()

      val snapshot = PassiveCaptureRuntime(context).getSnapshot()

      assertEquals(PassiveCaptureState.DISABLED, snapshot.state)
      assertEquals(9.0, snapshot.config.measurementDurationSeconds, 0.0)
      val cameraProbe = CameraUseGuard.tryAcquire("legacy-config-probe")
      assertNotNull("旧配置读取不应启动相机会话", cameraProbe)
      cameraProbe?.close()
    } finally {
      val editor = preferences.edit()
      if (hadDuration) editor.putLong("duration_millis", previousDuration)
      else editor.remove("duration_millis")
      editor.commit()
    }
  }

  @Test
  fun reconstructedRuntimeKeepsSavedConfigButDoesNotRestoreRunningState() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext
    val preferences = context.getSharedPreferences("passive_capture", Context.MODE_PRIVATE)
    val hadInterval = preferences.contains("interval_millis")
    val previousInterval = preferences.getLong("interval_millis", 0L)
    val hadDuration = preferences.contains("duration_millis")
    val previousDuration = preferences.getLong("duration_millis", 0L)
    try {
      val configured = PassiveCaptureConfig(intervalSeconds = 120.0, measurementDurationSeconds = 35.0)
      val configurationResult = PassiveCaptureRuntime(context).setConfig(configured)
      assertNull(configurationResult.errorCode?.asSecondOrNull())

      val reconstructed = PassiveCaptureRuntime(context).getSnapshot()

      assertEquals(PassiveCaptureState.DISABLED, reconstructed.state)
      assertEquals(120.0, reconstructed.config.intervalSeconds, 0.0)
      assertEquals(35.0, reconstructed.config.measurementDurationSeconds, 0.0)
      val cameraProbe = CameraUseGuard.tryAcquire("runtime-reconstruction-probe")
      assertNotNull("新运行时实例不应从保存配置重启相机会话", cameraProbe)
      cameraProbe?.close()
    } finally {
      val editor = preferences.edit()
      if (hadInterval) editor.putLong("interval_millis", previousInterval)
      else editor.remove("interval_millis")
      if (hadDuration) editor.putLong("duration_millis", previousDuration)
      else editor.remove("duration_millis")
      editor.commit()
    }
  }

  @Test
  fun invalidValuesReturnStableExplainableErrorsWithoutOpeningCamera() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext
    val runtime = PassiveCaptureRuntime(context)

    val invalidInterval = runtime.setConfig(
      PassiveCaptureConfig(intervalSeconds = Double.POSITIVE_INFINITY, measurementDurationSeconds = 30.0),
    )
    assertEquals("INVALID_INTERVAL", invalidInterval.errorCode?.asSecondOrNull())
    assertTrue(checkNotNull(invalidInterval.errorMessage?.asSecondOrNull()).contains("纳秒"))

    val invalidDuration = runtime.setConfig(
      PassiveCaptureConfig(intervalSeconds = 60.0, measurementDurationSeconds = Double.NaN),
    )
    assertEquals("INVALID_MEASUREMENT_DURATION", invalidDuration.errorCode?.asSecondOrNull())
    assertTrue(checkNotNull(invalidDuration.errorMessage?.asSecondOrNull()).contains("有限正数"))

    val cameraProbe = CameraUseGuard.tryAcquire("invalid-config-probe")
    assertNotNull("非法配置不应启动相机会话", cameraProbe)
    cameraProbe?.close()
  }
}
