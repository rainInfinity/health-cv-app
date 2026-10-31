/** 独立于云端与认证配置组装采集客户端和只读 Nano Stores 状态。 */

import { atom, type ReadableAtom } from 'nanostores'
import {
  AcquisitionError,
  createAcquisitionClient,
} from '@health-cv-app/acquisition'
import type {
  AcquisitionSnapshot,
  CameraCapabilities,
  CameraCaptureOptions,
  CameraCaptureOptionsRequest,
  CameraConfig,
  CameraDescriptor,
} from '@health-cv-app/acquisition'

/** 应用进程唯一的 Android 采集控制对象。 */
export const acquisitionClient = createAcquisitionClient()

const snapshotAtom = atom<AcquisitionSnapshot>(acquisitionClient.getSnapshot())

/** 页面只读订阅的原生采集状态。 */
export const acquisitionSnapshot: ReadableAtom<AcquisitionSnapshot> = snapshotAtom

/** 表示当前相机枚举与无副作用能力查询结果。 */
export interface AcquisitionCameraQueryState {
  /** 显式权限请求是否已获准；不表示相机已打开。 */
  permissionGranted: boolean
  /** 最近一次枚举得到的主动采集相机。 */
  cameras: CameraDescriptor[]
  /** 当前明确选择的逻辑相机标识。 */
  selectedCameraId: string | null
  /** 当前相机的静态参数能力查询结果。 */
  capabilities: CameraCapabilities | null
  /** 当前尺寸／帧率组合查询结果。 */
  captureOptions: CameraCaptureOptions | null
  /** 最近组合查询的精确输入，用于阻止用过期尺寸／FPS 草稿打开。 */
  captureOptionsRequest: CameraCaptureOptionsRequest | null
  /** 最近一次能力查询生成的可提交配置草稿；打开成功后由原生冻结副本。 */
  draftConfig: CameraConfig | null
  /** 是否正在等待显式授权或相机查询。 */
  isLoading: boolean
  /** 最近一次授权或查询失败的稳定错误码。 */
  errorCode: string | null
}

const cameraQueryAtom = atom<AcquisitionCameraQueryState>({
  permissionGranted: false,
  cameras: [],
  selectedCameraId: null,
  capabilities: null,
  captureOptions: null,
  captureOptionsRequest: null,
  draftConfig: null,
  isLoading: false,
  errorCode: null,
})

/** 页面只读订阅的相机查询、选择与授权状态。 */
export const acquisitionCameraQuery: ReadableAtom<AcquisitionCameraQueryState> = cameraQueryAtom

/** 使较早发起的查询不能覆盖较新的相机选择或查询结果。 */
let cameraQueryRevision = 0

/** 显式请求相机权限；成功后不自动枚举、查询或打开设备。 */
export async function requestAcquisitionCameraPermission(): Promise<void> {
  const revision = ++cameraQueryRevision
  try {
    await acquisitionClient.requestCameraPermission()
    const current = cameraQueryAtom.get()
    if (revision === cameraQueryRevision) {
      cameraQueryAtom.set({
        ...current,
        permissionGranted: true,
        capabilities: null,
        captureOptions: null,
        captureOptionsRequest: null,
        draftConfig: null,
        errorCode: null,
      })
    }
  } catch (error) {
    const current = cameraQueryAtom.get()
    if (revision === cameraQueryRevision) {
      cameraQueryAtom.set({
        ...current,
        permissionGranted: false,
        capabilities: null,
        captureOptions: null,
        captureOptionsRequest: null,
        draftConfig: null,
        errorCode: readAcquisitionErrorCode(error),
      })
    }
    throw error
  }
}

