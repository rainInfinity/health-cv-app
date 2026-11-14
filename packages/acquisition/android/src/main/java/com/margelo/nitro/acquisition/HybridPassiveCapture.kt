/** 将被动 Nitro 控制命令连接到仅持有 Application Context 的运行时。 */

package com.margelo.nitro.acquisition

import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import com.healthcvapp.acquisition.passive.runtime.PassiveCaptureRuntimes
import com.healthcvapp.acquisition.passive.service.PassiveCaptureNotifications

/** 暴露被动服务控制、真实状态、RPPG 结果及历史视频查询。 */
class HybridPassiveCapture : HybridPassiveCaptureSpec() {
  private val context = checkNotNull(NitroModules.applicationContext) {
    "Nitro Application Context is unavailable"
  }.applicationContext
  private val runtime = PassiveCaptureRuntimes.get(context)

  /** 查询通知系统状态，不创建渠道或启用被动服务。 */
  override fun getNotificationSettings(): PassiveCaptureNotificationSettings =
    PassiveCaptureNotifications.settingsSnapshot(context)

  /** 返回原生服务快照，不根据保存的用户偏好推断运行状态。 */
  override fun getSnapshot(): PassiveCaptureSnapshot = runtime.getSnapshot()

  /** 保存仅在服务关闭时修改的周期和正式测量时长。 */
  override fun setConfig(config: PassiveCaptureConfig): Promise<PassiveCaptureCommandResult> = Promise.async {
    runtime.setConfig(config)
  }

  /** 用户明确启用后启动前台服务，等待状态不打开相机。 */
  override fun enable(): Promise<PassiveCaptureCommandResult> = Promise.async {
    runtime.enable()
  }

  /** 停止接收解锁事件，并等待当前 RPPG 会话收尾和相机释放。 */
  override fun disable(): Promise<PassiveCaptureCommandResult> = Promise.async {
    runtime.disable()
  }

  /** 查询共用结果存储中已发布的被动 RPPG 三件套。 */
  override fun listArtifacts(): Promise<Array<com.margelo.nitro.acquisition.RPPGArtifact>> = Promise.async {
    runtime.listArtifacts().map { RPPGArtifactNitroMapper.toNitro(it) }.toTypedArray()
  }

  /** 查询保留在旧目录中的已完成历史视频。 */
  override fun listVideoArtifacts(): Promise<Array<PassiveVideoArtifact>> = Promise.async {
    runtime.listVideoArtifacts()
  }

  /** 注册应用级低频状态监听并返回释放标识。 */
  override fun addListener(listener: (PassiveCaptureSnapshot) -> Unit): Double = runtime.addListener(listener)

  /** 解除指定状态监听，不影响原生服务或其它订阅。 */
  override fun removeListener(listenerId: Double) {
    runtime.removeListener(listenerId)
  }
}
