/** 编辑查询对应的相机配置草稿，不直接修改已打开的原生会话。 */

import { useStore } from '@nanostores/react'
import type {
  CameraCapabilityStatus,
  CameraFocusMode,
  CameraModeCapability,
  CameraWhiteBalanceMode,
} from '@health-cv-app/acquisition'
import {
  acquisitionCameraQuery,
  updateAcquisitionCameraDraft,
} from '@/app/acquisition'
import { ActionButton } from '@/shared/components/ActionButton'
import { AppCard } from '@/shared/components/AppCard'
import { AppInput } from '@/shared/components/AppInput'
import { AppText } from '@/shared/components/AppText'
import { acquisitionMessages } from '@/features/acquisition/acquisitionMessages'
import type { AcquisitionMessageValues } from '@/features/acquisition/acquisitionMessages'

import { EditorGroup, EditorInputs } from './styles'

const CAPABILITY_STATUS_KEYS: Record<CameraCapabilityStatus, keyof AcquisitionMessageValues> = {
  supported: 'capabilitySupported',
  unsupported: 'capabilityUnsupported',
  'permission-required': 'capabilityPermissionRequired',
  unknown: 'capabilityUnknown',
}

const WHITE_BALANCE_MODES: CameraWhiteBalanceMode[] = [
  'auto',
  'off',
  'incandescent',
  'fluorescent',
  'warm-fluorescent',
  'daylight',
  'cloudy-daylight',
  'twilight',
  'shade',
]

const WHITE_BALANCE_MESSAGE_KEYS: Record<CameraWhiteBalanceMode, keyof AcquisitionMessageValues> = {
  auto: 'auto',
  off: 'off',
  incandescent: 'incandescent',
  fluorescent: 'fluorescent',
  'warm-fluorescent': 'warmFluorescent',
  daylight: 'daylight',
  'cloudy-daylight': 'cloudyDaylight',
  twilight: 'twilight',
  shade: 'shade',
}

const FOCUS_MODES: CameraFocusMode[] = ['auto', 'off', 'manual']
const FOCUS_MESSAGE_KEYS: Record<CameraFocusMode, keyof AcquisitionMessageValues> = {
  auto: 'focusAuto',
  off: 'focusOff',
  manual: 'focusManual',
}

/** 描述相机配置编辑器接收的外部禁用状态。 */
export interface CameraConfigurationEditorProps {
  /** 当前会话占用相机时禁止修改下一次启动草稿。 */
  disabled?: boolean
}