/** 查询当前可选相机并优先保留原选择，否则选择后摄或首个结果。 */
export async function queryAcquisitionCameras(): Promise<CameraDescriptor[]> {
  const revision = ++cameraQueryRevision
  cameraQueryAtom.set({
    ...cameraQueryAtom.get(),
    capabilities: null,
    captureOptions: null,
    captureOptionsRequest: null,
    draftConfig: null,
    isLoading: true,
    errorCode: null,
  })
  try {
    const cameras = await acquisitionClient.listCameras()
    const current = cameraQueryAtom.get()
    if (revision !== cameraQueryRevision) return cameras
    const selected = cameras.find(({ cameraId }) => cameraId === current.selectedCameraId)
      ?? cameras.find(({ facing }) => facing === 'back')
      ?? cameras[0]
      ?? null
    cameraQueryAtom.set({
      ...current,
      cameras,
      selectedCameraId: selected?.cameraId ?? null,
      capabilities: null,
      captureOptions: null,
      captureOptionsRequest: null,
      draftConfig: null,
      isLoading: false,
      errorCode: null,
    })
    return cameras
  } catch (error) {
    const current = cameraQueryAtom.get()
    if (revision === cameraQueryRevision) {
      cameraQueryAtom.set({
        ...current,
        isLoading: false,
        errorCode: readAcquisitionErrorCode(error),
      })
    }
    throw error
  }
}

/** 选择本次明确查询的相机并丢弃不匹配的旧能力结果。 */
export function selectAcquisitionCamera(cameraId: string): void {
  const current = cameraQueryAtom.get()
  if (!current.cameras.some((camera) => camera.cameraId === cameraId)) {
    cameraQueryAtom.set({ ...current, errorCode: 'CAMERA_SELECTION_INVALID' })
    return
  }
  cameraQueryRevision += 1
  cameraQueryAtom.set({
    ...current,
    selectedCameraId: cameraId,
    capabilities: null,
    captureOptions: null,
    captureOptionsRequest: null,
    draftConfig: null,
    isLoading: false,
    errorCode: null,
  })
}

/** 按当前选择替换草稿；旧相机或旧查询结果不能写入新选择。 */
export function updateAcquisitionCameraDraft(update: (config: CameraConfig) => CameraConfig): void {
  const current = cameraQueryAtom.get()
  if (current.draftConfig == null || current.draftConfig.cameraId !== current.selectedCameraId) return
  cameraQueryAtom.set({ ...current, draftConfig: update(current.draftConfig) })
}

/** 并行查询当前选择的静态能力和单个尺寸／帧率组合。 */
export async function querySelectedAcquisitionCamera(
  request: CameraCaptureOptionsRequest,
): Promise<void> {
  const cameraId = cameraQueryAtom.get().selectedCameraId
  if (cameraId == null) {
    throw new AcquisitionError('CAMERA_SELECTION_REQUIRED', '请先枚举并选择一个主动采集相机。')
  }
  const revision = ++cameraQueryRevision
  const frozenRequest: CameraCaptureOptionsRequest = {
    targetResolution: request.targetResolution == null ? null : { ...request.targetResolution },
    targetFps: request.targetFps,
  }
  cameraQueryAtom.set({
    ...cameraQueryAtom.get(),
    capabilities: null,
    captureOptions: null,
    captureOptionsRequest: null,
    draftConfig: null,
    isLoading: true,
    errorCode: null,
  })
  try {
    const [capabilities, captureOptions] = await Promise.all([
      acquisitionClient.getCameraCapabilities(cameraId),
      acquisitionClient.getSupportedCaptureOptions(cameraId, frozenRequest),
    ])
    const current = cameraQueryAtom.get()
    if (revision !== cameraQueryRevision || current.selectedCameraId !== cameraId) return
    cameraQueryAtom.set({
      ...current,
      capabilities,
      captureOptions,
      captureOptionsRequest: frozenRequest,
      draftConfig: createDefaultCameraConfig(cameraId, frozenRequest, capabilities, captureOptions),
      isLoading: false,
      errorCode: null,
    })
  } catch (error) {
    const current = cameraQueryAtom.get()
    if (revision === cameraQueryRevision && current.selectedCameraId === cameraId) {
      cameraQueryAtom.set({
        ...current,
        isLoading: false,
        errorCode: readAcquisitionErrorCode(error),
      })
    }
    throw error
  }
}

