/** 编辑查询对应的相机配置草稿，不直接修改已打开的原生会话。 */

import { useStore } from '@nanostores/react'
import type {
  CameraFocusMode,
  CameraModeCapability,
  CameraWhiteBalanceMode,
} from '@health-cv-app/acquisition'
import {
  acquisitionCameraQuery,
  updateAcquisitionCameraDraft,
} from '../../app/acquisition'
import { ActionButton } from './components/ActionButton'
import { StyleSheet, Text, TextInput, View } from 'react-native'

const CAPABILITY_STATUS: Record<'supported' | 'unsupported' | 'permission-required' | 'unknown', string> = {
  supported: '支持',
  unsupported: '明确不支持',
  'permission-required': '需要相机权限',
  unknown: '未知',
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

const WHITE_BALANCE_LABELS: Record<CameraWhiteBalanceMode, string> = {
  auto: '自动',
  off: '关闭',
  incandescent: '白炽灯',
  fluorescent: '荧光灯',
  'warm-fluorescent': '暖荧光灯',
  daylight: '日光',
  'cloudy-daylight': '阴天',
  twilight: '暮光',
  shade: '阴影',
}

const FOCUS_MODES: CameraFocusMode[] = ['auto', 'off', 'manual']
const FOCUS_LABELS: Record<CameraFocusMode, string> = {
  auto: '自动',
  off: '关闭 AF',
  manual: '手动',
}

/** 提供模式相关的相机配置草稿编辑器。 */
export function CameraConfigurationEditor({ disabled = false }: { disabled?: boolean }) {
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
    <View style={styles.card}>
      <Text style={styles.title}>本次配置草稿</Text>
      <Text style={styles.body}>
        相机与参数在打开时冻结；预览／采集中不能重配。修改尺寸或 FPS 后须重新查询该组合。
      </Text>
      <Text style={styles.body}>cameraId：{config.cameraId}</Text>
      <Text style={styles.body}>
        目标尺寸：{config.targetResolution.width} × {config.targetResolution.height} px；目标 FPS：{config.targetFps}
      </Text>

      <View style={styles.group}>
        <Text style={styles.subtitle}>曝光与 AE</Text>
        <ActionButton
          label={`自动曝光 · ${CAPABILITY_STATUS[modeStatus(capabilities.exposureModes, 'auto')]}`}
          disabled={controlsDisabled || modeStatus(capabilities.exposureModes, 'auto') !== 'supported'}
          secondary={config.exposure.mode !== 'auto'}
          onPress={() => setExposureMode('auto')}
        />
        <ActionButton
          label={`手动曝光 · ${CAPABILITY_STATUS[modeStatus(capabilities.exposureModes, 'manual')]}`}
          disabled={controlsDisabled || modeStatus(capabilities.exposureModes, 'manual') !== 'supported'}
          secondary={config.exposure.mode !== 'manual'}
          onPress={() => setExposureMode('manual')}
        />
        {config.exposure.mode === 'auto' ? (
          <>
            <Text style={styles.body}>
              补偿索引：{CAPABILITY_STATUS[capabilities.exposureCompensationIndex.status]}；单位为设备 EV 步长。
            </Text>
            <TextInput
              editable={!controlsDisabled}
              accessibilityLabel="曝光补偿索引"
              keyboardType="number-pad"
              value={String(config.exposure.compensationIndex ?? '')}
              onChangeText={(value) => updateAcquisitionCameraDraft((current) => ({
                ...current,
                exposure: { ...current.exposure, compensationIndex: parseOptionalNumber(value) },
              }))}
              style={styles.input}
              placeholder="曝光补偿索引"
            />
            <ActionButton
              label={`请求 AE 锁定：${config.exposure.locked ? '开启' : '关闭'} · ${CAPABILITY_STATUS[capabilities.aeLock.status]}`}
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
            <Text style={styles.body}>
              曝光时间：{formatRange(capabilities.exposureTimeNanos.range, 'ns')}；ISO：{formatRange(capabilities.iso.range, 'ISO')}。
            </Text>
            <TextInput
              editable={!controlsDisabled}
              accessibilityLabel="手动曝光时间纳秒"
              keyboardType="number-pad"
              value={String(config.exposure.timeNanos ?? '')}
              onChangeText={(value) => updateAcquisitionCameraDraft((current) => ({
                ...current,
                exposure: { ...current.exposure, timeNanos: parseOptionalNumber(value) },
              }))}
              style={styles.input}
              placeholder="曝光时间（ns）"
            />
            <TextInput
              editable={!controlsDisabled}
              accessibilityLabel="手动 ISO"
              keyboardType="number-pad"
              value={String(config.exposure.iso ?? '')}
              onChangeText={(value) => updateAcquisitionCameraDraft((current) => ({
                ...current,
                exposure: { ...current.exposure, iso: parseOptionalNumber(value) },
              }))}
              style={styles.input}
              placeholder="ISO"
            />
          </>
        )}
      </View>

      <View style={styles.group}>
        <Text style={styles.subtitle}>白平衡与 AWB</Text>
        {WHITE_BALANCE_MODES.map((mode) => {
          const status = modeStatus(capabilities.whiteBalanceModes, mode)
          return (
            <ActionButton
              key={mode}
              label={`${WHITE_BALANCE_LABELS[mode]} · ${CAPABILITY_STATUS[status]}`}
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
          label={`请求 AWB 锁定：${config.whiteBalance.locked ? '开启' : '关闭'} · ${CAPABILITY_STATUS[capabilities.awbLock.status]}`}
          disabled={controlsDisabled || config.whiteBalance.mode !== 'auto' || (!config.whiteBalance.locked && capabilities.awbLock.status !== 'supported')}
          secondary={!config.whiteBalance.locked}
          onPress={() => updateAcquisitionCameraDraft((current) => ({
            ...current,
            whiteBalance: { ...current.whiteBalance, locked: !current.whiteBalance.locked },
          }))}
        />
      </View>

      <View style={styles.group}>
        <Text style={styles.subtitle}>对焦与 Torch</Text>
        {FOCUS_MODES.map((mode) => {
          const status = modeStatus(capabilities.focusModes, mode)
          return (
            <ActionButton
              key={mode}
              label={`${FOCUS_LABELS[mode]} 对焦 · ${CAPABILITY_STATUS[status]}`}
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
            <Text style={styles.body}>
              手动距离：{formatRange(capabilities.focusDistanceDiopters.range, '屈光度')}；0 表示无穷远。
            </Text>
            <TextInput
              editable={!controlsDisabled}
              accessibilityLabel="手动对焦屈光度"
              keyboardType="decimal-pad"
              value={String(config.focus.distanceDiopters ?? '')}
              onChangeText={(value) => updateAcquisitionCameraDraft((current) => ({
                ...current,
                focus: { ...current.focus, distanceDiopters: parseOptionalNumber(value) },
              }))}
              style={styles.input}
              placeholder="手动对焦距离（屈光度）"
            />
          </>
        )}
        <Text style={styles.body}>Torch 能力：{formatBoolean(capabilities.torch)}</Text>
        <ActionButton
          label={`Torch：${config.torchEnabled ? '开启' : '关闭'}`}
          disabled={controlsDisabled || (!config.torchEnabled && capabilities.torch.status !== 'supported')}
          secondary={!config.torchEnabled}
          onPress={() => updateAcquisitionCameraDraft((current) => ({
            ...current,
            torchEnabled: !current.torchEnabled,
          }))}
        />
      </View>

      <View style={styles.group}>
        <Text style={styles.subtitle}>图像分块 [rows, columns]</Text>
        <Text style={styles.body}>
          可用范围：最多 {query.captureOptions?.processing.maxBlockCount ?? '未知'} 块；
          {query.captureOptions?.processing.maxRows ?? '未知'} 行 × {query.captureOptions?.processing.maxColumns ?? '未知'} 列。
        </Text>
        <View style={styles.inputs}>
          <TextInput
            editable={!controlsDisabled}
            accessibilityLabel="分块行数"
            keyboardType="number-pad"
            value={String(config.processing.blocks[0] ?? '')}
            onChangeText={(value) => updateAcquisitionCameraDraft((current) => ({
              ...current,
              processing: { blocks: [parseOptionalNumber(value) ?? 0, current.processing.blocks[1] ?? 0] },
            }))}
            style={styles.input}
            placeholder="行数"
          />
          <TextInput
            editable={!controlsDisabled}
            accessibilityLabel="分块列数"
            keyboardType="number-pad"
            value={String(config.processing.blocks[1] ?? '')}
            onChangeText={(value) => updateAcquisitionCameraDraft((current) => ({
              ...current,
              processing: { blocks: [current.processing.blocks[0] ?? 0, parseOptionalNumber(value) ?? 0] },
            }))}
            style={styles.input}
            placeholder="列数"
          />
        </View>
      </View>
    </View>
  )
}

/** 将模式数组与未知值区分为支持、未知或明确不支持。 */
function modeStatus(capability: CameraModeCapability, mode: string): keyof typeof CAPABILITY_STATUS {
  if (capability.modes?.includes(mode)) return 'supported'
  if (capability.unknownModes.includes(mode)) {
    return capability.status === 'permission-required' ? 'permission-required' : 'unknown'
  }
  if (capability.modes == null && capability.status === 'permission-required') return 'permission-required'
  if (capability.modes == null && capability.status === 'unknown') return 'unknown'
  return 'unsupported'
}

/** 格式化设备报告的数值范围与单位，不填补未知边界。 */
function formatRange(range: { minimum: number; maximum: number } | null, unit: string): string {
  return range == null ? `未知（${unit}）` : `${range.minimum}–${range.maximum} ${unit}`
}

/** 将空输入保留为空值，其它输入转换为后续校验的数值。 */
function parseOptionalNumber(value: string): number | null {
  return value.trim() === '' ? null : Number(value)
}

/** 格式化布尔能力状态，区分 false 与未知。 */
function formatBoolean(capability: { status: keyof typeof CAPABILITY_STATUS; value: boolean | null }): string {
  const value = capability.value == null ? '值未知' : capability.value ? '已知支持' : '已知不支持'
  return `${CAPABILITY_STATUS[capability.status]}：${value}`
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 12, backgroundColor: '#fff', gap: 10 },
  title: { color: '#263238', fontSize: 17, fontWeight: '600' },
  subtitle: { color: '#344054', fontSize: 15, fontWeight: '600' },
  body: { color: '#52606d', fontSize: 13, lineHeight: 19 },
  group: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e4e7ec', paddingTop: 10 },
  inputs: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#c7d0d9',
    borderRadius: 8,
    paddingHorizontal: 10,
    color: '#344054',
  },
})
