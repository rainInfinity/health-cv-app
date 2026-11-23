/** 验证默认配置迁移、显式保存及运行态隔离，不启动相机会话。 */
package com.healthcvapp.acquisition.passive.runtime

import android.content.Context
import android.content.SharedPreferences
import androidx.test.platform.app.InstrumentationRegistry
import com.healthcvapp.acquisition.camera.ownership.CameraUseGuard
import com.healthcvapp.acquisition.rppg.model.RPPGInstantHeartRate
import com.margelo.nitro.acquisition.BuildConfig
import com.margelo.nitro.acquisition.PassiveCaptureConfig
import com.margelo.nitro.acquisition.PassiveCaptureState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
  fun preservesLegacyDurationWithoutEnablingServiceOrAcquiringCamera() = withIsolatedConfig { context, preferences ->
    preferences.edit()
      .putLong("interval_millis", 7_200_000L)
      .putLong("duration_millis", 9_000L)
      .commit()

    val snapshot = PassiveCaptureRuntime(context).getSnapshot()

    assertEquals(PassiveCaptureState.DISABLED, snapshot.state)
    assertEquals(defaultIntervalSeconds(), snapshot.config.intervalSeconds, 0.0)
    assertEquals(9.0, snapshot.config.measurementDurationSeconds, 0.0)
    assertFalse(preferences.contains("interval_millis"))
    val cameraProbe = CameraUseGuard.tryAcquire("legacy-config-probe")
    assertNotNull("旧配置读取不应启动相机会话", cameraProbe)
    cameraProbe?.close()
  }

  @Test
  fun reconstructedRuntimeKeepsSavedConfigButDoesNotRestoreRunningState() = withIsolatedConfig { context, _ ->
    val configured = PassiveCaptureConfig(intervalSeconds = 120.0, measurementDurationSeconds = 35.0)
    val runtime = PassiveCaptureRuntime(context)
    val configurationResult = runtime.setConfig(configured)
    assertNull(configurationResult.errorCode?.asSecondOrNull())

    val reconstructed = PassiveCaptureRuntime(context).getSnapshot()

    assertEquals(PassiveCaptureState.DISABLED, reconstructed.state)
    assertEquals(120.0, reconstructed.config.intervalSeconds, 0.0)
    assertEquals(35.0, reconstructed.config.measurementDurationSeconds, 0.0)
    val cameraProbe = CameraUseGuard.tryAcquire("runtime-reconstruction-probe")
    assertNotNull("新运行时实例不应从保存配置重启相机会话", cameraProbe)
    cameraProbe?.close()

    // 迁移之后用户明确保存的旧默认数值不应再次被覆盖。
    assertNull(runtime.setConfig(
      PassiveCaptureConfig(intervalSeconds = 7_200.0, measurementDurationSeconds = 30.0),
    ).errorCode?.asSecondOrNull())
    val explicitlySaved = PassiveCaptureRuntime(context).getSnapshot()
    assertEquals(7_200.0, explicitlySaved.config.intervalSeconds, 0.0)
    assertEquals(30.0, explicitlySaved.config.measurementDurationSeconds, 0.0)
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

  @Test
  fun migratesOnlyLegacyDefaultsAndKeepsDefaultIntervalVariantLocal() = withIsolatedConfig { context, preferences ->
    preferences.edit()
      .putLong("interval_millis", 7_200_000L)
      .putLong("duration_millis", 30_000L)
      .commit()

    val migrated = PassiveCaptureRuntime(context).getSnapshot()
    assertEquals(defaultIntervalSeconds(), migrated.config.intervalSeconds, 0.0)
    assertEquals(12.0, migrated.config.measurementDurationSeconds, 0.0)
    assertEquals(6.5, migrated.minimumHeartRateMeasurementSeconds, 0.0)
    assertFalse(preferences.contains("interval_millis"))
    assertFalse(preferences.contains("duration_millis"))
    assertEquals(2, preferences.getInt("defaults_version", 0))

    // 周期自定义与时长旧默认按字段独立迁移。
    preferences.edit()
      .remove("defaults_version")
      .putLong("interval_millis", 120_000L)
      .putLong("duration_millis", 30_000L)
      .commit()
    val customized = PassiveCaptureRuntime(context).getSnapshot()
    assertEquals(120.0, customized.config.intervalSeconds, 0.0)
    assertEquals(12.0, customized.config.measurementDurationSeconds, 0.0)
  }

  @Test
  fun freshInstallUsesDefaultsWithoutPersistingAnEnvironmentSpecificInterval() = withIsolatedConfig { context, preferences ->
    val snapshot = PassiveCaptureRuntime(context).getSnapshot()
    assertEquals(defaultIntervalSeconds(), snapshot.config.intervalSeconds, 0.0)
    assertEquals(12.0, snapshot.config.measurementDurationSeconds, 0.0)
    assertFalse(preferences.contains("interval_millis"))
    assertFalse(preferences.contains("duration_millis"))
  }

  /** 只隔离本组测试涉及的配置键，不改动设备上的其它偏好。 */
  private fun withIsolatedConfig(block: (Context, SharedPreferences) -> Unit) {
    val context = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext
    val preferences = context.getSharedPreferences("passive_capture", Context.MODE_PRIVATE)
    val previous = preferences.all
    preferences.edit()
      .remove("interval_millis")
      .remove("duration_millis")
      .remove("defaults_version")
      .commit()
    try {
      block(context, preferences)
    } finally {
      val editor = preferences.edit()
      for (key in listOf("interval_millis", "duration_millis", "defaults_version")) {
        when (val value = previous[key]) {
          null -> editor.remove(key)
          is Long -> editor.putLong(key, value)
          is Int -> editor.putInt(key, value)
          else -> error("Unexpected preference type for $key")
        }
      }
      editor.commit()
    }
  }

  /** 库的 debug/release 变体决定默认周期，不读取 JS 或运行时环境变量。 */
  private fun defaultIntervalSeconds(): Double = if (BuildConfig.DEBUG) 30.0 else 600.0
}
