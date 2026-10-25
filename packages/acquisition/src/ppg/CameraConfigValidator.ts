/** 在调用原生相机前校验配置形状及设备能力，不获取任何采集资源。 */

import type {
  CameraBooleanCapability,
  CameraCapabilities,
  CameraCapabilityStatus,
  CameraCaptureOptions,
  CameraConfig,
  CameraModeCapability,
  CameraNumericCapability,
} from '../native/Acquisition.nitro'

/** 配置校验失败时供调用方稳定判别的错误。 */
export class CameraConfigValidationError extends Error {
  /** 原生协议使用的稳定错误码。 */
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'CameraConfigValidationError'
    this.code = code
  }
}

/** 校验所选相机能力及按 Preview/YUV 查询的本地处理限制。 */
export interface CameraConfigValidationContext {
  /** 与配置相机标识一致的最新能力结果。 */
  capabilities: CameraCapabilities
  /** 同一相机的组合选项与分块限制；尚未查询时为空。 */
  captureOptions: CameraCaptureOptions | null
}

/** 验证配置数值、模式互斥、已知设备范围和分块上限。 */
export function validateCameraConfig(
  config: CameraConfig,
  context: CameraConfigValidationContext,
): void {
  if (config == null || typeof config !== 'object') {
    invalid('相机配置必须是对象。')
  }
  if (typeof config.cameraId !== 'string' || config.cameraId.trim().length === 0) {
    invalid('必须选择当前设备枚举得到的相机标识。')
  }
  if (context?.capabilities == null || context.capabilities.cameraId !== config.cameraId) {
    unavailable('所选相机没有匹配的最新能力查询结果。')
  }

  validateResolution(config.targetResolution)
  if (!Number.isFinite(config.targetFps) || config.targetFps <= 0) {
    invalid('目标帧率必须是有限正数。')
  }
  if (typeof config.torchEnabled !== 'boolean') {
    invalid('补光灯配置必须是布尔值。')
  }

  const capabilities = context.capabilities
  const exposure = config.exposure
  if (exposure == null || typeof exposure !== 'object') {
    invalid('必须提供曝光配置。')
  }
  requireMode(capabilities.exposureModes, exposure.mode, 'exposure.mode')
  if (typeof exposure.locked !== 'boolean') {
    invalid('AE 锁定配置必须是布尔值。')
  }
  if (exposure.mode === 'auto') {
    if (exposure.timeNanos != null || exposure.iso != null) {
      invalid('自动曝光不能携带手动曝光时间或 ISO。')
    }
    if (!isSafeInteger(exposure.compensationIndex)) {
      invalid('自动曝光补偿索引必须是整数。')
    }
    requireRange(
      capabilities.exposureCompensationIndex,
      exposure.compensationIndex,
      'exposure.compensationIndex',
      true,
    )
    if (exposure.locked) requireEnabled(capabilities.aeLock, 'AE 锁定')
  } else if (exposure.mode === 'manual') {
    if (exposure.compensationIndex != null) {
      invalid('手动曝光不能携带自动曝光补偿索引。')
    }
    if (exposure.locked) invalid('手动曝光不能请求 AE 锁定。')
    if (!isPositiveSafeInteger(exposure.timeNanos)) {
      invalid('手动曝光时间必须是 JS 安全整数纳秒。')
    }
    if (!isPositiveSafeInteger(exposure.iso) || exposure.iso > 2_147_483_647) {
      invalid('手动 ISO 必须是正整数。')
    }
    requireRange(capabilities.exposureTimeNanos, exposure.timeNanos, 'exposure.timeNanos', false)
    requireRange(capabilities.iso, exposure.iso, 'exposure.iso', false)
  } else {
    invalid('曝光模式无效。')
  }

  const whiteBalance = config.whiteBalance
  if (whiteBalance == null || typeof whiteBalance !== 'object') {
    invalid('必须提供白平衡配置。')
  }
  requireMode(capabilities.whiteBalanceModes, whiteBalance.mode, 'whiteBalance.mode')
  if (typeof whiteBalance.locked !== 'boolean') {
    invalid('AWB 锁定配置必须是布尔值。')
  }
  if (whiteBalance.locked && whiteBalance.mode !== 'auto') {
    invalid('仅自动白平衡允许请求 AWB 锁定。')
  }
  if (whiteBalance.locked) requireEnabled(capabilities.awbLock, 'AWB 锁定')

  const focus = config.focus
  if (focus == null || typeof focus !== 'object') {
    invalid('必须提供对焦配置。')
  }
  requireMode(capabilities.focusModes, focus.mode, 'focus.mode')
  if (focus.mode === 'manual') {
    const distance = focus.distanceDiopters
    if (distance == null || !Number.isFinite(distance) || distance < 0) {
      invalid('手动对焦距离必须是有限非负屈光度。')
    }
    requireRange(
      capabilities.focusDistanceDiopters,
      distance,
      'focus.distanceDiopters',
      false,
    )
  } else if (focus.distanceDiopters != null) {
    invalid('非手动对焦模式不能携带手动距离。')
  }

  if (config.torchEnabled) requireEnabled(capabilities.torch, '补光灯')
  validateProcessing(config.processing, context.captureOptions)
}

