/** 验证按类型控制、设备注册失败回收和样本回调隔离。 */

package com.healthcvapp.acquisition.sensors.runtime

import com.healthcvapp.acquisition.sensors.model.SensorCaptureFailure
import com.healthcvapp.acquisition.sensors.model.SensorKind
import com.healthcvapp.acquisition.sensors.model.SensorPhase
import com.healthcvapp.acquisition.sensors.session.SensorCaptureClock
import com.healthcvapp.acquisition.sensors.source.AndroidSensorSource
import com.healthcvapp.acquisition.sensors.source.SensorDevice
import com.healthcvapp.acquisition.sensors.source.SensorDeviceAdapter
import com.healthcvapp.acquisition.sensors.source.SensorEventCallback
import java.io.File
import java.nio.file.Files
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** 覆盖配置前置校验、同类型忙、设备失败和多源独立行为。 */
class SensorControllerTest {
  @Test
  fun `invalid periods fail before querying or registering a device`() = runTest {
    withTemporaryDirectory { root ->
      val adapter = FakeSensorDeviceAdapter(SensorKind.ACCELEROMETER)
      val controller = controller(root, SensorKind.ACCELEROMETER, adapter)

      val error = captureFailure { controller.startCapture(Double.NaN) }

      assertEquals("INVALID_SENSOR_CONFIG", error.code)
      assertEquals(0, adapter.capabilityQueryCount)
      assertEquals(0, adapter.registrationCount)
      assertFalse(root.listFiles()?.isNotEmpty() == true)
    }
  }

  @Test
  fun `background start is rejected before querying or registering a device`() = runTest {
    withTemporaryDirectory { root ->
      val adapter = FakeSensorDeviceAdapter(SensorKind.ACCELEROMETER)
      val controller = controller(root, SensorKind.ACCELEROMETER, adapter, foreground = { false })

      val error = captureFailure { controller.startCapture(20_000.0) }

      assertEquals("APP_NOT_FOREGROUND", error.code)
      assertEquals(0, adapter.capabilityQueryCount)
      assertEquals(0, adapter.registrationCount)
      assertFalse(root.listFiles()?.isNotEmpty() == true)
    }
  }

  @Test
  fun `missing device and rejected registration do not publish and permit a later retry`() = runTest {
    withTemporaryDirectory { root ->
      val missingAdapter = FakeSensorDeviceAdapter(SensorKind.GYROSCOPE, device = null)
      val missingController = controller(root, SensorKind.GYROSCOPE, missingAdapter)
      val missingError = captureFailure { missingController.startCapture(20_000.0) }
      assertEquals("SENSOR_UNAVAILABLE", missingError.code)
      assertEquals(0, missingAdapter.registrationCount)
      assertFalse(root.listFiles()?.any { it.name == "acquisition" } == true)

      val adapter = FakeSensorDeviceAdapter(SensorKind.ACCELEROMETER, registrationResult = false)
      val activeController = controller(root, SensorKind.ACCELEROMETER, adapter)
      val registrationError = captureFailure { activeController.startCapture(20_000.0) }
      assertEquals("SENSOR_REGISTRATION_FAILED", registrationError.code)
      assertEquals(SensorPhase.FAILED, activeController.getSnapshot().phase)
      assertEquals(0, adapter.unregisterCount)
      assertFalse(File(root, "acquisition/sensors/accelerometer/${activeController.getSnapshot().sessionId}/accelerometer.csv").exists())

      adapter.registrationResult = true
      activeController.startCapture(20_000.0)
      adapter.emit(10_000_000_001L, floatArrayOf(1f, 2f, 3f))
      val artifact = activeController.stopCapture()

      assertEquals(1L, artifact.sampleCount)
      assertEquals(1, adapter.unregisterCount)
    }
  }

