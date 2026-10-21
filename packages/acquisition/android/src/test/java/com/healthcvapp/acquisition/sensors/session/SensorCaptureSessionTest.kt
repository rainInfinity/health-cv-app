/** 验证传感器会话停止屏障、队列容量和输出失败不发布。 */

package com.healthcvapp.acquisition.sensors.session

import com.healthcvapp.acquisition.sensors.model.SensorCaptureFailure
import com.healthcvapp.acquisition.sensors.model.SensorConfig
import com.healthcvapp.acquisition.sensors.model.SensorKind
import com.healthcvapp.acquisition.sensors.model.SensorSample
import com.healthcvapp.acquisition.sensors.output.SensorCsvEncoder
import com.healthcvapp.acquisition.sensors.output.SensorSessionOutput
import com.healthcvapp.acquisition.sensors.source.AndroidSensorSource
import com.healthcvapp.acquisition.sensors.source.SensorDevice
import com.healthcvapp.acquisition.sensors.source.SensorDeviceAdapter
import com.healthcvapp.acquisition.sensors.source.SensorEventCallback
import com.healthcvapp.acquisition.storage.AcquisitionFileStore
import com.healthcvapp.acquisition.storage.AcquisitionPaths
import com.healthcvapp.acquisition.storage.csv.BatchWriter
import com.healthcvapp.acquisition.storage.csv.BatchWriterFactory
import com.healthcvapp.acquisition.storage.csv.CsvBatchWriterFactory
import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** 覆盖停止并发、阻塞消费者和队列过载收尾。 */
class SensorCaptureSessionTest {
  @Test
  fun `concurrent stop waits for writer and publishes the drained tail batch`() = runTest {
    withTemporaryDirectory { root ->
      val clock = MutableSessionClock()
      val adapter = FakeSessionSensorAdapter()
      val writerEntered = CompletableDeferred<Unit>()
      val releaseWriter = CompletableDeferred<Unit>()
      val sessionId = "stop-barrier"
      val session = session(
        root = root,
        adapter = adapter,
        clock = clock,
        sessionId = sessionId,
        capacity = 2,
        batchSize = 1,
        writerFactory = blockingWriterFactory(writerEntered, releaseWriter),
      )
      session.start()
      adapter.emit(clock.elapsedRealtimeNanos, floatArrayOf(1.25f, 2.5f, 3.75f))
      writerEntered.await()

      val firstStop = async(start = CoroutineStart.UNDISPATCHED) { session.stop() }
      val secondStop = async(start = CoroutineStart.UNDISPATCHED) { session.stop() }
      val paths = AcquisitionPaths(root)
      val partialFile = paths.sensorPartialFile(SensorKind.ACCELEROMETER, sessionId)
      val completedFile = paths.sensorCompletedFile(SensorKind.ACCELEROMETER, sessionId)

      assertFalse(firstStop.isCompleted)
      assertFalse(secondStop.isCompleted)
      assertTrue(partialFile.isFile)
      assertFalse(completedFile.exists())
      assertFalse(adapter.hasListener)

      releaseWriter.complete(Unit)
      val firstArtifact = firstStop.await()
      val secondArtifact = secondStop.await()

      assertEquals(firstArtifact, secondArtifact)
      assertEquals(1L, firstArtifact.sampleCount)
      assertEquals(2, File(firstArtifact.path).readLines().size)
      assertTrue(completedFile.isFile)
      assertFalse(partialFile.exists())
    }
  }

  @Test
  fun `stop waits for a callback that already entered its snapshot`() = runTest {
    withTemporaryDirectory { root ->
      val clock = CallbackBlockingSessionClock()
      val adapter = FakeSessionSensorAdapter()
      val sessionId = "callback-barrier"
      val session = session(
        root = root,
        adapter = adapter,
        clock = clock,
        sessionId = sessionId,
        capacity = 2,
        batchSize = 1,
        writerFactory = CsvBatchWriterFactory(
          AcquisitionFileStore(),
          SensorCsvEncoder(SensorKind.ACCELEROMETER),
        ),
        ioDispatcher = Dispatchers.IO,
      )
      session.start()
      val eventThread = Thread {
        adapter.emit(clock.elapsedRealtimeNanos(), floatArrayOf(1f, 2f, 3f))
      }
      eventThread.start()
      assertTrue(clock.sampleSnapshotEntered.await(5, TimeUnit.SECONDS))

      val stop = async(start = CoroutineStart.UNDISPATCHED) { session.stop() }
      assertTrue(adapter.unregisterEntered.await(5, TimeUnit.SECONDS))
      assertFalse(stop.isCompleted)

      clock.releaseSampleSnapshot.countDown()
      eventThread.join(5_000L)
      assertFalse(eventThread.isAlive)
      val artifact = stop.await()

      assertEquals(1L, artifact.sampleCount)
      assertEquals(2, File(artifact.path).readLines().size)
      assertFalse(adapter.hasListener)
    }
  }

