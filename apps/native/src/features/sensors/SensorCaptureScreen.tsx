/** 提供四种 Android 传感器的能力查询、独立启停与文件查看界面。 */

import { useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import type { SensorKind, SensorSnapshot } from '@health-cv-app/acquisition'
import {
  connectSensorScreen,
  refreshSensorScreen,
  sensorArtifacts,
  sensorCapabilities,
  sensorClients,
  sensorErrors,
  sensorKinds,
  sensorSnapshots,
  setSensorError,
  startSensorCapture,
  stopSensorCapture,
} from '../../app/sensors'
import { ActionButton } from '../acquisition/components/ActionButton'

const SENSOR_LABELS: Record<SensorKind, string> = {
  accelerometer: '加速度计',
  gyroscope: '陀螺仪',
  magnetometer: '磁力计',
  gravity: '重力传感器',
}

const SENSOR_UNITS: Record<SensorKind, string> = {
  accelerometer: 'm/s²（包含重力）',
  gyroscope: 'rad/s',
  magnetometer: 'μT',
  gravity: 'm/s²',
}

const PHASE_LABELS: Record<SensorSnapshot['phase'], string> = {
  idle: '未采集',
  starting: '正在启动',
  capturing: '正在采集',
  stopping: '正在完成文件',
  failed: '操作失败',
}

/** 呈现独立于登录、相机及云端配置的传感器验证入口。 */
export function SensorCaptureScreen() {
  const snapshots = useStore(sensorSnapshots)
  const capabilities = useStore(sensorCapabilities)
  const artifacts = useStore(sensorArtifacts)
  const errors = useStore(sensorErrors)
  const [periods, setPeriods] = useState<Record<SensorKind, string>>({
    accelerometer: '20000',
    gyroscope: '20000',
    magnetometer: '20000',
    gravity: '20000',
  })
  const [busyKinds, setBusyKinds] = useState<Set<SensorKind>>(() => new Set())

  useEffect(() => {
    const unsubscribe = connectSensorScreen()
    void refreshSensorScreen()
    return unsubscribe
  }, [])

  async function runCommand(kind: SensorKind, command: () => Promise<void>): Promise<void> {
    setBusyKinds((current) => new Set(current).add(kind))
    try {
      await command()
    } catch (error) {
      setSensorError(kind, error)
    } finally {
      setBusyKinds((current) => {
        const next = new Set(current)
        next.delete(kind)
        return next
      })
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Android 传感器采集验证</Text>
        <Text style={styles.description}>
          四种传感器分别控制。创建客户端、查询能力和切换页面不会开始采集；高频样本只在 Android 原生侧处理。
        </Text>

        {sensorKinds.map((kind) => {
          const snapshot = snapshots[kind]
          const capability = capabilities[kind]
          const isBusy = busyKinds.has(kind)
          const canStart = capability?.available === true
            && !isBusy
            && (snapshot.phase === 'idle' || snapshot.phase === 'failed')
          const canStop = snapshot.phase === 'capturing' && !isBusy
          const errorMessage = errors[kind] ?? snapshot.errorMessage

          return (
            <View key={kind} style={styles.card}>
              <Text style={styles.heading}>{SENSOR_LABELS[kind]}</Text>
              <Text style={styles.detail}>类型：{kind}</Text>
              <Text style={styles.detail}>单位：{SENSOR_UNITS[kind]}</Text>
              <Text style={styles.detail}>坐标：android-device（设备自然方向，不随屏幕旋转）</Text>

              <Text style={styles.detail}>
                设备能力：{capability == null
                  ? '查询中或不可用'
                  : capability.available
                    ? `${capability.deviceName ?? '默认设备'}；最小间隔 ${capability.minSamplingPeriodMicros ?? '未知'} μs`
                    : '设备不提供该默认传感器'}
              </Text>
              {!capability?.available && capability != null && (
                <Text style={styles.detail}>此类型在当前设备不可用，不会用其它传感器或算法补造数据。</Text>
              )}

              <Text style={styles.state}>状态：{PHASE_LABELS[snapshot.phase]}</Text>
              {snapshot.sessionId != null && (
                <Text style={styles.detail}>会话：{snapshot.sessionId}</Text>
              )}
              {snapshot.requestedSamplingPeriodMicros != null && (
                <Text style={styles.detail}>
                  请求间隔：{snapshot.requestedSamplingPeriodMicros} μs；注册间隔：{snapshot.registeredSamplingPeriodMicros ?? '未知'} μs
                </Text>
              )}
              <Text style={styles.disclaimer}>
                注册参数不是实际稳定采样频率；事件时间反映系统实际交付。
              </Text>

              <View style={styles.control}>
                <Text style={styles.label}>请求采样间隔（μs，5,000–1,000,000）</Text>
                <TextInput
                  accessibilityLabel={`${SENSOR_LABELS[kind]} 请求采样间隔，微秒`}
                  editable={!isBusy && snapshot.phase !== 'capturing' && snapshot.phase !== 'stopping'}
                  keyboardType="numeric"
                  onChangeText={(value) => setPeriods((current) => ({ ...current, [kind]: value }))}
                  value={periods[kind]}
                  style={styles.input}
                />
                <ActionButton
                  label="开始采集"
                  disabled={!canStart}
                  onPress={() => void runCommand(kind, () => startSensorCapture(kind, Number(periods[kind])))}
                />
                <ActionButton
                  label="停止并保存"
                  disabled={!canStop}
                  secondary
                  onPress={() => void runCommand(kind, () => stopSensorCapture(kind))}
                />
              </View>

              {errorMessage != null && (
                <Text accessibilityRole="alert" style={styles.error}>
                  {snapshot.errorCode == null ? '' : `${snapshot.errorCode}：`}{errorMessage}
                </Text>
              )}

              <View style={styles.files}>
                <Text style={styles.subheading}>本进程已完成文件</Text>
                {artifacts[kind].length === 0 ? (
                  <Text style={styles.detail}>尚无完成文件。</Text>
                ) : artifacts[kind].map((artifact) => (
                  <View key={artifact.sessionId} style={styles.artifact}>
                    <Text style={styles.detail}>会话：{artifact.sessionId}</Text>
                    <Text selectable style={styles.path}>{artifact.path}</Text>
                    <Text style={styles.detail}>
                      {artifact.sampleCount} 条记录；{artifact.sizeBytes} bytes；请求 {artifact.requestedSamplingPeriodMicros} μs／注册 {artifact.registeredSamplingPeriodMicros} μs
                    </Text>
                    <Text style={styles.detail}>
                      起止单调时间：{artifact.startedAtMillis}–{artifact.finishedAtMillis} ms；单位 {artifact.unit}；{artifact.coordinateSystem}
                    </Text>
                  </View>
                ))}
                <Text style={styles.disclaimer}>
                  列表只查询当前进程完成的引用；进程重启后列表重置，已完成文件仍保留。
                </Text>
              </View>
            </View>
          )
        })}

        <ActionButton
          label="重新查询设备能力与完成文件"
          disabled={busyKinds.size > 0}
          secondary
          onPress={() => void refreshSensorScreen()}
        />
        <Text style={styles.disclaimer}>
          进入本页只订阅低频状态和查询设备，不采集样本。切换页签或解除订阅不会停止正在运行的传感器。
        </Text>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8fa' },
  content: { padding: 20, gap: 16 },
  title: { color: '#17202a', fontSize: 24, fontWeight: '700' },
  description: { color: '#52606d', fontSize: 15, lineHeight: 22 },
  card: { padding: 16, borderRadius: 12, backgroundColor: '#fff', gap: 8 },
  heading: { color: '#263238', fontSize: 18, fontWeight: '700' },
  subheading: { color: '#263238', fontSize: 15, fontWeight: '600' },
  detail: { color: '#52606d', fontSize: 14, lineHeight: 20 },
  state: { color: '#166534', fontSize: 15, fontWeight: '600' },
  disclaimer: { color: '#667085', fontSize: 12, lineHeight: 18 },
  control: { gap: 8, paddingTop: 8 },
  label: { color: '#344054', fontSize: 13, fontWeight: '600' },
  input: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: '#c7d0d9', borderRadius: 8, color: '#17202a', backgroundColor: '#fff' },
  error: { color: '#b42318', fontSize: 14, lineHeight: 20 },
  files: { gap: 8, paddingTop: 8 },
  artifact: { gap: 4, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e4e7ec' },
  path: { color: '#344054', fontSize: 13, lineHeight: 18 },
})
