/** 通过 Nitro 控制 Android 传感器，并在 JavaScript 边界呈现结构化错误。 */

import { NitroModules } from 'react-native-nitro-modules'

import type {
  SensorArtifact,
  SensorCapabilities,
  SensorCapture,
  SensorCaptureCommandResult,
  SensorCaptureConfig,
  SensorKind,
  SensorSnapshot,
  SensorStopCaptureResult,
} from '../native/SensorCapture.nitro'

let nextSensorSessionId = 0

/** 描述传感器命令失败时返回的稳定错误码。 */
export class SensorCaptureError extends Error {
  /** 原生协议中的稳定错误码。 */
  readonly code: string

  /** 创建带有稳定业务码的传感器错误。 */
  constructor(code: string, message: string) {
    super(message)
    this.name = 'SensorCaptureError'
    this.code = code
  }
}

/** 只暴露单一传感器的控制、低频状态和完成文件查询。 */
export class SensorClient {
  private sessionId: string | null = null
  private pendingStart: Promise<void> | null = null
  /** 保存 Nitro 原生对象及其固定传感器类型。 */
  constructor(
    private readonly native: SensorCapture,
    private readonly kind: SensorKind,
  ) {}

  /** 查询本类型的默认设备能力，不注册采样监听。 */
  getCapabilities(): Promise<SensorCapabilities> {
    return this.native.getCapabilities(this.kind)
  }

  /** 读取本类型当前低频状态，不启动采集。 */
  getSnapshot(): SensorSnapshot {
    return this.native.getSnapshot(this.kind)
  }

  /** 订阅本类型状态变化；清理函数只移除当前订阅。 */
  subscribe(listener: (snapshot: SensorSnapshot) => void): () => void {
    const listenerId = this.native.addListener(this.kind, listener)
    return () => this.native.removeListener(this.kind, listenerId)
  }

  /** 按明确微秒配置开始采集；无效配置在访问原生对象前拒绝。 */
  async startCapture(config: SensorCaptureConfig): Promise<void> {
    if (
      !Number.isFinite(config.samplingPeriodMicros)
      || !Number.isInteger(config.samplingPeriodMicros)
      || config.samplingPeriodMicros < 5_000
      || config.samplingPeriodMicros > 1_000_000
    ) {
      throw new SensorCaptureError(
        'INVALID_SENSOR_CONFIG',
        '采样间隔必须是 5,000 至 1,000,000 微秒范围内的整数。',
      )
    }

    if (this.pendingStart != null) {
      throw new SensorCaptureError('SENSOR_BUSY', '本客户端已有正在启动的传感器会话。')
    }
    const previousSessionId = this.sessionId
    const sessionId = `${Date.now()}-${++nextSensorSessionId}`
    this.sessionId = sessionId
    const pending = this.native.startCapture(this.kind, config.samplingPeriodMicros, sessionId).then((result) => {
      this.unwrap(result)
    })
    this.pendingStart = pending
    try {
      await pending
    } catch (error) {
      if (error instanceof SensorCaptureError && error.code === 'SENSOR_BUSY') {
        this.sessionId = previousSessionId
      }
      throw error
    } finally {
      this.pendingStart = null
    }
  }

  /** 等待停止屏障和文件完成后返回本类型产物。 */
  async stopCapture(): Promise<SensorArtifact> {
    const sessionId = this.sessionId
    if (this.pendingStart != null) {
      try { await this.pendingStart } catch {
        // 启动失败仍允许确切会话再次关闭未释放资源。
      }
    }
    if (sessionId == null) {
      throw new SensorCaptureError('SENSOR_NOT_CAPTURING', '本客户端尚未启动传感器采集。')
    }
    const result = await this.native.stopCapture(this.kind, sessionId)
    this.unwrap(result)
    if (result.artifact == null) {
      throw new SensorCaptureError('MISSING_ARTIFACT', '停止操作未返回已完成的传感器文件。')
    }
    return result.artifact
  }

  /** 查询本进程内已完成的本类型文件引用，不扫描磁盘目录。 */
  listArtifacts(): Promise<SensorArtifact[]> {
    return this.native.listArtifacts(this.kind)
  }

  /** 将原生结构化错误转换为调用方可捕获的异常。 */
  private unwrap<T extends SensorCaptureCommandResult>(result: T): T {
    if (result.errorCode != null || result.errorMessage != null) {
      throw new SensorCaptureError(
        result.errorCode ?? 'SENSOR_CAPTURE_FAILED',
        result.errorMessage ?? '传感器操作失败。',
      )
    }
    return result
  }
}

/** 创建并校验一个不自动启动采集的类型绑定客户端。 */
export function createSensorClient(kind: SensorKind): SensorClient {
  if (!isSensorKind(kind)) {
    throw new SensorCaptureError('INVALID_SENSOR_KIND', '传感器类型无效。')
  }

  return new SensorClient(
    NitroModules.createHybridObject<SensorCapture>('SensorCapture'),
    kind,
  )
}

/** 判定公开传感器标识是否属于固定首批类型。 */
function isSensorKind(kind: string): kind is SensorKind {
  return kind === 'accelerometer'
    || kind === 'gyroscope'
    || kind === 'magnetometer'
    || kind === 'gravity'
}