  @Test
  fun `failure during registration waits for late registration and unregisters it`() = runTest {
    withTemporaryDirectory { root ->
      val registrationEntered = CountDownLatch(1)
      val releaseRegistration = CountDownLatch(1)
      val adapter = FakeSessionSensorAdapter(registrationEntered, releaseRegistration)
      val sessionId = "registration-race"
      val session = session(
        root = root,
        adapter = adapter,
        clock = MutableSessionClock(),
        sessionId = sessionId,
        capacity = 2,
        batchSize = 1,
        writerFactory = CsvBatchWriterFactory(
          AcquisitionFileStore(),
          SensorCsvEncoder(SensorKind.ACCELEROMETER),
        ),
        ioDispatcher = Dispatchers.IO,
      )
      var startFailure: Throwable? = null
      val startThread = Thread {
        try {
          runBlocking { session.start() }
        } catch (error: Throwable) {
          startFailure = error
        }
      }
      startThread.start()
      assertTrue(registrationEntered.await(5, TimeUnit.SECONDS))
      session.fail(SensorCaptureFailure("APP_NOT_FOREGROUND", "app paused"))
      releaseRegistration.countDown()
      startThread.join(5_000L)
      assertFalse(startThread.isAlive)
      val cleanupFailure = captureFailure { session.stop() }

      val failure = startFailure as? SensorCaptureFailure
        ?: throw AssertionError("Expected SensorCaptureFailure")
      val paths = AcquisitionPaths(root)
      assertEquals("APP_NOT_FOREGROUND", failure.code)
      assertEquals("APP_NOT_FOREGROUND", cleanupFailure.code)
      assertEquals(1, adapter.registrationCount)
      assertEquals(1, adapter.unregisterCount)
      assertFalse(adapter.hasListener)
      assertFalse(paths.sensorCompletedFile(SensorKind.ACCELEROMETER, sessionId).exists())
      assertTrue(paths.sensorPartialFile(SensorKind.ACCELEROMETER, sessionId).isFile)
    }
  }

  @Test
  fun `capacity overflow fails the session and never publishes its partial file`() = runTest {
    withTemporaryDirectory { root ->
      val clock = MutableSessionClock()
      val adapter = FakeSessionSensorAdapter()
      val writerEntered = CompletableDeferred<Unit>()
      val releaseWriter = CompletableDeferred<Unit>()
      val sessionId = "capacity-overflow"
      val session = session(
        root = root,
        adapter = adapter,
        clock = clock,
        sessionId = sessionId,
        capacity = 1,
        batchSize = 1,
        writerFactory = blockingWriterFactory(writerEntered, releaseWriter),
        ioDispatcher = Dispatchers.IO,
      )
      session.start()
      adapter.emit(clock.elapsedRealtimeNanos, floatArrayOf(1f, 2f, 3f))
      writerEntered.await()
      clock.advance(1_000L)
      adapter.emit(clock.elapsedRealtimeNanos, floatArrayOf(4f, 5f, 6f))

      val stop = async(start = CoroutineStart.UNDISPATCHED) { captureFailure { session.stop() } }
      val paths = AcquisitionPaths(root)
      assertFalse(stop.isCompleted)
      assertFalse(paths.sensorCompletedFile(SensorKind.ACCELEROMETER, sessionId).exists())

      releaseWriter.complete(Unit)
      val error = stop.await()

      assertEquals("DATAHUB_CAPACITY_EXCEEDED", error.code)
      assertFalse(paths.sensorCompletedFile(SensorKind.ACCELEROMETER, sessionId).exists())
      assertTrue(paths.sensorPartialFile(SensorKind.ACCELEROMETER, sessionId).isFile)
      assertFalse(adapter.hasListener)
    }
  }