  @Test
  fun `registration exceptions retain their error and leave the source reusable`() = runTest {
    withTemporaryDirectory { root ->
      val adapter = FakeSensorDeviceAdapter(
        SensorKind.MAGNETOMETER,
        registrationError = IllegalStateException("registration failed"),
      )
      val controller = controller(root, SensorKind.MAGNETOMETER, adapter)

      val error = captureFailure { controller.startCapture(20_000.0) }

      assertEquals("SENSOR_REGISTRATION_FAILED", error.code)
      assertEquals(1, adapter.registrationCount)
      assertEquals(0, adapter.unregisterCount)
      assertFalse(adapter.hasListener)
      adapter.registrationError = null
      controller.startCapture(20_000.0)
      adapter.emit(10_000_000_001L, floatArrayOf(1f, 2f, 3f))
      val artifact = controller.stopCapture()

      assertEquals(2, adapter.registrationCount)
      assertEquals(1, adapter.unregisterCount)
      assertEquals(1L, artifact.sampleCount)
    }
  }

  @Test
  fun `snapshot copies reused arrays and ignores prestart events`() = runTest {
    withTemporaryDirectory { root ->
      val clock = MutableSensorClock()
      val adapter = FakeSensorDeviceAdapter(SensorKind.ACCELEROMETER, minDelayMicros = 10_000)
      val controller = controller(root, SensorKind.ACCELEROMETER, adapter, clock)

      controller.startCapture(5_000.0)
      assertEquals(10_000, adapter.registeredSamplingPeriodMicros)
      adapter.emit(clock.elapsedRealtimeNanos - 1L, floatArrayOf(99f, 99f, 99f))

      val reusedValues = floatArrayOf(11.25f, 22.5f, 33.75f)
      clock.advance(1_234L)
      adapter.emit(clock.elapsedRealtimeNanos, reusedValues)
      reusedValues[0] = 99f
      clock.advance(1_111L)
      adapter.emit(clock.elapsedRealtimeNanos, reusedValues)
      val artifact = controller.stopCapture()
      val rows = File(artifact.path).readLines()

      assertEquals(2L, artifact.sampleCount)
      assertEquals(5_000, artifact.requestedSamplingPeriodMicros)
      assertEquals(10_000, artifact.registeredSamplingPeriodMicros)
      assertEquals("timestamp,timestampEvent,timestampSystem,accX,accY,accZ", rows[0])
      assertTrue(rows[1].endsWith(",11.25,22.5,33.75"))
      assertTrue(rows[2].endsWith(",99.0,22.5,33.75"))
    }
  }

  @Test
  fun `stale stop waiter retains its completed session during a new start`() = runTest {
    withTemporaryDirectory { root ->
      val clock = MutableSensorClock()
      val adapter = FakeSensorDeviceAdapter(SensorKind.ACCELEROMETER)
      val controller = controller(root, SensorKind.ACCELEROMETER, adapter, clock)
      controller.startCapture(20_000.0)
      adapter.emit(clock.elapsedRealtimeNanos, floatArrayOf(1f, 2f, 3f))
      val completedArtifact = controller.stopCapture()

      val capabilityQueryEntered = CountDownLatch(1)
      val releaseCapabilityQuery = CountDownLatch(1)
      adapter.capabilityQueryEntered = capabilityQueryEntered
      adapter.releaseCapabilityQuery = releaseCapabilityQuery
      val nextStart = async(Dispatchers.IO) { controller.startCapture(20_000.0) }
      assertTrue(capabilityQueryEntered.await(5, TimeUnit.SECONDS))
      val staleStop = async(start = CoroutineStart.UNDISPATCHED) { controller.stopCapture() }
      assertFalse(staleStop.isCompleted)

      releaseCapabilityQuery.countDown()
      nextStart.await()
      assertEquals(completedArtifact, staleStop.await())
      assertEquals(SensorPhase.CAPTURING, controller.getSnapshot().phase)
      assertTrue(adapter.hasListener)
      clock.advance(1_000L)
      adapter.emit(clock.elapsedRealtimeNanos, floatArrayOf(4f, 5f, 6f))
      val nextArtifact = controller.stopCapture()

      assertTrue(completedArtifact.sessionId != nextArtifact.sessionId)
      assertEquals(1L, nextArtifact.sampleCount)
      assertEquals(2, controller.listArtifacts().size)
    }
  }

