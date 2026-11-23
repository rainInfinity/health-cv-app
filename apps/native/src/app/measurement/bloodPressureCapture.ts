/** 串接本轮授权、预览门闩及已发原生命令；取消不会等待卸载页面的布局。 */

import type { AcquisitionClient, CameraConfig, BloodPressureSnapshot } from '@health-cv-app/acquisition'

/** 控制器只使用本页面创建的原生客户端，不触碰独立传感器或被动源。 */
export type BloodPressureCaptureClient = Pick<AcquisitionClient,
  'requestCameraPermission' | 'openCamera' | 'startBloodPressureCapture' | 'closeCamera'
  | 'getBloodPressureSnapshot' | 'subscribeBloodPressure'>

/** 由页面提供状态与原生预览宿主，不携带文件或诊断面板。 */
interface BloodPressureCaptureOptions {
  /** 本轮独占的客户端。 */
  client: BloodPressureCaptureClient
  /** 查询无设备副作用的真实相机配置。 */
  prepareConfig(): Promise<CameraConfig>
  /** 正式窗口目标时长。 */
  durationMillis: number
  /** 当前页面有效且应用处于前台。 */
  isForeground(): boolean
  /** 同一认证代次与导航入口仍有效。 */
  isCurrent?(): boolean
  /** 请求挂载真实预览宿主。 */
  mountPreview(): void
  /** 仅在本次明确启动返回真实轮次后通知，不从任意快照建立轮次。 */
  onCapture?(captureId: string): void
  /** 仅派发同轮事实。 */
  onSnapshot(snapshot: BloodPressureSnapshot): void
  /** 准备期间真正后台中断，权限弹窗短暂失活除外。 */
  onPreparationInterrupted(): void
}

/** 一次明确入口只准备一次；重试须先成功关闭，再创建新控制器。 */
export interface BloodPressureCaptureController {
  /** 开始授权及准备；正式采集仍由原生覆盖门控。 */
  prepare(): Promise<void>
  /** Nitro 引用与正尺寸布局均成立。 */
  previewReady(): void
  /** 前台变化；权限弹窗的短暂失活不取消有效入口。 */
  setForeground(active: boolean): void
  /** 优先取消未发动作，再等待本页在途命令和完整关闭。 */
  close(): Promise<void>
  /** 注销订阅并使所有迟到回调失效，不代替 close 屏障。 */
  dispose(): void
}

/** 权限请求无法取消，但返回后必须重新检查本入口及当前前台资格。 */
export function createBloodPressureCaptureController(options: BloodPressureCaptureOptions): BloodPressureCaptureController {
  let cancelled = false
  let disposed = false
  let permissionPending = false
  let ready = false
  let captureId: string | null = null
  let preparing: Promise<void> | null = null
  let issued: Promise<unknown> | null = null
  let closing: Promise<void> | null = null
  let wake: (() => void) | null = null
  let detach: (() => void) | null = null
  const current = () => !cancelled && !disposed && (options.isCurrent?.() ?? true)
  const wait = () => new Promise<void>((resolve) => { wake = resolve })
  const releaseWait = () => { const resolve = wake; wake = null; resolve?.() }

  /** 将已发设备命令独立于授权与布局等待登记，关闭只等待真实在途命令。 */
  async function command<T>(operation: () => Promise<T>): Promise<T> {
    const promise = operation()
    issued = promise
    try { return await promise } finally { if (issued === promise) issued = null }
  }

  return {
    prepare() {
      if (preparing != null) return preparing
      preparing = (async () => {
        if (!current()) return
        // 明确入口可能在导航转场时暂未 active，等待当前前台而不是擅自打开设备。
        while (current() && !options.isForeground()) await wait()
        if (!current()) return
        permissionPending = true
        try { await options.client.requestCameraPermission() } finally { permissionPending = false }
        if (!current()) return
        // 系统授权造成的短暂后台允许原入口继续；离页取消仍具有更高优先级。
        while (current() && !options.isForeground()) await wait()
        if (!current()) return
        const config = await options.prepareConfig()
        if (!current() || !options.isForeground()) return
        options.mountPreview()
        while (current() && !ready) await wait()
        if (!current() || !options.isForeground()) return
        await command(() => options.client.openCamera(config))
        if (!current() || !options.isForeground()) return
        const update = (snapshot: BloodPressureSnapshot | null) => {
          if (disposed || snapshot == null || snapshot.captureId !== captureId) return
          options.onSnapshot(snapshot)
        }
        detach = options.client.subscribeBloodPressure(update)
        try {
          captureId = await command(() => options.client.startBloodPressureCapture({ durationMillis: options.durationMillis }))
          if (disposed) return
          options.onCapture?.(captureId)
          update(options.client.getBloodPressureSnapshot())
        } catch (error) {
          detach?.()
          detach = null
          throw error
        }
      })()
      return preparing
    },
    previewReady() { ready = true; releaseWait() },
    setForeground(active) {
      if (active) {
        releaseWait()
        const snapshot = options.client.getBloodPressureSnapshot()
        if (!disposed && captureId != null && snapshot?.captureId === captureId) options.onSnapshot(snapshot)
      } else if (!permissionPending) {
        if (captureId == null && current()) options.onPreparationInterrupted()
        cancelled = true
        releaseWait()
        // 已建立的轮次由原生宿主后台屏障保留真实结束原因，不以用户停止冒充。
      }
    },
    close() {
      cancelled = true
      releaseWait()
      if (closing != null) return closing
      const operation = (async () => {
        // close 调用同步登记原生关闭意图，不能等 start 确认后才通知原生取消自动开始。
        const pending = issued
        const close = options.client.closeCamera()
        const results = await Promise.allSettled([pending, close])
        const result = results[1]
        if (result.status === 'rejected') throw result.reason
      })().finally(() => { if (closing === operation) closing = null })
      closing = operation
      return operation
    },
    dispose() {
      disposed = true
      cancelled = true
      releaseWait()
      detach?.()
      detach = null
    },
  }
}
