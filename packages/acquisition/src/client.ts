/** 通过 Nitro 控制对象管理 Android 采集并在 JS 边界呈现结构化错误。 */

import { NitroModules } from 'react-native-nitro-modules'
import { PermissionsAndroid, Platform } from 'react-native'

import type {
  Acquisition,
  AcquisitionArtifact,
  AcquisitionCommandResult,
  AcquisitionSnapshot,
  StopCaptureResult,
} from './native/Acquisition.nitro'

/** 描述采集命令可能返回的可判别错误。 */
export class AcquisitionError extends Error {
  /** 原生协议中的稳定错误码。 */
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AcquisitionError'
    this.code = code
  }
}

/** 暴露控制命令与低频状态订阅，不传递像素或记录批次。 */
export class AcquisitionClient {
  constructor(private readonly native: Acquisition) {}

  /** 读取原生采集状态快照。 */
  getSnapshot(): AcquisitionSnapshot {
    return this.native.getSnapshot()
  }

  /** 订阅原生低频状态变化；调用返回的清理函数可移除订阅。 */
  subscribe(listener: (snapshot: AcquisitionSnapshot) => void): () => void {
    const listenerId = this.native.addListener(listener)
    return () => this.native.removeListener(listenerId)
  }

  /** 请求相机权限并打开后置相机；权限拒绝会以结构化错误返回。 */
  async openCamera(): Promise<void> {
    if (Platform.OS !== 'android') {
      throw new AcquisitionError('PLATFORM_UNSUPPORTED', '当前仅支持 Android 采集。')
    }

    const permission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: '相机权限',
        message: '采集功能需要访问后置摄像头以显示预览并保存 PPG 记录。',
        buttonNegative: '暂不允许',
        buttonPositive: '允许',
      },
    )

    if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new AcquisitionError('CAMERA_PERMISSION_DENIED', '相机权限未获准。')
    }

    this.unwrap(await this.native.openCamera())
  }

  /** 仅在预览就绪后开始新的正式采集会话。 */
  async startCapture(): Promise<void> {
    this.unwrap(await this.native.startCapture())
  }

  /** 等待有序队列排空和两份 CSV 文件关闭后返回会话产物。 */
  async stopCapture(): Promise<AcquisitionArtifact> {
    const result = await this.native.stopCapture()
    this.unwrap(result)
    if (result.artifact == null) {
      throw new AcquisitionError('MISSING_ARTIFACT', '停止操作未返回两份已完成的采集文件。')
    }
    return result.artifact
  }

  /** 关闭相机并释放设备资源，不删除已完成文件。 */
  async closeCamera(): Promise<void> {
    this.unwrap(await this.native.closeCamera())
  }

  /** 查询应用私有持久目录中已完成的采集文件。 */
  listArtifacts(): Promise<AcquisitionArtifact[]> {
    return this.native.listArtifacts()
  }

  /** 将 Nitro 的结构化错误结果转换为应用可判别的异常。 */
  private unwrap<T extends AcquisitionCommandResult>(result: T): T {
    if (result.errorCode != null) {
      throw new AcquisitionError(
        result.errorCode,
        result.errorMessage ?? '采集操作失败。',
      )
    }
    return result
  }
}

/** 创建一个不自动打开相机的原生采集客户端。 */
export function createAcquisitionClient(): AcquisitionClient {
  return new AcquisitionClient(
    NitroModules.createHybridObject<Acquisition>('Acquisition'),
  )
}

/** 保留 StopCaptureResult 的公开类型以供调用方处理协议结果。 */
export type { StopCaptureResult }
