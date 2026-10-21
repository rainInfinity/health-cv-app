/** 提供用途说明、启停配置、真实服务状态和完成视频查询界面。 */

import { useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'
import type {
  PassiveCaptureArtifact,
  PassiveCaptureState,
} from '@health-cv-app/acquisition'
import {
  Alert,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  connectPassiveCaptureScreen,
  passiveCaptureClient,
  passiveCaptureSnapshot,
  refreshPassiveCaptureSnapshot,
} from '../../app/passive-capture'
import { ActionButton } from './components/ActionButton'

const STATE_LABELS: Record<PassiveCaptureState, string> = {
  disabled: '未启用',
  starting: '正在启动服务',
  waiting: '等待解锁事件',
  recording: '前摄正在录像',
  stopping: '正在收尾并关闭',
  failed: '服务未运行',
}

const REASON_LABELS: Record<string, string> = {
  WAITING_FOR_UNLOCK: '等待新的设备解锁；当前相机已释放。',
  CONFIGURATION_SAVED: '配置已保存，尚未启用。',
  SERVICE_START_REQUESTED: '正在请求启动前台服务。',
  UNLOCK_TRIGGERED: '已收到解锁机会，正在尝试打开前摄。',
  VIDEO_STARTED: 'CameraX 已确认录像开始。',
  CYCLE_NOT_ELAPSED: '本次解锁早于周期边界，未打开相机。',
  CAPTURE_BUSY: '上一段录像或收尾尚未完成，本次机会已跳过。',
  CAMERA_BUSY: '相机正被主动采集占用，本次机会已跳过。',
  VIDEO_COMPLETED: '视频已完成收尾并发布。',
  SCREEN_LOCKED: '设备重新锁屏，未完成片段已取消。',
  USER_DISABLED: '被动采集已由用户关闭。',
}

/** 呈现独立的 Android 后台解锁机会录像控制面板。 */
export function PassiveCaptureScreen() {
  const snapshot = useStore(passiveCaptureSnapshot)
  const insets = useSafeAreaInsets()
  const [artifacts, setArtifacts] = useState<PassiveCaptureArtifact[]>([])
  const [intervalInput, setIntervalInput] = useState(String(snapshot.config.intervalSeconds))
  const [durationInput, setDurationInput] = useState(String(snapshot.config.durationSeconds))
  const [localError, setLocalError] = useState<{ code: string | null; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    const unsubscribe = connectPassiveCaptureScreen()
    void refreshArtifacts()
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshPassiveCaptureSnapshot()
        void refreshArtifacts()
      }
    })
    return () => {
      mounted.current = false
      appStateSubscription.remove()
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    setIntervalInput(String(snapshot.config.intervalSeconds))
    setDurationInput(String(snapshot.config.durationSeconds))
  }, [snapshot.config.intervalSeconds, snapshot.config.durationSeconds])

  useEffect(() => {
    if (snapshot.lastReason === 'VIDEO_COMPLETED') void refreshArtifacts()
  }, [snapshot.lastReason])

  async function refreshArtifacts(): Promise<void> {
    try {
      const result = await passiveCaptureClient.listArtifacts()
      if (mounted.current) setArtifacts(result)
    } catch (error) {
      if (mounted.current) setLocalError(readFailure(error))
    }
  }

  async function runCommand(command: () => Promise<void>): Promise<void> {
    setBusy(true)
    setLocalError(null)
    try {
      await command()
      if (mounted.current) refreshPassiveCaptureSnapshot()
      await refreshArtifacts()
    } catch (error) {
      if (mounted.current) setLocalError(readFailure(error))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  /** 仅在用户明确启用被动采集时引导厂商后台活动设置。 */
  function showBackgroundSettingsGuidance(): void {
    Alert.alert(
      '确认后台运行设置',
      '部分厂商系统会限制应用在后台运行。荣耀设备请到“设置 > 应用 > 本应用 > 耗电详情 > 启动管理”，关闭“自动管理”并打开“允许后台活动”；无需开放“允许自启动”或“允许关联启动”。此项是厂商设置，不是 Android 运行时权限，应用无法自动检查或授予。打开设置并完成操作后，请返回应用再次点击启用，并选择“已设置／不适用，继续”；此设备没有该设置时可直接继续。',
      [
        { text: '取消', style: 'cancel' },
        { text: '打开应用设置', onPress: () => void Linking.openSettings() },
        {
          text: '已设置／不适用，继续',
          onPress: () => void runCommand(() => passiveCaptureClient.enable()),
        },
      ],
    )
  }

  const serviceActive = snapshot.state === 'starting'
    || snapshot.state === 'waiting'
    || snapshot.state === 'recording'
    || snapshot.state === 'stopping'
  const errorCode = localError?.code ?? snapshot.errorCode
  const errorMessage = localError?.message ?? snapshot.errorMessage
  const canOpenSettings = errorCode != null && (
    errorCode.includes('PERMISSION')
    || errorCode.includes('NOTIFICATION')
    || errorCode.includes('CAMERA')
  )
  const topPadding = Math.max(insets.top, 12)

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: topPadding }]}>
        <Text style={styles.title}>Android 无扰式被动采集</Text>
        <Text style={styles.description}>
          仅在你明确启用并完成相机、通知授权后，后台服务才等待新的设备解锁。周期满足时直接录制完整前摄画面；不显示预览、不录音、不做人脸筛选或 PPG 计算。
        </Text>
        <Text style={styles.disclaimer}>
          视频保存在应用私有目录，不会自动上传或清理。等待时相机关闭；关闭服务会取消未完成片段。系统通知和相机隐私指示仍由 Android 管理。
        </Text>

        <View style={styles.statusCard}>
          <Text style={styles.sectionTitle}>真实运行状态</Text>
          <Text accessibilityRole="text" style={serviceActive ? styles.activeState : styles.state}>
            {STATE_LABELS[snapshot.state]}
          </Text>
          <Text style={styles.detail}>
            相机：{snapshot.state === 'recording' ? '正在录像' : '等待／未运行时关闭'}
          </Text>
          {snapshot.sessionId != null && <Text style={styles.detail}>会话：{snapshot.sessionId}</Text>}
          {snapshot.lastReason != null && (
            <Text style={styles.detail}>
              最近事件：{REASON_LABELS[snapshot.lastReason] ?? snapshot.lastReason}
            </Text>
          )}
          {errorMessage != null && <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text>}
          {canOpenSettings && (
            <ActionButton
              label="打开应用权限与通知设置"
              disabled={busy}
              secondary
              onPress={() => void Linking.openSettings()}
            />
          )}
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.sectionTitle}>周期与录像时长</Text>
          <Text style={styles.detail}>首次启用后的第一个新解锁机会可采集；后续周期从实际录像开始时计时。</Text>
          <Text style={styles.inputLabel}>采集周期（秒）</Text>
          <TextInput
            accessibilityLabel="采集周期，单位秒"
            editable={!serviceActive && !busy}
            keyboardType="decimal-pad"
            onChangeText={setIntervalInput}
            value={intervalInput}
            style={styles.input}
          />
          <Text style={styles.inputLabel}>单次目标录像时长（秒）</Text>
          <TextInput
            accessibilityLabel="单次目标录像时长，单位秒"
            editable={!serviceActive && !busy}
            keyboardType="decimal-pad"
            onChangeText={setDurationInput}
            value={durationInput}
            style={styles.input}
          />
          <ActionButton
            label="保存配置"
            disabled={serviceActive || busy}
            secondary
            onPress={() => void runCommand(async () => {
              const config = {
                intervalSeconds: Number(intervalInput),
                durationSeconds: Number(durationInput),
              }
              await passiveCaptureClient.setConfig(config)
            })}
          />
        </View>

        <View style={styles.actions}>
          {!serviceActive ? (
            <ActionButton
              label="授权并启用无扰采集"
              disabled={busy}
              onPress={showBackgroundSettingsGuidance}
            />
          ) : (
            <ActionButton
              label="关闭无扰采集"
              disabled={busy}
              secondary
              onPress={() => void runCommand(() => passiveCaptureClient.disable())}
            />
          )}
          {(busy || snapshot.state === 'starting' || snapshot.state === 'stopping') && (
            <Text style={styles.detail}>正在等待原生服务和相机会话完成操作…</Text>
          )}
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.sectionTitle}>已完成视频</Text>
          {artifacts.length === 0 ? (
            <Text style={styles.detail}>尚无正常完成的视频。取消或失败的临时片段不会出现在此列表。</Text>
          ) : artifacts.map((artifact) => (
            <View key={artifact.sessionId} style={styles.file}>
              <Text style={styles.detail}>会话：{artifact.sessionId}</Text>
              <Text selectable style={styles.filePath}>{artifact.path}</Text>
              <Text style={styles.detail}>
                {artifact.width} × {artifact.height}；{artifact.durationMillis} ms；{artifact.sizeBytes} bytes
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

/** 从原生低频原因代码中提取可展示错误。 */
function readFailure(error: unknown): { code: string | null; message: string } {
  if (error instanceof Error) {
    const candidate = error as Error & { code?: unknown }
    return {
      code: typeof candidate.code === 'string' ? candidate.code : null,
      message: candidate.message,
    }
  }
  return { code: null, message: '被动采集操作失败。' }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8fa' },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 16 },
  title: { color: '#17202a', fontSize: 24, fontWeight: '700' },
  description: { color: '#344054', fontSize: 15, lineHeight: 22 },
  disclaimer: { color: '#667085', fontSize: 13, lineHeight: 20 },
  statusCard: { padding: 16, borderRadius: 12, backgroundColor: '#fff', gap: 9 },
  sectionTitle: { color: '#263238', fontSize: 17, fontWeight: '600' },
  state: { color: '#52606d', fontSize: 16, fontWeight: '600' },
  activeState: { color: '#166534', fontSize: 16, fontWeight: '600' },
  detail: { color: '#52606d', fontSize: 14, lineHeight: 20 },
  error: { color: '#b42318', fontSize: 14, lineHeight: 20 },
  inputLabel: { color: '#344054', fontSize: 14, fontWeight: '500' },
  input: { minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderColor: '#c7d0d9', borderRadius: 8, color: '#17202a' },
  actions: { gap: 10 },
  file: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e4e7ec', paddingTop: 10, gap: 4 },
  filePath: { color: '#344054', fontSize: 13, lineHeight: 18 },
})
