/** 通过 Nitro 管理独立被动服务，并在 JS 边界统一权限与结构化错误。 */

import { NitroModules } from 'react-native-nitro-modules'
import { PermissionsAndroid, Platform } from 'react-native'

import type {
  PassiveCapture,
  PassiveCaptureArtifact,
  PassiveCaptureConfig,
  PassiveCaptureNotificationSettings,
  PassiveCaptureSnapshot,
} from '../native/PassiveCapture.nitro'

/** 描述被动采集命令可能返回的可判别错误。 */
export class PassiveCaptureError extends Error {
  /** 原生协议或权限流程中的稳定错误码。 */
  readonly code: string

  /** 创建带稳定代码的被动采集错误。 */
  constructor(code: string, message: string) {
    super(message)
    this.name = 'PassiveCaptureError'
    this.code = code
  }
}

/** 暴露被动服务控制、低频状态订阅和持久视频查询。 */
export class PassiveCaptureClient {
  constructor(private readonly native: PassiveCapture) {}

  /** 读取原生服务的真实状态，不根据配置推断服务正在运行。 */
  getSnapshot(): PassiveCaptureSnapshot {
    return this.native.getSnapshot()
  }
  /** 查询应用通知开关和已存在的被动渠道，不启用服务或创建渠道。 */
  getNotificationSettings(): PassiveCaptureNotificationSettings {
    this.ensureAndroid()
    return this.native.getNotificationSettings()
  }

  /** 保存未启用时生效的周期和目标时长配置。 */
  async setConfig(config: PassiveCaptureConfig): Promise<void> {
    this.unwrap(await this.native.setConfig(config))
  }

  /** 请求必要运行时权限并明确启动被动服务；不会立即打开相机。 */
  async enable(): Promise<void> {
    this.ensureAndroid()
    await this.requestPermission(PermissionsAndroid.PERMISSIONS.CAMERA, 'CAMERA_PERMISSION_DENIED', '需要相机权限才能启用被动采集。')
    if (Number(Platform.Version) >= 33) {
      const notificationPermission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      await this.requestPermission(notificationPermission, 'NOTIFICATION_PERMISSION_DENIED', '需要通知权限才能显示被动采集运行状态。')
    }
    this.unwrap(await this.native.enable())
  }

  /** 停止接受新解锁事件并等待原生会话完成收尾。 */
  async disable(): Promise<void> {
    this.ensureAndroid()
    this.unwrap(await this.native.disable())
  }

  /** 查询应用私有目录中已完成的视频。 */
  listArtifacts(): Promise<PassiveCaptureArtifact[]> {
    this.ensureAndroid()
    return this.native.listArtifacts()
  }

  /** 订阅原生低频状态；返回的函数只移除该页面订阅。 */
  subscribe(listener: (snapshot: PassiveCaptureSnapshot) => void): () => void {
    this.ensureAndroid()
    const listenerId = this.native.addListener(listener)
    return () => this.native.removeListener(listenerId)
  }

  /** 请求单项 Android 权限并将拒绝映射为稳定错误。 */
  private async requestPermission(permission: Parameters<typeof PermissionsAndroid.check>[0], code: string, message: string): Promise<void> {
    const current = await PermissionsAndroid.check(permission)
    if (current) return

    const result = await PermissionsAndroid.request(permission)
    if (result !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new PassiveCaptureError(code, message)
    }
  }

  /** 拒绝非 Android 平台，避免调用未注册的原生对象。 */
  private ensureAndroid(): void {
    if (Platform.OS !== 'android') {
      throw new PassiveCaptureError('PLATFORM_UNSUPPORTED', '被动采集当前仅支持 Android。')
    }
  }

  /** 将 Nitro 的结构化错误结果转换为应用异常。 */
  private unwrap(result: { errorCode: string | null; errorMessage: string | null }): void {
    if (result.errorCode != null || result.errorMessage != null) {
      throw new PassiveCaptureError(
        result.errorCode ?? 'PASSIVE_CAPTURE_FAILED',
        result.errorMessage ?? '被动采集操作失败。',
      )
    }
  }
}

/** 创建一个不自动启动服务或打开相机的被动采集客户端。 */
export function createPassiveCaptureClient(): PassiveCaptureClient {
  return new PassiveCaptureClient(
    NitroModules.createHybridObject<PassiveCapture>('PassiveCapture'),
  )
}
