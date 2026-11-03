/** 呈现显式授权、相机选择及无副作用的能力组合查询。 */

import { useState } from 'react'
import { useStore } from '@nanostores/react'
import type {
  CameraBooleanCapability,
  CameraCapabilityStatus,
  CameraModeCapability,
  CameraNumericCapability,
} from '@health-cv-app/acquisition'
import {
  acquisitionCameraQuery,
  queryAcquisitionCameras,
  querySelectedAcquisitionCamera,
  requestAcquisitionCameraPermission,
  selectAcquisitionCamera,
  updateAcquisitionCameraDraft,
} from '@/app/acquisition'
import { ActionButton } from '@/shared/components/ActionButton'
import { AppCard } from '@/shared/components/AppCard'
import { AppInput } from '@/shared/components/AppInput'
import { AppText } from '@/shared/components/AppText'
import { StatusFeedback } from '@/shared/components/StatusFeedback'
import {
  acquisitionMessages,
  localizeAcquisitionError,
} from '@/pages/dev/acquisition/acquisitionMessages'
import type { AcquisitionMessageValues } from '@/pages/dev/acquisition/acquisitionMessages'

import { CameraChoice, CapabilityGroup, QueryInputs } from './styles'

const CAPABILITY_STATUS_KEYS: Record<CameraCapabilityStatus, keyof AcquisitionMessageValues> = {
  supported: 'capabilitySupported',
  unsupported: 'capabilityUnsupported',
  'permission-required': 'capabilityPermissionRequired',
  unknown: 'capabilityUnknown',
}

/** 描述查询面板在外部相机命令执行时的禁用状态。 */
export interface CameraQueryPanelProps {
  /** 禁止与当前相机会话并发修改查询及配置。 */
  controlsDisabled?: boolean
}

