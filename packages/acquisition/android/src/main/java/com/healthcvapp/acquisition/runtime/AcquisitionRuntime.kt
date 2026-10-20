/** 保证 Nitro 控制对象与原生预览视图共享同一相机服务。 */

package com.healthcvapp.acquisition.runtime

import android.content.Context
import com.facebook.react.bridge.ReactContext

/** 持有应用进程唯一的采集运行服务，不承载跨应用持久数据。 */
internal object AcquisitionRuntime {
  private val lock = Any()
  private var service: AcquisitionService? = null

  /** 按 ReactContext 创建或返回共享服务实例。 */
  fun get(context: Context): AcquisitionService {
    val reactContext = context as? ReactContext
      ?: throw IllegalArgumentException("采集服务需要 ReactContext。")
    return synchronized(lock) {
      service ?: AcquisitionService(reactContext).also { service = it }
    }
  }
}
