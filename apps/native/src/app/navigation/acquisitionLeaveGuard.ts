/** 合并主动相机离页请求，并在释放资源前阻断导航动作。 */

/** 描述离页协调器的原生相机与导航回调。 */
interface AcquisitionLeaveGuardOptions<Action> {
  /** 等待当前已发出的相机命令；失败的手动关闭会拒绝本次离页。 */
  waitForCameraCommand(): Promise<void>
  /** 返回每次主动相机打开尝试递增的代次。 */
  getSessionGeneration(): number
  /** 查询原生快照是否仍持有相机或采集会话。 */
  isCameraActive(): boolean
  /** 关闭相机并等待正在写入的文件完成收尾。 */
  closeCamera(): Promise<void>
  /** 资源安全后交回最新的导航动作。 */
  onReady(action: Action): void
  /** 保留当前页面并展示原生关闭失败。 */
  onFailure(error: unknown): void
}

/** 提供请求离页及卸载时使迟到回调失效的接口。 */
interface AcquisitionLeaveGuard<Action> {
  /** 合并同时发生的离页意图并完成一次资源交接。 */
  request(action: Action): Promise<void>
  /** 丢弃尚未执行的导航目标，不取消原生关闭。 */
  dispose(): void
}

/** 确保相机关闭结果不会重放旧导航或作用于新相机会话。 */
export function createAcquisitionLeaveGuard<Action>(
  options: AcquisitionLeaveGuardOptions<Action>,
): AcquisitionLeaveGuard<Action> {
  let pendingAction: Action | null = null
  let inFlight: Promise<void> | null = null
  let requestGeneration = 0
  let disposed = false

  return {
    request(action) {
      if (disposed) return Promise.resolve()
      pendingAction = action
      if (inFlight != null) return inFlight

      const currentRequestGeneration = ++requestGeneration
      const currentSessionGeneration = options.getSessionGeneration()
      const operation = Promise.resolve().then(async () => {
        try {
          await options.waitForCameraCommand()
          if (disposed || currentRequestGeneration !== requestGeneration) return
          if (options.getSessionGeneration() !== currentSessionGeneration) {
            throw new Error('主动相机会话已变化，请重新发起离开操作。')
          }
          if (options.isCameraActive()) await options.closeCamera()
          if (disposed || currentRequestGeneration !== requestGeneration) return
          if (options.getSessionGeneration() !== currentSessionGeneration) {
            throw new Error('主动相机会话已变化，请重新发起离开操作。')
          }

          const actionToDispatch = pendingAction
          pendingAction = null
          if (actionToDispatch != null) options.onReady(actionToDispatch)
        } catch (error) {
          if (disposed || currentRequestGeneration !== requestGeneration) return
          pendingAction = null
          options.onFailure(error)
        } finally {
          if (inFlight === operation) inFlight = null
        }
      })
      inFlight = operation
      return operation
    },
    dispose() {
      disposed = true
      requestGeneration += 1
      pendingAction = null
    },
  }
}