/** 提供本地权限、相机枚举、参数能力和用例组合查询。 */
export function CameraQueryPanel({ controlsDisabled = false }: CameraQueryPanelProps) {
  const messages = useStore(acquisitionMessages)
  const query = useStore(acquisitionCameraQuery)
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [width, setWidth] = useState('720')
  const [height, setHeight] = useState('720')
  const [targetFps, setTargetFps] = useState('30')
  const isBusy = busy || query.isLoading
  const inputsDisabled = controlsDisabled || isBusy
  const visibleErrorCode = localError ?? query.errorCode

  async function runQuery(operation: () => Promise<void>): Promise<void> {
    setBusy(true)
    setLocalError(null)
    try {
      await operation()
    } catch (error) {
      setLocalError(readErrorCode(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppCard>
      <AppText variant="section">{messages.queryTitle}</AppText>
      <AppText tone="secondary">{messages.queryDescription}</AppText>
      <AppText tone="secondary" variant="caption">
        {messages.permissionStatus}：{query.permissionGranted ? messages.permissionGranted : messages.permissionNotConfirmed}
      </AppText>
      <ActionButton
        label={messages.requestPermission}
        disabled={inputsDisabled}
        loading={isBusy}
        secondary
        onPress={() => void runQuery(requestAcquisitionCameraPermission)}
      />
      <ActionButton
        label={messages.enumerateCameras}
        disabled={inputsDisabled}
        loading={isBusy}
        secondary
        onPress={() => void runQuery(() => queryAcquisitionCameras().then(() => undefined))}
      />

      {query.cameras.length === 0 ? (
        <StatusFeedback tone="info" title={messages.noCameras} />
      ) : (
        <CapabilityGroup>
          <AppText variant="label">{messages.selectCamera}</AppText>
          {query.cameras.map((camera) => (
            <CameraChoice key={camera.cameraId}>
              <ActionButton
                label={`${query.selectedCameraId === camera.cameraId ? `${messages.selected} · ` : ''}${facingLabel(camera.facing, messages)} · ${camera.cameraId}`}
                disabled={inputsDisabled}
                loading={isBusy}
                secondary={query.selectedCameraId !== camera.cameraId}
                onPress={() => selectAcquisitionCamera(camera.cameraId)}
              />
              <AppText tone="secondary" variant="caption">
                {messages.sensorOrientation}：{camera.sensorOrientationDegrees == null ? messages.capabilityUnknown : `${camera.sensorOrientationDegrees}°`}
              </AppText>
            </CameraChoice>
          ))}
        </CapabilityGroup>
      )}

      <AppText variant="label">{messages.captureCandidateTitle}</AppText>
      <QueryInputs>
        <AppInput
          label={messages.widthLabel}
          keyboardType="number-pad"
          disabled={inputsDisabled}
          value={width}
          onChangeText={(value) => {
            setWidth(value)
            updateAcquisitionCameraDraft((config) => ({
              ...config,
              targetResolution: { ...config.targetResolution, width: Number(value) },
            }))
          }}
          placeholder={messages.widthPlaceholder}
        />
        <AppInput
          label={messages.heightLabel}
          keyboardType="number-pad"
          disabled={inputsDisabled}
          value={height}
          onChangeText={(value) => {
            setHeight(value)
            updateAcquisitionCameraDraft((config) => ({
              ...config,
              targetResolution: { ...config.targetResolution, height: Number(value) },
            }))
          }}
          placeholder={messages.heightPlaceholder}
        />
        <AppInput
          label={messages.targetFpsLabel}
          keyboardType="decimal-pad"
          disabled={inputsDisabled}
          value={targetFps}
          onChangeText={(value) => {
            setTargetFps(value)
            updateAcquisitionCameraDraft((config) => ({ ...config, targetFps: Number(value) }))
          }}
          placeholder={messages.targetFpsPlaceholder}
        />
      </QueryInputs>
      <ActionButton
        label={messages.queryCapabilities}
        disabled={inputsDisabled || query.selectedCameraId == null}
        loading={isBusy}
        onPress={() => void runQuery(() => querySelectedAcquisitionCamera({
          targetResolution: { width: Number(width), height: Number(height) },
          targetFps: Number(targetFps),
        }))}
      />
      {isBusy && <StatusFeedback tone="pending" title={messages.queryLoading} />}
      {visibleErrorCode != null && (
        <>
          <StatusFeedback
            tone="error"
            title={messages.queryFailed}
            message={localizeAcquisitionError(visibleErrorCode, messages)}
          />
          <AppText accessibilityRole="alert" tone="error" variant="caption">
            {messages.errorCode}：{visibleErrorCode}
          </AppText>
        </>
      )}

      {query.capabilities != null && (
        <CapabilityGroup>
          <AppText variant="label">{messages.capabilityTitle} · {query.capabilities.cameraId}</AppText>
          <AppText tone="secondary" variant="caption">
            {messages.capabilityExposureMode}：{formatModeCapability(query.capabilities.exposureModes, messages)}
          </AppText>
          <AppText tone="secondary" variant="caption">
            {messages.capabilityExposureTime}：{formatNumericCapability(query.capabilities.exposureTimeNanos, 'ns', messages)}
          </AppText>
          <AppText tone="secondary" variant="caption">
            {messages.capabilityIso}：{formatNumericCapability(query.capabilities.iso, 'ISO', messages)}
          </AppText>
          <AppText tone="secondary" variant="caption">
            {messages.capabilityExposureCompensation}：{formatNumericCapability(query.capabilities.exposureCompensationIndex, messages.compensationIndex, messages)}
          </AppText>
          <AppText tone="secondary" variant="caption">
            {messages.capabilityWhiteBalance}：{formatModeCapability(query.capabilities.whiteBalanceModes, messages)}
          </AppText>
          <AppText tone="secondary" variant="caption">
            {messages.capabilityFocus}：{formatModeCapability(query.capabilities.focusModes, messages)}
          </AppText>
          <AppText tone="secondary" variant="caption">
            {messages.capabilityFocusDistance}：{formatNumericCapability(query.capabilities.focusDistanceDiopters, 'D', messages)}
          </AppText>
          <AppText tone="secondary" variant="caption">
            {messages.capabilityTorch}：{formatBooleanCapability(query.capabilities.torch, messages)}
          </AppText>
          <AppText tone="secondary" variant="caption">
            {messages.capabilityAeLock}：{formatBooleanCapability(query.capabilities.aeLock, messages)}
          </AppText>
          <AppText tone="secondary" variant="caption">
            {messages.capabilityAwbLock}：{formatBooleanCapability(query.capabilities.awbLock, messages)}
          </AppText>
        </CapabilityGroup>
      )}

      {query.captureOptions != null && (
        <CapabilityGroup>
          <AppText variant="label">{messages.combinationTitle} · {query.captureOptions.cameraId}</AppText>
          {query.captureOptions.options.map((option, index) => (
            <AppText
              key={`${option.resolution.width}x${option.resolution.height}-${index}`}
              tone="secondary"
              variant="caption"
            >
              {option.resolution.width} × {option.resolution.height} px：
              {messages[CAPABILITY_STATUS_KEYS[option.compatibility]]}；{messages.fpsRanges}：
              {option.fpsRanges == null
                ? messages.capabilityUnknown
                : option.fpsRanges.length === 0
                  ? messages.noReportedRanges
                  : option.fpsRanges.map((range) => `${range.minimum}–${range.maximum}`).join(', ')}
              {option.reason == null ? '' : `；${messages.deviceDetailsUnavailable}`}
            </AppText>
          ))}
          <AppText tone="secondary" variant="caption">
            {messages.localBlockLimit}：{query.captureOptions.processing.maxBlockCount} {messages.blocks} {query.captureOptions.processing.maxRows} {messages.rows} × {query.captureOptions.processing.maxColumns} {messages.columns}。
          </AppText>
        </CapabilityGroup>
      )}
    </AppCard>
  )
}

/** 将 facing 值转换为当前语言的相机朝向名称。 */
function facingLabel(facing: string, messages: AcquisitionMessageValues): string {
  if (facing === 'back') return messages.facingBack
  if (facing === 'front') return messages.facingFront
  if (facing === 'external') return messages.facingExternal
  return messages.facingUnknown
}

/** 显示已支持、未支持及逐模式仍未知的枚举结果。 */
function formatModeCapability(
  capability: CameraModeCapability,
  messages: AcquisitionMessageValues,
): string {
  const modes = capability.modes == null
    ? messages.modesUnknown
    : capability.modes.map((mode) => cameraModeLabel(mode, messages)).join(', ') || messages.noSupportedModes
  const unknown = capability.unknownModes.length === 0
    ? ''
    : `；${messages.modesUnconfirmed}：${capability.unknownModes.join(', ')}`
  const reason = capability.reason == null ? '' : `；${messages.deviceDetailsUnavailable}`
  return `${messages[CAPABILITY_STATUS_KEYS[capability.status]]}：${modes}${unknown}${reason}`
}

/** 显示已知数值区间与单位，不用零范围填补未知能力。 */
function formatNumericCapability(
  capability: CameraNumericCapability,
  unit: string,
  messages: AcquisitionMessageValues,
): string {
  const range = capability.range == null
    ? messages.rangeUnknown
    : `${capability.range.minimum}–${capability.range.maximum} ${unit}`
  const step = capability.range?.step == null
    ? ''
    : `；${messages.step} ${capability.range.step.numerator}/${capability.range.step.denominator}`
  const reason = capability.reason == null ? '' : `；${messages.deviceDetailsUnavailable}`
  return `${messages[CAPABILITY_STATUS_KEYS[capability.status]]}：${range}${step}${reason}`
}

/** 显示布尔能力状态，保留 false 与未知的区别。 */
function formatBooleanCapability(
  capability: CameraBooleanCapability,
  messages: AcquisitionMessageValues,
): string {
  const value = capability.value == null
    ? messages.valueUnknown
    : capability.value ? messages.valueSupported : messages.valueUnsupported
  const reason = capability.reason == null ? '' : `；${messages.deviceDetailsUnavailable}`
  return `${messages[CAPABILITY_STATUS_KEYS[capability.status]]}：${value}${reason}`
}

/** 将已知相机模式标识转为文案，未知扩展模式仍保留其协议标识。 */
function cameraModeLabel(mode: string, messages: AcquisitionMessageValues): string {
  const labels: Record<string, string> = {
    auto: messages.auto,
    off: messages.off,
    manual: messages.manualExposure,
    incandescent: messages.incandescent,
    fluorescent: messages.fluorescent,
    'warm-fluorescent': messages.warmFluorescent,
    daylight: messages.daylight,
    'cloudy-daylight': messages.cloudyDaylight,
    twilight: messages.twilight,
    shade: messages.shade,
  }
  return labels[mode] ?? mode
}

/** 从结构化错误中提取稳定代码；没有代码时只保留安全未知分类。 */
function readErrorCode(error: unknown): string {
  if (error != null && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code
  }
  return 'UNKNOWN'
}
