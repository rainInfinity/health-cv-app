/** 通过 Nitro 控制 Android 主动 RPPG，并隔离原始像素与完整记录。 */

import { NitroModules } from 'react-native-nitro-modules'
import { PermissionsAndroid, Platform } from 'react-native'

import type { RPPG } from '../native/RPPG.nitro'
import type {
  RPPGArtifact,
  RPPGCommandResult,
  RPPGRealtimeBatch,
  RPPGSnapshot,
} from '../native/RPPG.nitro'

/** 描述主动 RPPG 命令可能返回的可判别错误。 */
export class RPPGError extends Error {
  /** 原生协议中的稳定错误码。 */
  readonly code: string

  /** 创建带稳定错误码的主动 RPPG 错误。 */
  constructor(code: string, message: string) {
    super(message)
    this.name = 'RPPGError'
    this.code = code
  }
}

/** 暴露主动预览、测量、低频状态、有界波形订阅和本地产物查询。 */
export class RPPGClient {
  constructor(private readonly native: RPPG) {}

  /** 读取原生会话状态，不触发相机副作用。 */
  getSnapshot(): RPPGSnapshot {
    this.ensureAndroid()
    return this.native.getSnapshot()
  }

  /** 显式请求相机权限；获准后仍需分别打开预览和开始测量。 */
  async requestCameraPermission(): Promise<void> {
    this.ensureAndroid()
    const permission = PermissionsAndroid.PERMISSIONS.CAMERA
    if (await PermissionsAndroid.check(permission)) return

    const result = await PermissionsAndroid.request(permission, {
      title: '相机权限',
      message: '主动 RPPG 需要前置相机采集面部颜色变化。',
      buttonNegative: '暂不允许',
      buttonPositive: '允许',
    })
    if (result !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new RPPGError('CAMERA_PERMISSION_DENIED', '相机权限未获准。')
    }
  }

  /** 显式取得相机租约并打开仅用于预览的原生相机会话。 */
  async openPreview(): Promise<void> {
    this.ensureAndroid()
    if (!(await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA))) {
      throw new RPPGError('CAMERA_PERMISSION_REQUIRED', '打开预览前必须先获准相机权限。')
    }
    this.unwrap(await this.native.openPreview())
  }

  /** 显式开始正式人脸观察；重复开始会返回稳定错误。 */
  async start(): Promise<void> {
    this.ensureAndroid()
    this.unwrap(await this.native.start())
  }

  /** 用户停止测量并等待原生相机与文件屏障完成。 */
  async stop(): Promise<RPPGArtifact | null> {
    this.ensureAndroid()
    return this.unwrap(await this.native.stop()).artifact
  }

  /** 页面离开时等待资源收尾并关闭此原生 runtime。 */
  async close(): Promise<RPPGArtifact | null> {
    this.ensureAndroid()
    return this.unwrap(await this.native.close()).artifact
  }

  /** 查询外部及已有内部目录中的已发布完整三件套。 */
  async listArtifacts(): Promise<RPPGArtifact[]> {
    this.ensureAndroid()
    return this.native.listArtifacts()
  }

  /** 订阅低频会话状态；返回的函数只移除此订阅。 */
  subscribe(listener: (snapshot: RPPGSnapshot) => void): () => void {
    this.ensureAndroid()
    const listenerId = this.native.addListener(listener)
    return () => this.native.removeListener(listenerId)
  }

  /** 订阅与持久化脉搏波同源的有界展示批次。 */
  subscribeRealtime(listener: (batch: RPPGRealtimeBatch) => void): () => void {
    this.ensureAndroid()
    const listenerId = this.native.addRealtimeListener(listener)
    return () => this.native.removeRealtimeListener(listenerId)
  }

  /** 拒绝非 Android 平台，避免访问未注册的原生对象。 */
  private ensureAndroid(): void {
    if (Platform.OS !== 'android') {
      throw new RPPGError('PLATFORM_UNSUPPORTED', '主动 RPPG 当前仅支持 Android。')
    }
  }

  /** 将 Nitro 结构化错误转换为应用可判别异常。 */
  private unwrap(result: RPPGCommandResult): RPPGCommandResult {
    if (!result.accepted || result.errorCode != null) {
      throw new RPPGError(
        result.errorCode ?? 'RPPG_COMMAND_REJECTED',
        result.errorMessage ?? '主动 RPPG 操作失败。',
      )
    }
    return result
  }
}

/** 创建一个不自动打开相机或启动测量的 RPPG 客户端。 */
export function createRPPGClient(): RPPGClient {
  if (Platform.OS !== 'android') {
    throw new RPPGError('PLATFORM_UNSUPPORTED', '主动 RPPG 当前仅支持 Android。')
  }
  return new RPPGClient(NitroModules.createHybridObject<RPPG>('RPPG'))
}
