/** 提供手动打开相机、采集、正常停止和完成文件查询界面。 */

import { useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'
import { CameraPreview } from '@health-cv-app/acquisition/react'
import type { AcquisitionArtifact, AcquisitionState } from '@health-cv-app/acquisition'
import {
  acquisitionClient,
  acquisitionSnapshot,
  closeAcquisitionScreen,
  connectAcquisitionScreen,
  preserveAcquisitionCleanupError,
} from '../../app/acquisition'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'

const STATE_LABELS: Record<AcquisitionState, string> = {
  closed: '已关闭',
  opening: '正在打开相机',
  preview: '预览中',
  capturing: '正在采集',
  stopping: '正在完成文件',
  closing: '正在关闭相机',
  failed: '操作失败',
}

/** 呈现与云端环境无关的 Android 原生采集验证入口。 */
export function AcquisitionScreen() {
  const snapshot = useStore(acquisitionSnapshot)
  const [artifacts, setArtifacts] = useState<AcquisitionArtifact[]>([])
  const [localError, setLocalError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    const unsubscribe = connectAcquisitionScreen()

    void acquisitionClient.listArtifacts()
      .then((files) => {
        if (mounted.current) setArtifacts(files)
      })
      .catch((error: unknown) => {
        if (mounted.current) setLocalError(readErrorMessage(error))
      })

    return () => {
      mounted.current = false
      void closeAcquisitionScreen(unsubscribe).catch(preserveAcquisitionCleanupError)
    }
  }, [])

  async function runCommand(command: () => Promise<void>): Promise<void> {
    setBusy(true)
    setLocalError(null)
    try {
      await command()
      if (mounted.current) {
        const files = await acquisitionClient.listArtifacts()
        setArtifacts(files)
      }
    } catch (error) {
      if (mounted.current) setLocalError(readErrorMessage(error))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const isPreviewVisible = snapshot.state === 'preview'
    || snapshot.state === 'capturing'
    || snapshot.state === 'stopping'

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Android PPG 采集验证</Text>
        <Text style={styles.description}>
          手动打开后置相机并保存原生 PPG 记录。预览不会自动保存；采集与云端登录、服务配置无关。
        </Text>

        <View style={styles.statusCard}>
          <Text style={styles.sectionTitle}>运行状态</Text>
          <Text accessibilityRole="text" style={styles.state}>
            {STATE_LABELS[snapshot.state]}
          </Text>
          {snapshot.sessionId != null && (
            <Text style={styles.detail}>会话：{snapshot.sessionId}</Text>
          )}
          {snapshot.cameraWidth > 0 && snapshot.cameraHeight > 0 && (
            <Text style={styles.detail}>
              实际帧尺寸：{snapshot.cameraWidth} × {snapshot.cameraHeight}
              {snapshot.framesPerSecond > 0 ? `；观测帧率：${snapshot.framesPerSecond}` : ''}
            </Text>
          )}
          <Text style={styles.detail}>
            补光灯：{snapshot.torchAvailable ? '设备支持' : '设备不支持或尚未确认'}
          </Text>
          {(localError ?? snapshot.errorMessage) != null && (
            <Text accessibilityRole="alert" style={styles.error}>
              {localError ?? snapshot.errorMessage}
            </Text>
          )}
        </View>

        <View style={styles.previewFrame}>
          <CameraPreview style={styles.preview} />
          {!isPreviewVisible && (
            <View pointerEvents="none" style={styles.previewPlaceholder}>
              <Text style={styles.detail}>相机未打开</Text>
            </View>
          )}
        </View>

        <View style={styles.actions}>
          {snapshot.state === 'closed' && (
            <ActionButton
              label="打开后置相机"
              disabled={busy}
              onPress={() => void runCommand(() => acquisitionClient.openCamera())}
            />
          )}
          {snapshot.state === 'preview' && (
            <ActionButton
              label="开始采集"
              disabled={busy}
              onPress={() => void runCommand(() => acquisitionClient.startCapture())}
            />
          )}
          {snapshot.state === 'capturing' && (
            <ActionButton
              label="停止并保存"
              disabled={busy}
              onPress={() => void runCommand(() => acquisitionClient.stopCapture().then(() => undefined))}
            />
          )}
          {(snapshot.state === 'preview' || snapshot.state === 'capturing' || snapshot.state === 'failed') && (
            <ActionButton
              label="关闭相机"
              disabled={busy}
              secondary
              onPress={() => void runCommand(() => acquisitionClient.closeCamera())}
            />
          )}
          {(busy || snapshot.state === 'opening' || snapshot.state === 'stopping' || snapshot.state === 'closing') && (
            <Text style={styles.detail}>正在等待原生操作完成…</Text>
          )}
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.sectionTitle}>经验性操作提示</Text>
          <Text style={styles.detail}>
            光线提示：{formatHint(snapshot.showSurroundingTip)}
          </Text>
          <Text style={styles.detail}>
            遮挡提示：{formatHint(snapshot.showCoveringTip)}
          </Text>
          <Text style={styles.disclaimer}>
            提示仅供调试，不表示覆盖面积、信号质量通过或医学有效性，也不会阻止采集。
          </Text>
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.sectionTitle}>已完成文件</Text>
          {artifacts.length === 0 ? (
            <Text style={styles.detail}>尚无完成的采集文件。</Text>
          ) : artifacts.map((artifact) => (
            <View key={artifact.sessionId} style={styles.file}>
              <Text style={styles.detail}>会话：{artifact.sessionId}</Text>
              {artifact.files.map((file) => (
                <View key={file.kind} style={styles.artifactFile}>
                  <Text style={styles.detail}>{file.kind === 'ppg' ? 'PPG CSV' : '相机元数据 CSV'}</Text>
                  <Text selectable style={styles.filePath}>{file.path}</Text>
                  <Text style={styles.detail}>大小：{file.sizeBytes} bytes</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

/** 显示可空的最新提示，不推断未评估状态。 */
function formatHint(value: boolean | null): string {
  if (value == null) return '未评估'
  return value ? '已触发' : '未触发'
}

/** 从未知错误中提取可展示文本。 */
function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '采集操作失败。'
}

interface ActionButtonProps {
  /** 按钮上展示的操作名称。 */
  label: string
  /** 当前命令进行中时禁用操作。 */
  disabled: boolean
  /** 是否采用次要按钮样式。 */
  secondary?: boolean
  /** 用户手动触发的异步命令入口。 */
  onPress: () => void
}

/** 呈现采集页面内统一样式的命令按钮。 */
function ActionButton({ label, disabled, secondary = false, onPress }: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressedButton,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8fa' },
  content: { padding: 20, gap: 16 },
  title: { color: '#17202a', fontSize: 24, fontWeight: '700' },
  description: { color: '#52606d', fontSize: 15, lineHeight: 22 },
  statusCard: { padding: 16, borderRadius: 12, backgroundColor: '#fff', gap: 8 },
  sectionTitle: { color: '#263238', fontSize: 17, fontWeight: '600' },
  state: { color: '#166534', fontSize: 16, fontWeight: '600' },
  detail: { color: '#52606d', fontSize: 14, lineHeight: 20 },
  error: { color: '#b42318', fontSize: 14, lineHeight: 20 },
  previewFrame: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: '#e7ebef' },
  preview: { ...StyleSheet.absoluteFill },
  previewPlaceholder: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e7ebef' },
  actions: { gap: 10 },
  button: { minHeight: 48, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#155eef' },
  secondaryButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#c7d0d9' },
  disabledButton: { opacity: 0.5 },
  pressedButton: { opacity: 0.8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButtonText: { color: '#344054' },
  disclaimer: { color: '#667085', fontSize: 12, lineHeight: 18 },
  file: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e4e7ec', paddingTop: 10, gap: 4 },
  artifactFile: { paddingTop: 8, gap: 4 },
  filePath: { color: '#344054', fontSize: 13, lineHeight: 18 },
})
