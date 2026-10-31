/** 组装按类型隔离的传感器客户端与低频页面状态。 */

import { atom, type ReadableAtom } from 'nanostores'
import {
  SensorCaptureError,
  createSensorClient,
  type SensorArtifact,
  type SensorCapabilities,
  type SensorClient,
  type SensorKind,
  type SensorSnapshot,
} from '@health-cv-app/acquisition'

/** 首批可独立控制的 Android 传感器类型。 */
export const sensorKinds: readonly SensorKind[] = [
  'accelerometer',
  'gyroscope',
  'magnetometer',
  'gravity',
]

/** 每种传感器各自绑定一个原生客户端。 */
export const sensorClients: Record<SensorKind, SensorClient> = {
  accelerometer: createSensorClient('accelerometer'),
  gyroscope: createSensorClient('gyroscope'),
  magnetometer: createSensorClient('magnetometer'),
  gravity: createSensorClient('gravity'),
}

/** 每种类型最近一次原生低频状态快照。 */
const snapshotsAtom = atom<Record<SensorKind, SensorSnapshot>>({
  accelerometer: sensorClients.accelerometer.getSnapshot(),
  gyroscope: sensorClients.gyroscope.getSnapshot(),
  magnetometer: sensorClients.magnetometer.getSnapshot(),
  gravity: sensorClients.gravity.getSnapshot(),
})

/** 页面只读订阅的各类型状态。 */
export const sensorSnapshots: ReadableAtom<Record<SensorKind, SensorSnapshot>> = snapshotsAtom

/** 最近查询到的设备能力；null 表示尚未成功查询。 */
const capabilitiesAtom = atom<Record<SensorKind, SensorCapabilities | null>>({
  accelerometer: null,
  gyroscope: null,
  magnetometer: null,
  gravity: null,
})

/** 页面只读订阅的各类型设备能力。 */
export const sensorCapabilities: ReadableAtom<Record<SensorKind, SensorCapabilities | null>> = capabilitiesAtom

/** 每种类型当前进程内已完成的文件引用。 */
const artifactsAtom = atom<Record<SensorKind, SensorArtifact[]>>({
  accelerometer: [],
  gyroscope: [],
  magnetometer: [],
  gravity: [],
})

/** 页面只读订阅的各类型完成文件。 */
export const sensorArtifacts: ReadableAtom<Record<SensorKind, SensorArtifact[]>> = artifactsAtom

/** 单类型界面错误只保留稳定错误码，不保存或回显底层消息。 */
interface SensorScreenError {
  /** 原生或客户端协议中的稳定错误码。 */
  code: string
}

/** 保存能力查询或本地操作失败的稳定错误码。 */
const errorsAtom = atom<Record<SensorKind, SensorScreenError | null>>({
  accelerometer: null,
  gyroscope: null,
  magnetometer: null,
  gravity: null,
})

/** 页面只读订阅的各类型本地错误码。 */
export const sensorErrors: ReadableAtom<Record<SensorKind, SensorScreenError | null>> = errorsAtom

/** 连接页面的低频状态订阅；清理订阅不会停止采集。 */
export function connectSensorScreen(): () => void {
  const subscriptions = sensorKinds.map((kind) => {
    const client = sensorClients[kind]
    updateRecord(snapshotsAtom, kind, client.getSnapshot())
    return client.subscribe((snapshot) => updateRecord(snapshotsAtom, kind, snapshot))
  })

  return () => subscriptions.forEach((unsubscribe) => unsubscribe())
}

/** 查询设备能力和本进程完成文件，不注册采样监听。 */
export async function refreshSensorScreen(): Promise<void> {
  await Promise.all(sensorKinds.map(async (kind) => {
    const client = sensorClients[kind]
    try {
      const capabilities = await client.getCapabilities()
      updateRecord(capabilitiesAtom, kind, capabilities)
      updateRecord(errorsAtom, kind, null)
    } catch (error) {
      setSensorError(kind, error)
    }

    try {
      const artifacts = await client.listArtifacts()
      updateRecord(artifactsAtom, kind, artifacts)
    } catch (error) {
      setSensorError(kind, error)
    }
  }))
}

/** 以指定微秒间隔启动一种传感器。 */
export async function startSensorCapture(kind: SensorKind, samplingPeriodMicros: number): Promise<void> {
  updateRecord(errorsAtom, kind, null)
  await sensorClients[kind].startCapture({ samplingPeriodMicros })
}

/** 停止指定类型并刷新其已完成文件引用。 */
export async function stopSensorCapture(kind: SensorKind): Promise<void> {
  updateRecord(errorsAtom, kind, null)
  await sensorClients[kind].stopCapture()
  updateRecord(artifactsAtom, kind, await sensorClients[kind].listArtifacts())
}

/** 保存单类型稳定错误码，不改变其它传感器状态。 */
export function setSensorError(kind: SensorKind, error: unknown): void {
  const code = error instanceof SensorCaptureError ? error.code : 'SENSOR_CAPTURE_FAILED'
  updateRecord(errorsAtom, kind, { code })
}

/** 描述按传感器类型存储的可写记录。 */
interface SensorRecordAtom<T> {
  /** 读取所有类型当前的记录快照。 */
  get(): Record<SensorKind, T>
  /** 替换所有类型当前的记录快照。 */
  set(value: Record<SensorKind, T>): void
}

/** 仅更新指定类型的记录，保留其它传感器的独立状态。 */
function updateRecord<T>(store: SensorRecordAtom<T>, kind: SensorKind, value: T): void {
  store.set({ ...store.get(), [kind]: value })
}

