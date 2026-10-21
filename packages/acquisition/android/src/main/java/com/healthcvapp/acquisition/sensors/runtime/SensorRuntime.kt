/** 维护四种传感器唯一控制器并把宿主后台边界传递给活动会话。 */

package com.healthcvapp.acquisition.sensors.runtime

import android.content.Context
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.LifecycleEventListener
import com.healthcvapp.acquisition.sensors.model.SensorCaptureFailure
import com.healthcvapp.acquisition.sensors.model.SensorKind
import com.healthcvapp.acquisition.sensors.source.AndroidSensorSource
import java.util.EnumMap

/** 持有本进程各类型控制器与 React 宿主生命周期状态。 */
internal class SensorRuntime private constructor(
  private val reactContext: ReactContext,
) : LifecycleEventListener {
  private val applicationContext = reactContext.applicationContext
  private val lock = Any()
  private val controllers = EnumMap<SensorKind, SensorController>(SensorKind::class.java)
  private var foreground = currentActivityIsResumed()

  init {
    reactContext.addLifecycleEventListener(this)
  }

  /** 返回指定类型唯一控制器；未知标识不会创建设备或控制器。 */
  fun controller(kindName: String): SensorController = controller(SensorKind.fromWireName(kindName))

  /** 按枚举返回或创建同一类型唯一控制器。 */
  fun controller(kind: SensorKind): SensorController = synchronized(lock) {
    controllers[kind] ?: SensorController(
      kind = kind,
      filesDirectory = applicationContext.filesDir,
      source = AndroidSensorSource(applicationContext),
      isForeground = ::isForeground,
    ).also { controllers[kind] = it }
  }

  /** React 宿主恢复前台后允许新的手动采集，不恢复旧会话。 */
  override fun onHostResume() {
    synchronized(lock) { foreground = true }
  }

  /** 宿主暂停时以 APP_NOT_FOREGROUND 失败结束所有活动类型。 */
  override fun onHostPause() {
    interruptActive(
      SensorCaptureFailure("APP_NOT_FOREGROUND", "应用进入后台，传感器会话已中断。"),
    )
  }

  /** 宿主销毁时以 RUNTIME_DESTROYED 失败结束所有活动类型。 */
  override fun onHostDestroy() {
    interruptActive(
      SensorCaptureFailure("RUNTIME_DESTROYED", "原生运行上下文已销毁，传感器会话已中断。"),
    )
  }

  /** 当前宿主是否处于可启动传感器采集的前台。 */
  private fun isForeground(): Boolean = synchronized(lock) { foreground }

  /** 根据已有 Activity 生命周期初始化运行时前台标志。 */
  private fun currentActivityIsResumed(): Boolean =
    (reactContext.currentActivity as? LifecycleOwner)
      ?.lifecycle
      ?.currentState
      ?.isAtLeast(Lifecycle.State.RESUMED) == true

  /** 封闭新启动并逐个通知活动控制器执行失败收尾。 */
  private fun interruptActive(cause: SensorCaptureFailure) {
    val activeControllers = synchronized(lock) {
      foreground = false
      controllers.values.toList()
    }
    activeControllers.forEach { it.interrupt(cause) }
  }

  /** ReactContext 替换时释放旧生命周期监听并终止旧运行。 */
  private fun detach() {
    reactContext.removeLifecycleEventListener(this)
    interruptActive(SensorCaptureFailure("RUNTIME_DESTROYED", "原生运行上下文已替换，传感器会话已中断。"))
  }

  companion object {
    private val runtimeLock = Any()
    private var runtime: SensorRuntime? = null

    /** 返回进程级运行时；新的 ReactContext 会先终止旧上下文会话。 */
    fun get(context: Context): SensorRuntime {
      val reactContext = context as? ReactContext
        ?: throw IllegalArgumentException("传感器运行时需要 ReactContext。")
      return synchronized(runtimeLock) {
        val current = runtime
        if (current?.reactContext === reactContext) return@synchronized current
        current?.detach()
        SensorRuntime(reactContext).also { runtime = it }
      }
    }
  }
}