  @Test
  fun `empty session is stopped and released without publishing a completed artifact`() = runTest {
    withTemporaryDirectory { root ->
      val adapter = FakeSessionSensorAdapter()
      val sessionId = "no-samples"
      val session = session(
        root = root,
        adapter = adapter,
        clock = MutableSessionClock(),
        sessionId = sessionId,
        capacity = 2,
        batchSize = 1,
        writerFactory = CsvBatchWriterFactory(
          AcquisitionFileStore(),
          SensorCsvEncoder(SensorKind.ACCELEROMETER),
        ),
      )
      session.start()

      val error = captureFailure { session.stop() }
      val paths = AcquisitionPaths(root)

      assertEquals("SENSOR_NO_SAMPLES", error.code)
      assertFalse(adapter.hasListener)
      assertTrue(paths.sensorPartialFile(SensorKind.ACCELEROMETER, sessionId).isFile)
      assertFalse(paths.sensorCompletedFile(SensorKind.ACCELEROMETER, sessionId).exists())
    }
  }

  @Test
  fun `writer failure is terminal and preserves the partial file without a completed artifact`() = runTest {
    withTemporaryDirectory { root ->
      val adapter = FakeSessionSensorAdapter()
      val sessionId = "writer-failure"
      val session = session(
        root = root,
        adapter = adapter,
        clock = MutableSessionClock(),
        sessionId = sessionId,
        capacity = 2,
        batchSize = 1,
        writerFactory = failingWriterFactory(),
        ioDispatcher = Dispatchers.IO,
      )
      session.start()
      adapter.emit(10_000_000_000L, floatArrayOf(1f, 2f, 3f))

      val error = captureFailure { session.stop() }
      val paths = AcquisitionPaths(root)

      assertEquals("FILE_WRITE_FAILED", error.code)
      assertFalse(paths.sensorCompletedFile(SensorKind.ACCELEROMETER, sessionId).exists())
      assertTrue(paths.sensorPartialFile(SensorKind.ACCELEROMETER, sessionId).isFile)
      assertFalse(adapter.hasListener)
    }
  }

  private fun session(
    root: File,
    adapter: FakeSessionSensorAdapter,
    clock: SensorCaptureClock,
    sessionId: String,
    capacity: Int,
    batchSize: Int,
    writerFactory: BatchWriterFactory<SensorSample>,
    ioDispatcher: CoroutineDispatcher = Dispatchers.Unconfined,
  ): SensorCaptureSession {
    val config = SensorConfig.fromRequest("accelerometer", 20_000.0)
    val fileStore = AcquisitionFileStore()
    val output = SensorSessionOutput(
      filesDirectory = root,
      kind = SensorKind.ACCELEROMETER,
      sessionId = sessionId,
      config = config,
      fileStore = fileStore,
      writerFactory = writerFactory,
      ioDispatcher = ioDispatcher,
    )
    return SensorCaptureSession(
      filesDirectory = root,
      config = config,
      source = AndroidSensorSource(adapter),
      sessionId = sessionId,
      clock = clock,
      ioDispatcher = ioDispatcher,
      consumerDispatcher = Dispatchers.Unconfined,
      capacity = capacity,
      batchSize = batchSize,
      flushIntervalMillis = 60_000L,
      output = output,
    )
  }

  /** 创建在测试信号放行前保持单批在途的真实 CSV writer 包装。 */
  private fun blockingWriterFactory(
    entered: CompletableDeferred<Unit>,
    release: CompletableDeferred<Unit>,
  ): BatchWriterFactory<SensorSample> {
    val fileStore = AcquisitionFileStore()
    val delegateFactory = CsvBatchWriterFactory(fileStore, SensorCsvEncoder(SensorKind.ACCELEROMETER))
    return BatchWriterFactory { file ->
      val delegate = delegateFactory.open(file)
      object : BatchWriter<SensorSample> {
        override suspend fun writeBatch(records: List<SensorSample>) {
          entered.complete(Unit)
          release.await()
          delegate.writeBatch(records)
        }

        override fun close() = delegate.close()
      }
    }
  }

