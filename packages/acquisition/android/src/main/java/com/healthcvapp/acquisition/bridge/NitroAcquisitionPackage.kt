/** 注册采集 Nitro 对象构造器和原生预览视图管理器。 */

package com.healthcvapp.acquisition.bridge

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.margelo.nitro.acquisition.NitroAcquisitionOnLoad

/** 让 React Native 自动链接采集 Nitro 原生实现。 */
class NitroAcquisitionPackage : ReactPackage {
  init {
    NitroAcquisitionOnLoad.initializeNative()
  }

  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = emptyList()

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    listOf(com.margelo.nitro.acquisition.views.HybridCameraPreviewManager())
}