/** 提供模式相关的相机配置草稿编辑器。 */
export function CameraConfigurationEditor({ disabled = false }: CameraConfigurationEditorProps) {
  const messages = useStore(acquisitionMessages)
  const query = useStore(acquisitionCameraQuery)
  const config = query.draftConfig
  const capabilities = query.capabilities
  if (config == null || capabilities == null || config.cameraId !== query.selectedCameraId) return null
  const availableCapabilities = capabilities
  const controlsDisabled = disabled || query.isLoading

  function setExposureMode(mode: 'auto' | 'manual'): void {
    updateAcquisitionCameraDraft((current) => {
      if (mode === 'auto') {
        const range = availableCapabilities.exposureCompensationIndex.range
        const compensationIndex = range == null
          ? 0
          : Math.round(Math.min(range.maximum, Math.max(range.minimum, 0)))
        return {
          ...current,
          exposure: {
            mode,
            compensationIndex,
            timeNanos: null,
            iso: null,
            locked: false,
          },
        }
      }
      return {
        ...current,
        exposure: {
          mode,
          compensationIndex: null,
          timeNanos: availableCapabilities.exposureTimeNanos.range?.minimum ?? null,
          iso: availableCapabilities.iso.range?.minimum ?? null,
          locked: false,
        },
      }
    })
  }

  return (
    <AppCard>
      <AppText variant="section">{messages.configTitle}</AppText>
      <AppText tone="secondary">{messages.configDescription}</AppText>
      <AppText tone="secondary" variant="caption">{messages.cameraId}：{config.cameraId}</AppText>
      <AppText tone="secondary" variant="caption">
        {messages.targetSize}：{config.targetResolution.width} × {config.targetResolution.height} px；{messages.targetFpsLabel}：{config.targetFps}
      </AppText>

      <EditorGroup>
        <AppText variant="label">{messages.exposureAndAe}</AppText>
        <ActionButton
          label={`${messages.autoExposure} · ${messages[CAPABILITY_STATUS_KEYS[modeStatus(capabilities.exposureModes, 'auto')]]}`}
          disabled={controlsDisabled || modeStatus(capabilities.exposureModes, 'auto') !== 'supported'}
          secondary={config.exposure.mode !== 'auto'}
          onPress={() => setExposureMode('auto')}
        />
        <ActionButton
          label={`${messages.manualExposure} · ${messages[CAPABILITY_STATUS_KEYS[modeStatus(capabilities.exposureModes, 'manual')]]}`}
          secondary={config.exposure.mode !== 'manual'}
          onPress={() => setExposureMode('manual')}
        />
        {config.exposure.mode === 'auto' ? (
          <>
            <AppText tone="secondary" variant="caption">
              {messages.compensationIndex}：{messages[CAPABILITY_STATUS_KEYS[capabilities.exposureCompensationIndex.status]]}；{messages.deviceEvStep}
            </AppText>
            <AppInput
              label={messages.compensationIndexLabel}
              disabled={controlsDisabled}
              keyboardType="number-pad"
              value={String(config.exposure.compensationIndex ?? '')}
              onChangeText={(value) => updateAcquisitionCameraDraft((current) => ({
                ...current,
                exposure: { ...current.exposure, compensationIndex: parseOptionalNumber(value) },
              }))}
              placeholder={messages.compensationIndexLabel}
            />
            <ActionButton
              label={`${messages.aeLockRequest}：${config.exposure.locked ? messages.on : messages.off} · ${messages[CAPABILITY_STATUS_KEYS[capabilities.aeLock.status]]}`}
              disabled={controlsDisabled || (!config.exposure.locked && capabilities.aeLock.status !== 'supported')}
              secondary={!config.exposure.locked}
              onPress={() => updateAcquisitionCameraDraft((current) => ({
                ...current,
                exposure: { ...current.exposure, locked: !current.exposure.locked },
              }))}
            />
          </>
        ) : (
          <>
            <AppText tone="secondary" variant="caption">
              {messages.exposureTime}：{formatRange(capabilities.exposureTimeNanos.range, 'ns', messages)}；{messages.capabilityIso}：{formatRange(capabilities.iso.range, 'ISO', messages)}。
            </AppText>
            <AppInput
              label={messages.manualExposureTimeLabel}
              disabled={controlsDisabled}
              keyboardType="number-pad"
              value={String(config.exposure.timeNanos ?? '')}
              onChangeText={(value) => updateAcquisitionCameraDraft((current) => ({
                ...current,
                exposure: { ...current.exposure, timeNanos: parseOptionalNumber(value) },
              }))}
              placeholder={messages.exposureTimePlaceholder}
            />
            <AppInput
              label={messages.manualIsoLabel}
              disabled={controlsDisabled}
              keyboardType="number-pad"
              value={String(config.exposure.iso ?? '')}
              onChangeText={(value) => updateAcquisitionCameraDraft((current) => ({
                ...current,
                exposure: { ...current.exposure, iso: parseOptionalNumber(value) },
              }))}
              placeholder="ISO"
            />
          </>
        )}
      </EditorGroup>

      <EditorGroup>
        <AppText variant="label">{messages.whiteBalanceAndAwb}</AppText>
        {WHITE_BALANCE_MODES.map((mode) => {
          const status = modeStatus(capabilities.whiteBalanceModes, mode)
          return (
            <ActionButton
              key={mode}
              label={`${messages[WHITE_BALANCE_MESSAGE_KEYS[mode]]} · ${messages[CAPABILITY_STATUS_KEYS[status]]}`}
              disabled={controlsDisabled || status !== 'supported'}
              secondary={config.whiteBalance.mode !== mode}
              onPress={() => updateAcquisitionCameraDraft((current) => ({
                ...current,
                whiteBalance: {
                  mode,
                  locked: mode === 'auto' ? current.whiteBalance.locked : false,
                },
              }))}
            />
          )
        })}
        <ActionButton
          label={`${messages.awbLockRequest}：${config.whiteBalance.locked ? messages.on : messages.off} · ${messages[CAPABILITY_STATUS_KEYS[capabilities.awbLock.status]]}`}
          disabled={controlsDisabled || config.whiteBalance.mode !== 'auto' || (!config.whiteBalance.locked && capabilities.awbLock.status !== 'supported')}
          secondary={!config.whiteBalance.locked}
          onPress={() => updateAcquisitionCameraDraft((current) => ({
            ...current,
            whiteBalance: { ...current.whiteBalance, locked: !current.whiteBalance.locked },
          }))}
        />
      </EditorGroup>

      <EditorGroup>
        <AppText variant="label">{messages.focusAndTorch}</AppText>
        {FOCUS_MODES.map((mode) => {
          const status = modeStatus(capabilities.focusModes, mode)
          return (
            <ActionButton
              key={mode}
              label={`${messages[FOCUS_MESSAGE_KEYS[mode]]} · ${messages[CAPABILITY_STATUS_KEYS[status]]}`}
              disabled={controlsDisabled || status !== 'supported'}
              secondary={config.focus.mode !== mode}
              onPress={() => updateAcquisitionCameraDraft((current) => ({
                ...current,
                focus: {
                  mode,
                  distanceDiopters: mode === 'manual'
                    ? capabilities.focusDistanceDiopters.range?.minimum ?? null
                    : null,
                },
              }))}
            />
          )
        })}
        {config.focus.mode === 'manual' && (
          <>
            <AppText tone="secondary" variant="caption">
              {messages.manualDistance}：{formatRange(capabilities.focusDistanceDiopters.range, 'D', messages)}；{messages.infinityDistance}
            </AppText>
            <AppInput
              label={messages.manualFocusDistanceLabel}
              disabled={controlsDisabled}
              keyboardType="decimal-pad"
              value={String(config.focus.distanceDiopters ?? '')}
              onChangeText={(value) => updateAcquisitionCameraDraft((current) => ({
                ...current,
                focus: { ...current.focus, distanceDiopters: parseOptionalNumber(value) },
              }))}
              placeholder={messages.manualFocusDistancePlaceholder}
            />
          </>
        )}
        <AppText tone="secondary" variant="caption">{messages.torchCapability}：{formatBoolean(capabilities.torch, messages)}</AppText>
        <ActionButton
          label={`${messages.torch}：${config.torchEnabled ? messages.on : messages.off}`}
          disabled={controlsDisabled || (!config.torchEnabled && capabilities.torch.status !== 'supported')}
          secondary={!config.torchEnabled}
          onPress={() => updateAcquisitionCameraDraft((current) => ({
            ...current,
            torchEnabled: !current.torchEnabled,
          }))}
        />
      </EditorGroup>

      <EditorGroup>
        <AppText variant="label">{messages.processingGrid}</AppText>
        <AppText tone="secondary" variant="caption">
          {messages.availableRange}：{query.captureOptions?.processing.maxBlockCount ?? messages.capabilityUnknown} {messages.blocks}；
          {query.captureOptions?.processing.maxRows ?? messages.capabilityUnknown} {messages.rows} × {query.captureOptions?.processing.maxColumns ?? messages.capabilityUnknown} {messages.columns}。
        </AppText>
        <EditorInputs>
          <AppInput
            label={messages.rowCount}
            disabled={controlsDisabled}
            keyboardType="number-pad"
            value={String(config.processing.blocks[0] ?? '')}
            onChangeText={(value) => updateAcquisitionCameraDraft((current) => ({
              ...current,
              processing: { blocks: [parseOptionalNumber(value) ?? 0, current.processing.blocks[1] ?? 0] },
            }))}
            placeholder={messages.rowCountPlaceholder}
          />
          <AppInput
            label={messages.columnCount}
            disabled={controlsDisabled}
            keyboardType="number-pad"
            value={String(config.processing.blocks[1] ?? '')}
            onChangeText={(value) => updateAcquisitionCameraDraft((current) => ({
              ...current,
              processing: { blocks: [current.processing.blocks[0] ?? 0, parseOptionalNumber(value) ?? 0] },
            }))}
            placeholder={messages.columnCountPlaceholder}
          />
        </EditorInputs>
      </EditorGroup>
    </AppCard>
  )
}

