/** 保证 Nitro 控制对象与预览视图共享同一个主动 PPG 控制器。 */

package com.healthcvapp.acquisition.ppg.runtime

import android.content.Context
import com.facebook.react.bridge.ReactContext

/** 持有应用进程唯一的主动 PPG 控制器。 */
internal object PPGRuntime {
  private val lock = Any()
  private var controller: PPGController? = null

  /** 按 ReactContext 创建或返回共享控制器实例。 */
  fun get(context: Context): PPGController {
    val reactContext = context as? ReactContext
      ?: throw IllegalArgumentException("采集控制器需要 ReactContext。")
    return synchronized(lock) {
      controller ?: PPGController(reactContext).also { controller = it }
    }
  }
}
