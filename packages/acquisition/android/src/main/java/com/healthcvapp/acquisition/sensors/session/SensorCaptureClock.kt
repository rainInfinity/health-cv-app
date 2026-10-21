/** 定义传感器会话使用的两类单调时钟。 */

package com.healthcvapp.acquisition.sensors.session

import android.os.SystemClock

/** 为正式窗口和 CSV 时间提供可替换的单调时间源。 */
internal interface SensorCaptureClock {
  /** 返回 Android elapsedRealtime 单调纳秒。 */
  fun elapsedRealtimeNanos(): Long
  /** 返回 System.nanoTime 单调纳秒。 */
  fun nanoTime(): Long
}

/** 使用当前 Android 进程的真实单调时钟。 */
internal object AndroidSensorCaptureClock : SensorCaptureClock {
  override fun elapsedRealtimeNanos(): Long = SystemClock.elapsedRealtimeNanos()
  override fun nanoTime(): Long = System.nanoTime()
}
