/** 通过 Nitro 控制对象管理 Android 采集并在 JS 边界呈现结构化错误。 */

import { NitroModules } from 'react-native-nitro-modules'
import { PermissionsAndroid, Platform } from 'react-native'

import type {
  Acquisition,
  AcquisitionArtifact,
  AcquisitionCommandResult,
  AcquisitionSnapshot,
  CameraCapabilities,
  CameraCaptureOptions,
  CameraCaptureOptionsRequest,
  CameraConfig,
  CameraDescriptor,
  StopCaptureResult,
} from '../native/Acquisition.nitro'
import { CameraConfigValidationError, validateCameraConfig } from './CameraConfigValidator'

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

/** 将尺寸／帧率查询输入与结果绑定，避免用过期选项校验新配置。 */
interface CachedCaptureOptionsQuery {
  /** 查询的逻辑相机标识。 */
  cameraId: string
  /** 查询时使用的目标偏好。 */
  request: CameraCaptureOptionsRequest
  /** 原生返回的单个组合结果及本地处理限制。 */
  value: CameraCaptureOptions
}

/** 暴露控制命令与低频状态订阅，不传递像素或记录批次。 */
export class AcquisitionClient {
  private cameraCapabilityQueryRevision = 0
  private captureOptionsQueryRevision = 0
  private cachedCameraCapabilities: CameraCapabilities | null = null
  private cachedCaptureOptions: CachedCaptureOptionsQuery | null = null

  constructor(private readonly native: Acquisition) {}

  /** 作废未完成查询及已缓存结果，要求调用方重新查询再提交配置。 */
  private invalidateCameraQueries(): void {
    this.cameraCapabilityQueryRevision += 1
    this.captureOptionsQueryRevision += 1
    this.cachedCameraCapabilities = null
    this.cachedCaptureOptions = null
  }

  /** 读取原生采集状态快照。 */
  getSnapshot(): AcquisitionSnapshot {
    return this.native.getSnapshot()
  }

  /** 订阅原生低频状态变化；调用返回的清理函数可移除订阅。 */
  subscribe(listener: (snapshot: AcquisitionSnapshot) => void): () => void {
    const listenerId = this.native.addListener(listener)
    return () => this.native.removeListener(listenerId)
  }

  /** 枚举当前 CameraX 可用于主动采集的逻辑相机，不申请权限或打开设备。 */
  async listCameras(): Promise<CameraDescriptor[]> {
    if (Platform.OS !== 'android') {
      throw new AcquisitionError('PLATFORM_UNSUPPORTED', '当前仅支持 Android 采集。')
    }
    this.invalidateCameraQueries()
    return this.native.listCameras()
  }

  /** 显式请求 Android 相机权限；成功后仍需分别查询或打开相机。 */
  async requestCameraPermission(): Promise<void> {
    if (Platform.OS !== 'android') {
      throw new AcquisitionError('PLATFORM_UNSUPPORTED', '当前仅支持 Android 采集。')
    }

    this.invalidateCameraQueries()
    const permission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: '相机权限',
        message: '主动采集需要访问相机以读取预览和参数能力。',
        buttonNegative: '暂不允许',
        buttonPositive: '允许',
      },
    )
    if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new AcquisitionError('CAMERA_PERMISSION_DENIED', '相机权限未获准。')
    }
  }

  /** 查询指定逻辑相机的静态能力，不请求权限或打开设备。 */
  async getCameraCapabilities(cameraId: string): Promise<CameraCapabilities> {
    if (Platform.OS !== 'android') {
      throw new AcquisitionError('PLATFORM_UNSUPPORTED', '当前仅支持 Android 采集。')
    }
    const revision = ++this.cameraCapabilityQueryRevision
    this.cachedCameraCapabilities = null
    const capabilities = await this.native.getCameraCapabilities(cameraId)
    if (revision === this.cameraCapabilityQueryRevision) {
      this.cachedCameraCapabilities = capabilities
    }
    return capabilities
  }

  /** 查询所选相机的 Preview + YUV 尺寸／帧率组合，不绑定用例。 */
  async getSupportedCaptureOptions(
    cameraId: string,
    request: CameraCaptureOptionsRequest,
  ): Promise<CameraCaptureOptions> {
    if (Platform.OS !== 'android') {
      throw new AcquisitionError('PLATFORM_UNSUPPORTED', '当前仅支持 Android 采集。')
    }
    const revision = ++this.captureOptionsQueryRevision
    this.cachedCaptureOptions = null
    const frozenRequest: CameraCaptureOptionsRequest = {
      targetResolution: request.targetResolution == null ? null : { ...request.targetResolution },
      targetFps: request.targetFps,
    }
    const options = await this.native.getSupportedCaptureOptions(cameraId, frozenRequest)
    if (revision === this.captureOptionsQueryRevision) {
      this.cachedCaptureOptions = { cameraId, request: frozenRequest, value: options }
    }
    return options
  }

  /** 以最近查询结果在 JS 侧校验后，提交本周期冻结的完整配置。 */
  async openCamera(config: CameraConfig): Promise<void> {
    if (Platform.OS !== 'android') {
      throw new AcquisitionError('PLATFORM_UNSUPPORTED', '当前仅支持 Android 采集。')
    }

    const capabilities = this.cachedCameraCapabilities
    const captureOptions = this.cachedCaptureOptions
    if (
      capabilities == null
      || captureOptions == null
      || capabilities.cameraId !== config.cameraId
      || captureOptions.cameraId !== config.cameraId
      || captureOptions.value.cameraId !== config.cameraId
      || captureOptions.request.targetResolution?.width !== config.targetResolution.width
      || captureOptions.request.targetResolution?.height !== config.targetResolution.height
      || (captureOptions.request.targetFps != null && captureOptions.request.targetFps !== config.targetFps)
    ) {
      throw new AcquisitionError('CAMERA_CAPABILITY_UNAVAILABLE', '打开前必须重新查询所选相机及当前尺寸组合。')
    }

    const candidate = captureOptions.value.options.find((option) =>
      option.resolution.width === config.targetResolution.width
      && option.resolution.height === config.targetResolution.height,
    )
    if (candidate == null) {
      throw new AcquisitionError('CAMERA_CAPABILITY_UNAVAILABLE', '当前查询结果不包含请求的相机尺寸组合。')
    }
    if (candidate.compatibility !== 'supported') {
      throw new AcquisitionError(
        candidate.compatibility === 'unsupported' ? 'CAMERA_CONFIGURATION_UNAVAILABLE' : 'CAMERA_CAPABILITY_UNAVAILABLE',
        candidate.reason ?? '当前尺寸组合无法确认可用。',
      )
    }

    const frozenConfig: CameraConfig = {
      cameraId: config.cameraId,
      targetResolution: { ...config.targetResolution },
      targetFps: config.targetFps,
      torchEnabled: config.torchEnabled,
      exposure: { ...config.exposure },
      whiteBalance: { ...config.whiteBalance },
      focus: { ...config.focus },
      processing: { blocks: [...config.processing.blocks] },
    }
    try {
      validateCameraConfig(frozenConfig, { capabilities, captureOptions: captureOptions.value })
    } catch (error) {
      if (error instanceof CameraConfigValidationError) {
        throw new AcquisitionError(error.code, error.message)
      }
      throw error
    }
    this.unwrap(await this.native.openCamera(frozenConfig))
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