  @Test
  fun `concurrent stop commands return their bound session before a new start`() = runTest {
    withTemporaryDirectory { root ->
      val clock = MutableSensorClock()
      val unregisterEntered = CountDownLatch(1)
      val releaseUnregister = CountDownLatch(1)
      val adapter = FakeSensorDeviceAdapter(
        kind = SensorKind.ACCELEROMETER,
        unregisterEntered = unregisterEntered,
        releaseUnregister = releaseUnregister,
      )
      val controller = controller(
        root = root,
        kind = SensorKind.ACCELEROMETER,
        adapter = adapter,
        clock = clock,
        ioDispatcher = Dispatchers.IO,
      )
      controller.startCapture(20_000.0)
      adapter.emit(clock.elapsedRealtimeNanos, floatArrayOf(1f, 2f, 3f))

      val firstStop = async(start = CoroutineStart.UNDISPATCHED) { controller.stopCapture() }
      assertTrue(unregisterEntered.await(5, TimeUnit.SECONDS))
      val secondStop = async(start = CoroutineStart.UNDISPATCHED) { controller.stopCapture() }
      assertFalse(secondStop.isCompleted)
      releaseUnregister.countDown()
      val firstArtifact = firstStop.await()
      val secondArtifact = secondStop.await()

      assertEquals(firstArtifact, secondArtifact)
      clock.advance(1_000L)
      controller.startCapture(20_000.0)
      adapter.emit(clock.elapsedRealtimeNanos, floatArrayOf(4f, 5f, 6f))
      val nextArtifact = controller.stopCapture()

      assertTrue(firstArtifact.sessionId != nextArtifact.sessionId)
      assertEquals(1L, nextArtifact.sampleCount)
      assertEquals(2, controller.listArtifacts().size)
    }
  }

  @Test
  fun `stopping one type leaves another type receiving and publishing later events`() = runTest {
    withTemporaryDirectory { root ->
      val clock = MutableSensorClock()
      val accelerationAdapter = FakeSensorDeviceAdapter(SensorKind.ACCELEROMETER)
      val gyroscopeAdapter = FakeSensorDeviceAdapter(SensorKind.GYROSCOPE)
      val acceleration = controller(root, SensorKind.ACCELEROMETER, accelerationAdapter, clock)
      val gyroscope = controller(root, SensorKind.GYROSCOPE, gyroscopeAdapter, clock)

      acceleration.startCapture(20_000.0)
      val repeatedStart = captureFailure { acceleration.startCapture(30_000.0) }
      assertEquals("SENSOR_BUSY", repeatedStart.code)
      gyroscope.startCapture(35_000.0)
      assertEquals(20_000, acceleration.getSnapshot().requestedSamplingPeriodMicros)
      assertEquals(35_000, gyroscope.getSnapshot().requestedSamplingPeriodMicros)
      clock.advance(1_000_000L)
      accelerationAdapter.emit(clock.elapsedRealtimeNanos, floatArrayOf(1f, 2f, 3f))
      gyroscopeAdapter.emit(clock.elapsedRealtimeNanos, floatArrayOf(4f, 5f, 6f))
      val accelerationArtifact = acceleration.stopCapture()
      assertEquals(SensorPhase.IDLE, acceleration.getSnapshot().phase)
      assertEquals(SensorPhase.CAPTURING, gyroscope.getSnapshot().phase)
      clock.advance(1_000_000L)
      gyroscopeAdapter.emit(clock.elapsedRealtimeNanos, floatArrayOf(7f, 8f, 9f))
      val gyroscopeArtifact = gyroscope.stopCapture()

      assertEquals(1L, accelerationArtifact.sampleCount)
      assertEquals(2L, gyroscopeArtifact.sampleCount)
      assertTrue(accelerationArtifact.path != gyroscopeArtifact.path)
      assertEquals(SensorKind.ACCELEROMETER, acceleration.listArtifacts().single().kind)
      assertEquals(SensorKind.GYROSCOPE, gyroscope.listArtifacts().single().kind)
      assertTrue(File(gyroscopeArtifact.path).readLines()[2].endsWith(",7.0,8.0,9.0"))
    }
  }

