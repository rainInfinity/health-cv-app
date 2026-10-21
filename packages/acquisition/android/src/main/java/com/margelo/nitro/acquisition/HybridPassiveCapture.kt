/** 将被动 Nitro 控制命令连接到仅持有 Application Context 的运行时。 */

package com.margelo.nitro.acquisition

import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import com.healthcvapp.acquisition.passive.PassiveCaptureRuntimes

/** 暴露被动服务控制、真实快照、低频状态与持久视频查询。 */
class HybridPassiveCapture : HybridPassiveCaptureSpec() {
  private val runtime = PassiveCaptureRuntimes.get(
    checkNotNull(NitroModules.applicationContext) { "Nitro Application Context is unavailable" }.applicationContext,
  )

  /** 返回原生服务快照，不根据保存的用户偏好推断运行状态。 */
  override fun getSnapshot(): PassiveCaptureSnapshot = runtime.getSnapshot()

  /** 保存仅在服务关闭时修改的周期和录像时长配置。 */
  override fun setConfig(config: PassiveCaptureConfig): Promise<PassiveCaptureCommandResult> = Promise.async {
    runtime.setConfig(config)
  }

  /** 用户明确启用后启动前台服务，等待状态不打开相机。 */
  override fun enable(): Promise<PassiveCaptureCommandResult> = Promise.async {
    runtime.enable()
  }

  /** 停止解锁事件并等待当前录像收尾及相机释放。 */
  override fun disable(): Promise<PassiveCaptureCommandResult> = Promise.async {
    runtime.disable()
  }

  /** 从私有持久目录扫描已完成且媒体信息可读取的视频。 */
  override fun listArtifacts(): Promise<Array<PassiveCaptureArtifact>> = Promise.async {
    runtime.listArtifacts()
  }

  /** 注册应用级低频状态监听并返回释放标识。 */
  override fun addListener(listener: (PassiveCaptureSnapshot) -> Unit): Double = runtime.addListener(listener)

  /** 解除指定状态监听，不影响原生服务或其它订阅。 */
  override fun removeListener(listenerId: Double) {
    runtime.removeListener(listenerId)
  }
}
