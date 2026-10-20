/** 将 Nitro 控制命令委派给应用级原生采集服务。 */

package com.margelo.nitro.acquisition

import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import com.healthcvapp.acquisition.runtime.AcquisitionRuntime

/** 暴露手动相机控制、完成文件查询和低频状态监听。 */
class HybridAcquisition : HybridAcquisitionSpec() {
  private val service = AcquisitionRuntime.get(
    checkNotNull(NitroModules.applicationContext) { "Nitro ReactApplicationContext is unavailable" },
  )

  /** 返回当前相机和会话状态，不触发设备副作用。 */
  override fun getSnapshot(): AcquisitionSnapshot = service.getSnapshot()

  /** 请求打开后置相机与原生预览。 */
  override fun openCamera(): Promise<AcquisitionCommandResult> = Promise.async {
    service.openCamera()
  }

  /** 在预览就绪后创建单独的正式采集会话。 */
  override fun startCapture(): Promise<AcquisitionCommandResult> = Promise.async {
    service.startCapture()
  }

  /** 等待队列尾批和文件关闭后返回产物或结构化失败。 */
  override fun stopCapture(): Promise<StopCaptureResult> = Promise.async {
    service.stopCapture()
  }

  /** 结束采集后解绑相机并保留已完成文件。 */
  override fun closeCamera(): Promise<AcquisitionCommandResult> = Promise.async {
    service.closeCamera()
  }

  /** 返回本进程已正常完成的采集文件引用。 */
  override fun listArtifacts(): Promise<Array<com.margelo.nitro.acquisition.AcquisitionArtifact>> = Promise.async {
    service.listArtifacts()
  }

  /** 注册低频状态快照回调并返回清理标识。 */
  override fun addListener(listener: (snapshot: AcquisitionSnapshot) -> Unit): Double =
    service.addListener(listener)

  /** 删除此前注册的状态快照回调。 */
  override fun removeListener(listenerId: Double) {
    service.removeListener(listenerId)
  }
}