  /** 构造确定失败的 writer，以检查文件错误不会被当成正常完成。 */
  private fun failingWriterFactory(): BatchWriterFactory<SensorSample> {
    val fileStore = AcquisitionFileStore()
    return BatchWriterFactory { file ->
      val output = fileStore.createNewOutput(file)
      object : BatchWriter<SensorSample> {
        override suspend fun writeBatch(records: List<SensorSample>) {
          throw IOException("disk write failed")
        }

        override fun close() = output.close()
      }
    }
  }

  /** 捕获并返回会话停止的结构化失败。 */
  private suspend fun captureFailure(command: suspend () -> Any): SensorCaptureFailure {
    try {
      command()
    } catch (error: SensorCaptureFailure) {
      return error
    }
    throw AssertionError("Expected SensorCaptureFailure")
  }

  /** 在临时根目录中运行异步会话行为并清理生成文件。 */
  private suspend fun withTemporaryDirectory(block: suspend (File) -> Unit) {
    val root = Files.createTempDirectory("sensor-session").toFile()
    try {
      block(root)
    } finally {
      root.deleteRecursively()
    }
  }
}

/** 提供可推进的系统采样时间。 */
private class MutableSessionClock(
  var elapsedRealtimeNanos: Long = 10_000_000_000L,
) : SensorCaptureClock {
  private var systemNanos = 20_000_000_000L

  override fun elapsedRealtimeNanos(): Long = elapsedRealtimeNanos

  override fun nanoTime(): Long = systemNanos

  /** 同步推进回调时间，保持同一事件先后顺序。 */
  fun advance(nanos: Long) {
    elapsedRealtimeNanos += nanos
    systemNanos += nanos
  }
}

/** 在传感器回调已进入快照时提供可暂停时间源。 */
private class CallbackBlockingSessionClock : SensorCaptureClock {
  val sampleSnapshotEntered = CountDownLatch(1)
  val releaseSampleSnapshot = CountDownLatch(1)

  override fun elapsedRealtimeNanos(): Long = 10_000_000_000L

  override fun nanoTime(): Long {
    sampleSnapshotEntered.countDown()
    check(releaseSampleSnapshot.await(5, TimeUnit.SECONDS)) { "sample snapshot was not released" }
    return 20_000_000_000L
  }
}

/** 提供最小 Android 传感器回调注册行为。 */
private class FakeSessionSensorAdapter(
  private val registrationEntered: CountDownLatch? = null,
  private val releaseRegistration: CountDownLatch? = null,
) : SensorDeviceAdapter {
  private val device = SensorDevice(Any(), "session-test", 0)
  private val lock = ReentrantLock()
  private val callbacksDrained = lock.newCondition()
  private var callback: SensorEventCallback? = null
  private var callbacksInFlight = 0
  val unregisterEntered = CountDownLatch(1)
  var registrationCount = 0
    private set
  var unregisterCount = 0
    private set
  val hasListener: Boolean get() = lock.withLock { callback != null }

  override fun getDefaultSensor(androidType: Int): SensorDevice = device

  override fun registerListener(
    device: SensorDevice,
    samplingPeriodMicros: Int,
    callback: SensorEventCallback,
  ): Boolean {
    registrationCount += 1
    registrationEntered?.countDown()
    releaseRegistration?.let {
      check(it.await(5, TimeUnit.SECONDS)) { "registration was not released" }
    }
    return lock.withLock {
      this.callback = callback
      true
    }
  }

  override fun unregisterListener(device: SensorDevice, callback: SensorEventCallback) {
    unregisterCount += 1
    lock.withLock {
      if (this.callback === callback) this.callback = null
      unregisterEntered.countDown()
      while (callbacksInFlight > 0) callbacksDrained.await()
    }
  }

  /** 在当前监听中同步交付一个事件并登记其回调生命周期。 */
  fun emit(timestampNanos: Long, values: FloatArray) {
    val activeCallback = lock.withLock {
      val current = callback ?: throw AssertionError("Sensor listener is not registered")
      callbacksInFlight += 1
      current
    }
    try {
      activeCallback.invoke(timestampNanos, values)
    } finally {
      lock.withLock {
        callbacksInFlight -= 1
        if (callbacksInFlight == 0) callbacksDrained.signalAll()
      }
    }
  }
}
