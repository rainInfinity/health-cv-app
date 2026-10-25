/** 呈现显式授权、相机选择及无副作用的能力组合查询。 */

import { useState } from 'react'
import { useStore } from '@nanostores/react'
import {
  acquisitionCameraQuery,
  queryAcquisitionCameras,
  querySelectedAcquisitionCamera,
  requestAcquisitionCameraPermission,
  selectAcquisitionCamera,
  updateAcquisitionCameraDraft,
} from '../../app/acquisition'
import type {
  CameraBooleanCapability,
  CameraModeCapability,
  CameraNumericCapability,
} from '@health-cv-app/acquisition'
import { ActionButton } from './components/ActionButton'
import { StyleSheet, Text, TextInput, View } from 'react-native'

const CAPABILITY_STATUS: Record<'supported' | 'unsupported' | 'permission-required' | 'unknown', string> = {
  supported: '支持',
  unsupported: '明确不支持',
  'permission-required': '需要相机权限',
  unknown: '未知',
}

/** 提供本地权限、相机枚举、参数能力和用例组合查询。 */
export function CameraQueryPanel({ controlsDisabled = false }: { controlsDisabled?: boolean }) {
  const query = useStore(acquisitionCameraQuery)
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [width, setWidth] = useState('720')
  const [height, setHeight] = useState('720')
  const [targetFps, setTargetFps] = useState('30')
  const isBusy = busy || query.isLoading
  const inputsDisabled = controlsDisabled || isBusy

  async function runQuery(operation: () => Promise<void>): Promise<void> {
    setBusy(true)
    setLocalError(null)
    try {
      await operation()
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '相机查询失败。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>相机授权与启动前查询</Text>
      <Text style={styles.body}>
        授权、枚举和能力查询均不打开相机、启用补光、绑定预览或创建会话文件。授权与查询分开操作。
      </Text>
      <Text style={styles.body}>权限状态：{query.permissionGranted ? '已明确授权' : '尚未通过本页确认'}</Text>
      <ActionButton
        label="显式请求相机权限"
        disabled={inputsDisabled}
        secondary
        onPress={() => void runQuery(requestAcquisitionCameraPermission)}
      />
      <ActionButton
        label="枚举可选相机"
        disabled={inputsDisabled}
        secondary
        onPress={() => void runQuery(() => queryAcquisitionCameras().then(() => undefined))}
      />

      {query.cameras.length === 0 ? (
        <Text style={styles.body}>尚未枚举相机。</Text>
      ) : (
        <View style={styles.options}>
          <Text style={styles.subtitle}>选择本次查询相机</Text>
          {query.cameras.map((camera) => (
            <View key={camera.cameraId} style={styles.cameraChoice}>
              <ActionButton
                label={`${query.selectedCameraId === camera.cameraId ? '✓ ' : ''}${facingLabel(camera.facing)} · ${camera.cameraId}`}
                disabled={inputsDisabled}
                secondary={query.selectedCameraId !== camera.cameraId}
                onPress={() => selectAcquisitionCamera(camera.cameraId)}
              />
              <Text style={styles.body}>
                传感器方向：{camera.sensorOrientationDegrees == null ? '未知' : `${camera.sensorOrientationDegrees}°`}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.subtitle}>Preview + YUV 尺寸／帧率候选</Text>
      <View style={styles.inputs}>
        <TextInput
          accessibilityLabel="候选宽度像素"
          keyboardType="number-pad"
          editable={!inputsDisabled}
          value={width}
          onChangeText={(value) => {
            setWidth(value)
            updateAcquisitionCameraDraft((config) => ({
              ...config,
              targetResolution: { ...config.targetResolution, width: Number(value) },
            }))
          }}
          style={styles.input}
          placeholder="宽度像素"
        />
        <TextInput
          accessibilityLabel="候选高度像素"
          keyboardType="number-pad"
          editable={!inputsDisabled}
          value={height}
          onChangeText={(value) => {
            setHeight(value)
            updateAcquisitionCameraDraft((config) => ({
              ...config,
              targetResolution: { ...config.targetResolution, height: Number(value) },
            }))
          }}
          style={styles.input}
          placeholder="高度像素"
        />
        <TextInput
          accessibilityLabel="目标帧率"
          keyboardType="decimal-pad"
          editable={!inputsDisabled}
          value={targetFps}
          onChangeText={(value) => {
            setTargetFps(value)
            updateAcquisitionCameraDraft((config) => ({ ...config, targetFps: Number(value) }))
          }}
          style={styles.input}
          placeholder="目标 FPS"
        />
      </View>
      <ActionButton
        label="查询所选相机能力与组合"
        disabled={inputsDisabled || query.selectedCameraId == null}
        onPress={() => void runQuery(() => querySelectedAcquisitionCamera({
          targetResolution: { width: Number(width), height: Number(height) },
          targetFps: Number(targetFps),
        }))}
      />
      {isBusy && <Text style={styles.body}>正在读取相机静态信息，未绑定预览用例…</Text>}
      {(localError ?? query.errorMessage) != null && (
        <Text accessibilityRole="alert" style={styles.error}>{localError ?? query.errorMessage}</Text>
      )}

      {query.capabilities != null && (
        <View style={styles.options}>
          <Text style={styles.subtitle}>静态参数能力 · {query.capabilities.cameraId}</Text>
          <Text style={styles.body}>曝光模式：{formatModeCapability(query.capabilities.exposureModes)}</Text>
          <Text style={styles.body}>曝光时间：{formatNumericCapability(query.capabilities.exposureTimeNanos, 'ns')}</Text>
          <Text style={styles.body}>ISO：{formatNumericCapability(query.capabilities.iso, 'ISO')}</Text>
          <Text style={styles.body}>
            曝光补偿：{formatNumericCapability(query.capabilities.exposureCompensationIndex, '索引')}
          </Text>
          <Text style={styles.body}>白平衡：{formatModeCapability(query.capabilities.whiteBalanceModes)}</Text>
          <Text style={styles.body}>对焦：{formatModeCapability(query.capabilities.focusModes)}</Text>
          <Text style={styles.body}>
            手动对焦距离：{formatNumericCapability(query.capabilities.focusDistanceDiopters, '屈光度')}
          </Text>
          <Text style={styles.body}>Torch：{formatBooleanCapability(query.capabilities.torch)}</Text>
          <Text style={styles.body}>AE 锁：{formatBooleanCapability(query.capabilities.aeLock)}</Text>
          <Text style={styles.body}>AWB 锁：{formatBooleanCapability(query.capabilities.awbLock)}</Text>
        </View>
      )}

      {query.captureOptions != null && (
        <View style={styles.options}>
          <Text style={styles.subtitle}>单个用例组合结果 · {query.captureOptions.cameraId}</Text>
          {query.captureOptions.options.map((option, index) => (
            <Text key={`${option.resolution.width}x${option.resolution.height}-${index}`} style={styles.body}>
              {option.resolution.width} × {option.resolution.height} px：
              {CAPABILITY_STATUS[option.compatibility]}；帧率范围：
              {option.fpsRanges == null
                ? '未知'
                : option.fpsRanges.length === 0
                  ? '无已报告范围'
                  : option.fpsRanges.map((range) => `${range.minimum}–${range.maximum}`).join(', ')}
              {option.reason == null ? '' : `；${option.reason}`}
            </Text>
          ))}
          <Text style={styles.body}>
            本地分块上限：{query.captureOptions.processing.maxBlockCount} 块；最多
            {query.captureOptions.processing.maxRows} 行 × {query.captureOptions.processing.maxColumns} 列。
          </Text>
        </View>
      )}
    </View>
  )
}

/** 将 facing 值转换为界面使用的中文名称。 */
function facingLabel(facing: string): string {
  if (facing === 'back') return '后摄'
  if (facing === 'front') return '前摄'
  if (facing === 'external') return '外接相机'
  return '朝向未知'
}

/** 同时展示已支持、未支持及逐模式仍未知的枚举结果。 */
function formatModeCapability(capability: CameraModeCapability): string {
  const modes = capability.modes == null ? '模式列表未知' : capability.modes.join(', ') || '无已知支持模式'
  const unknown = capability.unknownModes.length === 0 ? '' : `；未确认：${capability.unknownModes.join(', ')}`
  const reason = capability.reason == null ? '' : `；${capability.reason}`
  return `${CAPABILITY_STATUS[capability.status]}：${modes}${unknown}${reason}`
}

/** 展示已知数值区间与单位，不用零范围填补未知能力。 */
function formatNumericCapability(capability: CameraNumericCapability, unit: string): string {
  const range = capability.range == null
    ? '范围未知'
    : `${capability.range.minimum}–${capability.range.maximum} ${unit}`
  const step = capability.range?.step == null
    ? ''
    : `；步长 ${capability.range.step.numerator}/${capability.range.step.denominator}`
  const reason = capability.reason == null ? '' : `；${capability.reason}`
  return `${CAPABILITY_STATUS[capability.status]}：${range}${step}${reason}`
}

/** 展示布尔能力状态，保留 false 与未知的区别。 */
function formatBooleanCapability(capability: CameraBooleanCapability): string {
  const value = capability.value == null ? '值未知' : capability.value ? '已知为支持' : '已知为不支持'
  const reason = capability.reason == null ? '' : `；${capability.reason}`
  return `${CAPABILITY_STATUS[capability.status]}：${value}${reason}`
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 12, backgroundColor: '#fff', gap: 10 },
  title: { color: '#263238', fontSize: 17, fontWeight: '600' },
  subtitle: { color: '#344054', fontSize: 15, fontWeight: '600' },
  body: { color: '#52606d', fontSize: 13, lineHeight: 19 },
  error: { color: '#b42318', fontSize: 14, lineHeight: 20 },
  options: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e4e7ec', paddingTop: 10 },
  cameraChoice: { gap: 4 },
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