/** 将模式数组与未知值区分为支持、未知或明确不支持。 */
function modeStatus(capability: CameraModeCapability, mode: string): CameraCapabilityStatus {
  if (capability.modes?.includes(mode)) return 'supported'
  if (capability.unknownModes.includes(mode)) {
    return capability.status === 'permission-required' ? 'permission-required' : 'unknown'
  }
  if (capability.modes == null && capability.status === 'permission-required') return 'permission-required'
  if (capability.modes == null && capability.status === 'unknown') return 'unknown'
  return 'unsupported'
}

/** 格式化设备报告的数值范围与单位，不填补未知边界。 */
function formatRange(
  range: { minimum: number; maximum: number } | null,
  unit: string,
  messages: AcquisitionMessageValues,
): string {
  return range == null ? `${messages.rangeUnknown}（${unit}）` : `${range.minimum}–${range.maximum} ${unit}`
}

/** 将空输入保留为空值，其它输入转换为后续校验的数值。 */
function parseOptionalNumber(value: string): number | null {
  return value.trim() === '' ? null : Number(value)
}

/** 格式化布尔能力状态，区分 false 与未知。 */
function formatBoolean(
  capability: { status: CameraCapabilityStatus; value: boolean | null },
  messages: AcquisitionMessageValues,
): string {
  const value = capability.value == null
    ? messages.valueUnknown
    : capability.value ? messages.valueSupported : messages.valueUnsupported
  return `${messages[CAPABILITY_STATUS_KEYS[capability.status]]}：${value}`
}

