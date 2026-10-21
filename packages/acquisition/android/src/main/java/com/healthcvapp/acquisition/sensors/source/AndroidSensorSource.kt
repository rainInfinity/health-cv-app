/** 查询 Android 默认传感器并管理受控回调线程中的监听注册。 */

package com.healthcvapp.acquisition.sensors.source

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.HandlerThread
import com.healthcvapp.acquisition.sensors.model.SensorCaptureFailure
import com.healthcvapp.acquisition.sensors.model.SensorConfig
import com.healthcvapp.acquisition.sensors.model.SensorKind
import com.healthcvapp.acquisition.sensors.model.SensorCapabilities
import java.util.IdentityHashMap
import java.util.concurrent.CountDownLatch

/** 保留默认设备句柄和平台报告的能力元数据。 */
internal data class SensorDevice(
  /** Android Sensor 对象或可控测试设备句柄。 */
  val handle: Any,
  /** 系统报告的设备名称。 */
  val name: String,
  /** 系统报告的最小采样间隔，单位微秒。 */
  val minSamplingPeriodMicros: Int,
)

/** 同步借用一次平台回调的事件时间和可变轴数组。 */
internal typealias SensorEventCallback = (eventTimestampNanos: Long, values: FloatArray) -> Unit

/** 隔离 Android 设备 API，使注册失败与回调顺序可以确定性验证。 */
internal interface SensorDeviceAdapter {
  /** 查询某种标准类型的默认设备，不注册采样监听。 */
  fun getDefaultSensor(androidType: Int): SensorDevice?

  /** 在受控回调线程注册监听并报告系统注册结果。 */
  fun registerListener(
    device: SensorDevice,
    samplingPeriodMicros: Int,
    callback: SensorEventCallback,
  ): Boolean

  /** 注销指定监听并等待已排队回调完成。 */
  fun unregisterListener(device: SensorDevice, callback: SensorEventCallback)
}

/** 将传感器句柄和同一监听器绑定到专属 HandlerThread。 */
internal class AndroidSensorSource(private val adapter: SensorDeviceAdapter) {
  constructor(context: Context) : this(AndroidSensorDeviceAdapter(context.applicationContext))
  private var activeDevice: SensorDevice? = null
  private var activeCallback: SensorEventCallback? = null

  /** 查询默认设备能力；不会创建线程或注册回调。 */
  fun getCapabilities(kind: SensorKind): SensorCapabilities {
    val device = adapter.getDefaultSensor(kind.androidType)
    return if (device == null) {
      SensorCapabilities(kind, false, null, null)
    } else {
      SensorCapabilities(
        kind = kind,
        available = true,
        deviceName = device.name,
        minSamplingPeriodMicros = device.minSamplingPeriodMicros,
      )
    }
  }

  /** 校验设备存在后注册；false 与异常均明确报告且回收线程资源。 */
  fun register(
    config: SensorConfig,
    onEvent: SensorEventCallback,
  ): SensorDevice {
    check(activeDevice == null) { "sensor listener is already registered" }
    val device = adapter.getDefaultSensor(config.kind.androidType)
      ?: throw SensorCaptureFailure("SENSOR_UNAVAILABLE", "设备不提供 ${config.kind.wireName} 默认传感器。")

    try {
      val registered = adapter.registerListener(device, config.registeredSamplingPeriodMicros, onEvent)
      if (!registered) {
        throw SensorCaptureFailure("SENSOR_REGISTRATION_FAILED", "系统拒绝注册 ${config.kind.wireName} 监听。")
      }
      activeDevice = device
      activeCallback = onEvent
      return device
    } catch (error: SensorCaptureFailure) {
      throw error
    } catch (error: Throwable) {
      throw SensorCaptureFailure("SENSOR_REGISTRATION_FAILED", "注册 ${config.kind.wireName} 监听失败。", error)
    }
  }

  /** 注销当前监听并等待 HandlerThread 中已经排队的回调退出。 */
  fun unregister() {
    val device = activeDevice ?: return
    val callback = activeCallback ?: return
    activeDevice = null
    activeCallback = null
    try {
      adapter.unregisterListener(device, callback)
    } catch (error: Throwable) {
      throw SensorCaptureFailure("SENSOR_REGISTRATION_FAILED", "注销 ${device.name} 监听失败。", error)
    }
  }
}

/** 使用 Android SensorManager 实现单监听器单回调线程适配。 */
private class AndroidSensorDeviceAdapter(context: Context) : SensorDeviceAdapter {
  private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
  private val registrations = IdentityHashMap<SensorEventCallback, SensorRegistration>()

  /** 返回对应类型默认设备的稳定描述。 */
  override fun getDefaultSensor(androidType: Int): SensorDevice? =
    sensorManager.getDefaultSensor(androidType)?.let { sensor ->
      SensorDevice(sensor, sensor.name, sensor.minDelay)
    }

  /** 为一次监听创建专属 HandlerThread，并检查平台返回值。 */
  override fun registerListener(
    device: SensorDevice,
    samplingPeriodMicros: Int,
    callback: SensorEventCallback,
  ): Boolean {
    val sensor = device.handle as? Sensor ?: throw IllegalArgumentException("Android Sensor handle is invalid")
    val thread = HandlerThread("SensorCapture-${sensor.type}").apply { start() }
    val handler = Handler(thread.looper)
    val listener = object : SensorEventListener {
      override fun onSensorChanged(event: SensorEvent) {
        callback(event.timestamp, event.values)
      }

      override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
    }
    try {
      val registered = sensorManager.registerListener(listener, sensor, samplingPeriodMicros, handler)
      if (!registered) {
        stopHandlerThread(thread)
        return false
      }
      synchronized(registrations) {
        registrations[callback] = SensorRegistration(sensor, listener, thread, handler)
      }
      return true
    } catch (error: Throwable) {
      try {
        sensorManager.unregisterListener(listener, sensor)
      } catch (cleanupError: Throwable) {
        if (cleanupError !== error) error.addSuppressed(cleanupError)
      }
      stopHandlerThread(thread)
      throw error
    }
  }

  /** 注销后放置线程屏障，再关闭专属 Looper。 */
  override fun unregisterListener(device: SensorDevice, callback: SensorEventCallback) {
    val registration = synchronized(registrations) { registrations.remove(callback) } ?: return
    var failure: Throwable? = null
    try {
      sensorManager.unregisterListener(registration.listener, registration.sensor)
    } catch (error: Throwable) {
      failure = error
    }

    val barrier = CountDownLatch(1)
    if (!registration.handler.post { barrier.countDown() }) barrier.countDown()
    var interrupted = false
    try {
      while (true) {
        try {
          barrier.await()
          break
        } catch (_: InterruptedException) {
          interrupted = true
        }
      }
    } finally {
      stopHandlerThread(registration.thread)
      if (interrupted) Thread.currentThread().interrupt()
    }
    failure?.let { throw it }
  }

  /** 退出 HandlerThread 并等待队列清空；等待期间保留调用线程中断标志。 */
  private fun stopHandlerThread(thread: HandlerThread) {
    thread.quitSafely()
    var interrupted = false
    while (thread.isAlive) {
      try {
        thread.join()
      } catch (_: InterruptedException) {
        interrupted = true
      }
    }
    if (interrupted) Thread.currentThread().interrupt()
  }

  private data class SensorRegistration(
    val sensor: Sensor,
    val listener: SensorEventListener,
    val thread: HandlerThread,
    val handler: Handler,
  )

}