  @Test
  fun `one source failure does not interrupt another source`() = runTest {
    withTemporaryDirectory { root ->
      val clock = MutableSensorClock()
      val accelerationAdapter = FakeSensorDeviceAdapter(SensorKind.ACCELEROMETER)
      val gyroscopeAdapter = FakeSensorDeviceAdapter(SensorKind.GYROSCOPE)
      val acceleration = controller(root, SensorKind.ACCELEROMETER, accelerationAdapter, clock)
      val gyroscope = controller(root, SensorKind.GYROSCOPE, gyroscopeAdapter, clock)
      acceleration.startCapture(20_000.0)
      gyroscope.startCapture(45_000.0)

      accelerationAdapter.emit(clock.elapsedRealtimeNanos, floatArrayOf(1f, 2f))
      assertEquals(SensorPhase.FAILED, acceleration.getSnapshot().phase)
      assertEquals("SENSOR_DATA_INVALID", acceleration.getSnapshot().errorCode)
      assertEquals(SensorPhase.CAPTURING, gyroscope.getSnapshot().phase)
      assertEquals(45_000, gyroscope.getSnapshot().requestedSamplingPeriodMicros)
      assertTrue(gyroscopeAdapter.hasListener)
      clock.advance(1_000_000L)
      gyroscopeAdapter.emit(clock.elapsedRealtimeNanos, floatArrayOf(4f, 5f, 6f))
      val gyroscopeArtifact = gyroscope.stopCapture()

      assertEquals(1L, gyroscopeArtifact.sampleCount)
      assertEquals(1, gyroscope.listArtifacts().size)
      assertTrue(acceleration.listArtifacts().isEmpty())
      assertFalse(accelerationAdapter.hasListener)
      assertTrue(File(gyroscopeArtifact.path).readLines()[1].endsWith(",4.0,5.0,6.0"))
    }
  }

  @Test
  fun `damaged vectors fail without padding values or publishing a completed file`() = runTest {
    val damagedValues = listOf(floatArrayOf(1f, 2f), floatArrayOf(Float.NaN, 2f, 3f))
    for (values in damagedValues) {
      withTemporaryDirectory { root ->
        val clock = MutableSensorClock()
        val adapter = FakeSensorDeviceAdapter(SensorKind.ACCELEROMETER)
        val controller = controller(root, SensorKind.ACCELEROMETER, adapter, clock)
        controller.startCapture(20_000.0)
        adapter.emit(clock.elapsedRealtimeNanos, values)

        val error = captureFailure { controller.stopCapture() }
        val sessionId = checkNotNull(controller.getSnapshot().sessionId)
        val partialFile = File(root, "acquisition/sensors/accelerometer/$sessionId/accelerometer.csv.part")

        assertEquals("SENSOR_DATA_INVALID", error.code)
        assertFalse(adapter.hasListener)
        assertTrue(partialFile.isFile)
        assertEquals(1, partialFile.readLines().size)
        assertFalse(File(root, "acquisition/sensors/accelerometer/$sessionId/accelerometer.csv").exists())
      }
    }
  }

  @Test
  fun `callback from a completed session cannot enter the next session`() = runTest {
    withTemporaryDirectory { root ->
      val clock = MutableSensorClock()
      val adapter = FakeSensorDeviceAdapter(SensorKind.ACCELEROMETER)
      val controller = controller(root, SensorKind.ACCELEROMETER, adapter, clock)

      controller.startCapture(20_000.0)
      adapter.emit(clock.elapsedRealtimeNanos, floatArrayOf(1f, 2f, 3f))
      val firstArtifact = controller.stopCapture()
      clock.advance(1_000L)
      controller.startCapture(20_000.0)
      adapter.emitFromSession(0, clock.elapsedRealtimeNanos, floatArrayOf(90f, 91f, 92f))
      adapter.emit(clock.elapsedRealtimeNanos, floatArrayOf(4f, 5f, 6f))
      val secondArtifact = controller.stopCapture()
      val rows = File(secondArtifact.path).readLines()

      assertTrue(firstArtifact.sessionId != secondArtifact.sessionId)
      assertEquals(1L, secondArtifact.sampleCount)
      assertEquals(2, rows.size)
      assertTrue(rows[1].endsWith(",4.0,5.0,6.0"))
    }
  }

  /** 使用可控时间源创建无 Android Looper 依赖的测试控制器。 */
  private fun controller(
    root: File,
    kind: SensorKind,
    adapter: FakeSensorDeviceAdapter,
    clock: MutableSensorClock = MutableSensorClock(),
    foreground: () -> Boolean = { true },
    ioDispatcher: CoroutineDispatcher = Dispatchers.Unconfined,
  ) = SensorController(
    kind = kind,
    filesDirectory = root,
    source = AndroidSensorSource(adapter),
    isForeground = foreground,
    controllerDispatcher = Dispatchers.Unconfined,
    clock = clock,
    ioDispatcher = ioDispatcher,
    consumerDispatcher = Dispatchers.Unconfined,
  )