/** 从授权或查询失败中提取稳定代码；没有结构化代码时返回未知分类。 */
function readAcquisitionErrorCode(error: unknown): string {
  if (error != null && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code
  }
  return 'UNKNOWN'
}

/** 根据明确支持模式和当前查询结果生成安全的初始草稿。 */
function createDefaultCameraConfig(
  cameraId: string,
  request: CameraCaptureOptionsRequest,
  capabilities: CameraCapabilities,
  captureOptions: CameraCaptureOptions,
): CameraConfig {
  const option = captureOptions.options[0]
  const targetResolution = option?.resolution
    ?? request.targetResolution
    ?? { width: 720, height: 720 }
  const targetFps = request.targetFps
    ?? option?.fpsRanges?.find((range) => range.minimum <= 30 && range.maximum >= 30)?.maximum
    ?? option?.fpsRanges?.[0]?.maximum
    ?? 30
  const exposureModes = capabilities.exposureModes.modes ?? []
  const exposureMode = exposureModes.includes('auto')
    ? 'auto'
    : exposureModes.includes('manual')
      ? 'manual'
      : 'auto'
  const compensationRange = capabilities.exposureCompensationIndex.range
  const compensationIndex = compensationRange == null
    ? 0
    : Math.round(Math.min(compensationRange.maximum, Math.max(compensationRange.minimum, 0)))
  const whiteBalanceModes = capabilities.whiteBalanceModes.modes ?? []
  const whiteBalanceMode = (whiteBalanceModes.includes('auto')
    ? 'auto'
    : whiteBalanceModes[0] ?? 'auto') as CameraConfig['whiteBalance']['mode']
  const focusModes = capabilities.focusModes.modes ?? []
  const focusMode = (focusModes.includes('auto')
    ? 'auto'
    : focusModes.includes('off')
      ? 'off'
      : focusModes.includes('manual')
        ? 'manual'
        : 'auto') as CameraConfig['focus']['mode']

  return {
    cameraId,
    targetResolution: { ...targetResolution },
    targetFps,
    torchEnabled: false,
    exposure: exposureMode === 'auto'
      ? { mode: 'auto', compensationIndex, timeNanos: null, iso: null, locked: false }
      : {
          mode: 'manual',
          compensationIndex: null,
          timeNanos: capabilities.exposureTimeNanos.range?.minimum ?? null,
          iso: capabilities.iso.range?.minimum ?? null,
          locked: false,
        },
    whiteBalance: { mode: whiteBalanceMode, locked: false },
    focus: {
      mode: focusMode,
      distanceDiopters: focusMode === 'manual'
        ? capabilities.focusDistanceDiopters.range?.minimum ?? null
        : null,
    },
    processing: { blocks: [1, 1] },
  }
}

/** 连接当前采集界面的低频原生状态通知。 */
export function connectAcquisitionScreen(): () => void {
  snapshotAtom.set(acquisitionClient.getSnapshot())
  return acquisitionClient.subscribe((snapshot) => snapshotAtom.set(snapshot))
}

/** 解除页面通知并仅在仍持有相机或会话时等待原生关闭。 */
export async function closeAcquisitionScreen(unsubscribe: () => void): Promise<void> {
  unsubscribe()
  try {
    const snapshot = acquisitionClient.getSnapshot()
    if (snapshot.state !== 'closed' || snapshot.sessionId != null) {
      await acquisitionClient.closeCamera()
    }
  } finally {
    snapshotAtom.set(acquisitionClient.getSnapshot())
  }
}

/** 将卸载期间的关闭错误保留到下次页面进入时显示。 */
export function preserveAcquisitionCleanupError(error: unknown): void {
  const snapshot = acquisitionClient.getSnapshot()
  const details = error instanceof AcquisitionError
    ? { code: error.code, message: error.message }
    : {
        code: 'CAMERA_CLOSE_FAILED',
        message: error instanceof Error ? error.message : '关闭相机时发生未知错误。',
      }

  snapshotAtom.set({
    ...snapshot,
    state: 'failed',
    errorCode: details.code,
    errorMessage: details.message,
  })
}