/** 校验像素尺寸的有限值、正数和整数边界。 */
function validateResolution(resolution: CameraConfig['targetResolution']): void {
  if (resolution == null || typeof resolution !== 'object') invalid('必须提供目标像素尺寸。')
  if (
    !isPositiveSafeInteger(resolution.width)
    || !isPositiveSafeInteger(resolution.height)
    || resolution.width > 2_147_483_647
    || resolution.height > 2_147_483_647
  ) {
    invalid('目标宽度和高度必须是可表示的正整数像素。')
  }
}

/** 校验网格形状、行列范围及安全乘积。 */
function validateProcessing(
  processing: CameraConfig['processing'],
  options: CameraCaptureOptions | null,
): void {
  const blocks = processing?.blocks
  if (
    !Array.isArray(blocks)
    || blocks.length !== 2
    || !isPositiveSafeInteger(blocks[0])
    || !isPositiveSafeInteger(blocks[1])
  ) {
    invalid('分块配置必须是恰有两个正整数的 [rows, columns] 数组。')
  }
  const limits = options?.processing
  if (limits == null) unavailable('分块限制尚未查询，不能确认当前网格可用。')
  if (
    !Number.isSafeInteger(limits.maxBlockCount)
    || limits.maxBlockCount <= 0
    || !Number.isSafeInteger(limits.maxRows)
    || limits.maxRows <= 0
    || !Number.isSafeInteger(limits.maxColumns)
    || limits.maxColumns <= 0
  ) {
    unavailable('设备查询未返回有效的本地分块限制。')
  }
  const blockCount = blocks[0] * blocks[1]
  if (
    !Number.isSafeInteger(blockCount)
    || blockCount > limits.maxBlockCount
    || blocks[0] > limits.maxRows
    || blocks[1] > limits.maxColumns
  ) {
    invalid('分块网格超过已查询的最大块数或目标尺寸约束。')
  }
}

/** 校验已请求模式属于能力查询返回的明确支持集合。 */
function requireMode(
  capability: CameraModeCapability,
  requestedMode: string,
  field: string,
): void {
  requireSupportedStatus(capability?.status, field)
  if (!Array.isArray(capability.modes) || !Array.isArray(capability.unknownModes)) {
    unavailable(`${field} 的支持模式未知。`)
  }
  if (capability.modes.includes(requestedMode)) return
  if (capability.unknownModes.includes(requestedMode)) {
    unavailable(`${field} 请求模式的支持状态未知。`)
  }
  throw new CameraConfigValidationError(
    'CAMERA_PARAMETER_UNSUPPORTED',
    `设备不支持 ${field} 请求的模式。`,
  )
}

/** 校验数值范围并保留设备能力未知与请求越界的错误区别。 */
function requireRange(
  capability: CameraNumericCapability,
  requestedValue: number,
  field: string,
  requireStep: boolean,
): void {
  requireSupportedStatus(capability?.status, field)
  const range = capability.range
  if (
    range == null
    || !Number.isFinite(range.minimum)
    || !Number.isFinite(range.maximum)
    || range.minimum > range.maximum
  ) {
    unavailable(`${field} 的设备范围未知。`)
  }
  if (requireStep && (
    range.step == null
    || !Number.isSafeInteger(range.step.numerator)
    || !Number.isSafeInteger(range.step.denominator)
    || range.step.numerator <= 0
    || range.step.denominator <= 0
  )) {
    unavailable(`${field} 的设备步长未知。`)
  }
  if (requestedValue < range.minimum || requestedValue > range.maximum) {
    invalid(`${field} 超出设备报告范围。`)
  }
}

/** 确认显式开启的控制在所选相机上已知且确实支持。 */
function requireEnabled(capability: CameraBooleanCapability, field: string): void {
  requireSupportedStatus(capability?.status, field)
  if (capability.value == null) unavailable(`${field} 的设备能力未知。`)
  if (!capability.value) {
    throw new CameraConfigValidationError(
      'CAMERA_PARAMETER_UNSUPPORTED',
      `设备不支持 ${field}。`,
    )
  }
}

/** 将不同支持状态映射到稳定的协议错误分类。 */
function requireSupportedStatus(status: CameraCapabilityStatus | undefined, field: string): void {
  if (status === 'unsupported') {
    throw new CameraConfigValidationError(
      'CAMERA_PARAMETER_UNSUPPORTED',
      `设备不支持 ${field}。`,
    )
  }
  if (status !== 'supported') unavailable(`${field} 的设备能力不可用或未知。`)
}


/** 判断非空、有限且位于 JavaScript 精确整数范围内的整数。 */
function isSafeInteger(value: number | null): value is number {
  return value != null && Number.isSafeInteger(value)
}

/** 判断正的 JavaScript 安全整数。 */
function isPositiveSafeInteger(value: number | null): value is number {
  return isSafeInteger(value) && value > 0
}

/** 抛出调用方配置错误。 */
function invalid(message: string): never {
  throw new CameraConfigValidationError('INVALID_CAMERA_CONFIG', message)
}

/** 抛出所需能力无法确认错误。 */
function unavailable(message: string): never {
  throw new CameraConfigValidationError('CAMERA_CAPABILITY_UNAVAILABLE', message)
}