  /** 等待一个命令失败并返回可检查的结构化错误。 */
  private suspend fun captureFailure(command: suspend () -> Unit): SensorCaptureFailure {
    try {
      command()
    } catch (error: SensorCaptureFailure) {
      return error
    }
    throw AssertionError("Expected SensorCaptureFailure")
  }

  /** 在临时根目录中运行异步控制器行为并清理生成文件。 */
  private suspend fun withTemporaryDirectory(block: suspend (File) -> Unit) {
    val root = Files.createTempDirectory("sensor-controller").toFile()
    try {
      block(root)
    } finally {
      root.deleteRecursively()
    }
  }
}

/** 提供可推进的 elapsedRealtime 与 System.nanoTime 单调值。 */
private class MutableSensorClock(
  var elapsedRealtimeNanos: Long = 10_000_000_000L,
  private var systemNanos: Long = 20_000_000_000L,
) : SensorCaptureClock {
  override fun elapsedRealtimeNanos(): Long = elapsedRealtimeNanos

  override fun nanoTime(): Long = systemNanos

  /** 同步推进两种单调时间，以便生成有分数毫秒的事件。 */
  fun advance(nanos: Long) {
    elapsedRealtimeNanos += nanos
    systemNanos += nanos + 111L
  }
}

/** 通过可控设备描述和回调模拟 Android 默认传感器边界。 */
private class FakeSensorDeviceAdapter(
  private val kind: SensorKind,
  device: SensorDevice? = SensorDevice(Any(), "test-${kind.wireName}", 0),
  private val minDelayMicros: Int = device?.minSamplingPeriodMicros ?: 0,
  var registrationResult: Boolean = true,
  var registrationError: Throwable? = null,
  private val unregisterEntered: CountDownLatch? = null,
  private val releaseUnregister: CountDownLatch? = null,
) : SensorDeviceAdapter {
  private val sensorDevice = device?.copy(minSamplingPeriodMicros = minDelayMicros)
  var capabilityQueryCount = 0
    private set
  var registrationCount = 0
    private set
  var unregisterCount = 0
    private set
  var registeredSamplingPeriodMicros: Int? = null
    private set
  var capabilityQueryEntered: CountDownLatch? = null
  var releaseCapabilityQuery: CountDownLatch? = null
  private var callback: SensorEventCallback? = null
  private val callbacks = mutableListOf<SensorEventCallback>()
  val hasListener: Boolean get() = callback != null

  override fun getDefaultSensor(androidType: Int): SensorDevice? {
    capabilityQueryCount += 1
    capabilityQueryEntered?.countDown()
    releaseCapabilityQuery?.let {
      check(it.await(5, TimeUnit.SECONDS)) { "capability query was not released" }
    }
    return if (androidType == kind.androidType) sensorDevice else null
  }

  override fun registerListener(
    device: SensorDevice,
    samplingPeriodMicros: Int,
    callback: SensorEventCallback,
  ): Boolean {
    registrationCount += 1
    registrationError?.let { throw it }
    if (!registrationResult) return false
    registeredSamplingPeriodMicros = samplingPeriodMicros
    this.callback = callback
    callbacks += callback
    return true
  }

  override fun unregisterListener(device: SensorDevice, callback: SensorEventCallback) {
    unregisterCount += 1
    if (this.callback === callback) this.callback = null
    unregisterEntered?.countDown()
    releaseUnregister?.let {
      check(it.await(5, TimeUnit.SECONDS)) { "unregister was not released" }
    }
  }

  /** 以当前注册监听同步交付一条系统事件。 */
  fun emit(timestampNanos: Long, values: FloatArray) {
    callback?.invoke(timestampNanos, values) ?: throw AssertionError("Sensor listener is not registered")
  }

  /** 以旧会话已注销的回调交付迟到事件。 */
  fun emitFromSession(sessionIndex: Int, timestampNanos: Long, values: FloatArray) {
    callbacks[sessionIndex].invoke(timestampNanos, values)
  }
}
