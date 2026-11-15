/** 按当前设备能力组装产品指尖配置，补光可选且不替换真实后摄。 */

import type { AcquisitionClient, CameraCapabilities, CameraCaptureOptions, CameraConfig } from '@health-cv-app/acquisition'

/** 产品只请求单块正式三十秒，不提供工程参数入口。 */
export const FINGERTIP_DURATION_MILLIS = 30_000

/** 以明确支持的模式和组合构建冻结请求，720 方形及 30 FPS 是偏好而非保证。 */
export function buildFingertipCameraConfig(capabilities: CameraCapabilities, options: CameraCaptureOptions): CameraConfig {
  const candidate = options.options.filter((option) => option.compatibility === 'supported').sort((left, right) =>
    Math.abs(left.resolution.width - 720) + Math.abs(left.resolution.height - 720)
    - Math.abs(right.resolution.width - 720) - Math.abs(right.resolution.height - 720),
  )[0]
  if (candidate == null || candidate.fpsRanges == null || candidate.fpsRanges.length === 0) {
    throw { code: 'CAMERA_CAPABILITY_UNAVAILABLE' }
  }
  const ranges = candidate.fpsRanges
  const targetFps = ranges.some((range) => range.minimum <= 30 && range.maximum >= 30)
    ? 30 : ranges.reduce((best, range) => {
      const next = Math.max(range.minimum, Math.min(range.maximum, 30))
      return Math.abs(next - 30) < Math.abs(best - 30) ? next : best
    }, ranges[0].maximum)
  const exposureModes = capabilities.exposureModes.modes ?? []
  const exposureMode = exposureModes.includes('auto') ? 'auto' : exposureModes.includes('manual') ? 'manual' : null
  const whiteBalanceModes = capabilities.whiteBalanceModes.modes ?? []
  const whiteBalanceMode = whiteBalanceModes.includes('auto') ? 'auto' : whiteBalanceModes[0]
  const focusModes = capabilities.focusModes.modes ?? []
  const focusMode = focusModes.includes('auto') ? 'auto' : focusModes.includes('off') ? 'off' : focusModes.includes('manual') ? 'manual' : null
  if (exposureMode == null || whiteBalanceMode == null || focusMode == null) throw { code: 'CAMERA_CAPABILITY_UNAVAILABLE' }
  const compensation = capabilities.exposureCompensationIndex.range
  return {
    cameraId: capabilities.cameraId,
    targetResolution: { ...candidate.resolution },
    targetFps,
    torchEnabled: capabilities.torch.status === 'supported' && capabilities.torch.value === true,
    exposure: exposureMode === 'auto'
      ? {
          mode: 'auto', compensationIndex: compensation == null ? 0 : Math.max(compensation.minimum, Math.min(compensation.maximum, 0)),
          timeNanos: null, iso: null,
          locked: capabilities.aeLock.status === 'supported' && capabilities.aeLock.value === true,
        }
      : { mode: 'manual', compensationIndex: null, timeNanos: capabilities.exposureTimeNanos.range?.minimum ?? null, iso: capabilities.iso.range?.minimum ?? null, locked: false },
    whiteBalance: {
      mode: whiteBalanceMode as CameraConfig['whiteBalance']['mode'],
      locked: whiteBalanceMode === 'auto' && capabilities.awbLock.status === 'supported' && capabilities.awbLock.value === true,
    },
    focus: { mode: focusMode, distanceDiopters: focusMode === 'manual' ? capabilities.focusDistanceDiopters.range?.minimum ?? null : null },
    processing: { blocks: [1, 1] },
  }
}

/** 查询真实后摄；重新绑定最终选项，满足客户端查询与配置的一致性校验。 */
export async function prepareFingertipCameraConfig(client: Pick<AcquisitionClient, 'listCameras' | 'getCameraCapabilities' | 'getSupportedCaptureOptions'>): Promise<CameraConfig> {
  const cameras = await client.listCameras()
  const camera = cameras.find((item) => item.facing === 'back')
  if (camera == null) throw { code: 'FINGERTIP_BACK_CAMERA_UNAVAILABLE' }
  const capabilities = await client.getCameraCapabilities(camera.cameraId)
  const options = await client.getSupportedCaptureOptions(camera.cameraId, { targetResolution: { width: 720, height: 720 }, targetFps: 30 })
  const config = buildFingertipCameraConfig(capabilities, options)
  await client.getSupportedCaptureOptions(camera.cameraId, { targetResolution: config.targetResolution, targetFps: config.targetFps })
  return config
}
