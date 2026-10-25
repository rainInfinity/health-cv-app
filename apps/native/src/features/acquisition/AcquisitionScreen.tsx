/** 提供手动打开相机、采集、正常停止和完成文件查询界面。 */

import { useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'
import { CameraPreview } from '@health-cv-app/acquisition/react'
import type {
  AcquisitionArtifact,
  AcquisitionState,
  CameraConfig,
  CameraConfigSummary,
} from '@health-cv-app/acquisition'
import {
  acquisitionCameraQuery,
  acquisitionClient,
  acquisitionSnapshot,
  closeAcquisitionScreen,
  connectAcquisitionScreen,
  preserveAcquisitionCleanupError,
} from '../../app/acquisition'
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { ActionButton } from './components/ActionButton'
import { CameraQueryPanel } from './CameraQueryPanel'
import { CameraConfigurationEditor } from './CameraConfigurationEditor'

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
  const cameraQuery = useStore(acquisitionCameraQuery)
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
    let commandFailed = false
    try {
      await command()
    } catch (error) {
      commandFailed = true
      if (mounted.current) setLocalError(readErrorMessage(error))
    } finally {
      if (mounted.current) {
        try {
          const files = await acquisitionClient.listArtifacts()
          if (mounted.current) setArtifacts(files)
        } catch (error) {
          if (mounted.current && !commandFailed) setLocalError(readErrorMessage(error))
        } finally {
          if (mounted.current) setBusy(false)
        }
      }
    }
  }

  const isPreviewVisible = snapshot.state === 'preview'
    || snapshot.state === 'capturing'
    || snapshot.state === 'stopping'

  const selectedConfig = cameraQuery.draftConfig
  const captureRequest = cameraQuery.captureOptionsRequest
  const queriedCandidate = selectedConfig == null
    ? undefined
    : cameraQuery.captureOptions?.options.find((option) =>
        option.resolution.width === selectedConfig.targetResolution.width
        && option.resolution.height === selectedConfig.targetResolution.height,
      )
  const queryMatchesDraft = selectedConfig != null
    && captureRequest != null
    && queriedCandidate?.compatibility === 'supported'
    && (captureRequest.targetResolution == null
      || (captureRequest.targetResolution.width === selectedConfig.targetResolution.width
        && captureRequest.targetResolution.height === selectedConfig.targetResolution.height))
    && (captureRequest.targetFps == null || captureRequest.targetFps === selectedConfig.targetFps)
  const canOpenCamera = snapshot.state === 'closed'
    && !busy
    && cameraQuery.permissionGranted
    && !cameraQuery.isLoading
    && queryMatchesDraft

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Android PPG 采集验证</Text>
        <Text style={styles.description}>
          显式授权后可枚举相机并查询启动前能力；打开相机和正式采集均需用户单独操作，采集与云端登录、服务配置无关。
        </Text>

        <CameraQueryPanel controlsDisabled={snapshot.state !== 'closed' || busy} />
        <CameraConfigurationEditor disabled={snapshot.state !== 'closed' || busy} />
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
          {snapshot.cameraConfig != null && (
            <CameraConfigSummaryView
              title="本周期冻结配置"
              summary={snapshot.cameraConfig}
            />
          )}
          <Text style={styles.detail}>
            锁定阶段：{snapshot.cameraLockStatus.phase}；AE：{formatLockValue(snapshot.cameraLockStatus.aeLocked)}；
            AWB：{formatLockValue(snapshot.cameraLockStatus.awbLocked)}
          </Text>
          {snapshot.cameraLockStatus.errorCode != null && (
            <Text accessibilityRole="alert" style={styles.error}>
              锁定错误码：{snapshot.cameraLockStatus.errorCode}
            </Text>
          )}
          {snapshot.errorCode != null && (
            <Text accessibilityRole="alert" style={styles.error}>
              错误码：{snapshot.errorCode}
            </Text>
          )}
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
              label={
                !cameraQuery.permissionGranted
                  ? '先显式授权相机权限'
                  : !queryMatchesDraft
                    ? '先查询所选相机和当前尺寸组合'
                    : '打开已选相机配置'
              }
              disabled={!canOpenCamera}
              onPress={() => {
                if (selectedConfig != null) {
                  void runCommand(() => acquisitionClient.openCamera(selectedConfig))
                }
              }}
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
              {artifact.cameraConfigSummary != null ? (
                <CameraConfigSummaryView
                  title="完成产物配置与布局"
                  summary={artifact.cameraConfigSummary}
                />
              ) : (
                <Text style={styles.detail}>该产物未记录配置摘要。</Text>
              )}
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

/** 从未知错误中提取可展示文本，避免把原生堆栈当成用户错误信息。 */
function readErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return '采集操作失败。'
  const firstLine = error.message.split('\n', 1)[0]?.trim() ?? ''
  const separator = firstLine.indexOf(': ')
  const message = separator >= 0 ? firstLine.slice(separator + 2) : firstLine
  return message || '采集操作失败。'
}
/** 将可空 AE／AWB 状态转换为明确的界面语义。 */
function formatLockValue(value: boolean | null): string {
  if (value == null) return '未知'
  return value ? '已锁定' : '未锁定'
}

/** 用设备单位展示请求配置或原生提交配置。 */
function formatCameraConfig(label: string, config: CameraConfig): string[] {
  const exposure = config.exposure
  const frame = config.targetResolution
  return [
    `${label}尺寸：${frame.width} × ${frame.height} px；目标 FPS：${config.targetFps}`,
    `${label}曝光：${exposure.mode}；曝光时间：${exposure.timeNanos == null ? '不适用' : `${exposure.timeNanos} ns`}；ISO：${exposure.iso ?? '不适用'}；补偿索引：${exposure.compensationIndex ?? '不适用'}（设备 EV 步长）；请求 AE 锁：${exposure.locked ? '是' : '否'}`,
    `${label}白平衡：${config.whiteBalance.mode}；请求 AWB 锁：${config.whiteBalance.locked ? '是' : '否'}`,
    `${label}对焦：${config.focus.mode}；手动距离：${config.focus.distanceDiopters == null ? '不适用' : `${config.focus.distanceDiopters} 屈光度`}`,
    `${label}补光灯：${config.torchEnabled ? '开启' : '关闭'}；分块：[${config.processing.blocks.join(', ')}]`,
  ]
}

/** 展示请求、提交、调整原因、实际帧几何及完成布局。 */
function CameraConfigSummaryView({
  title,
  summary,
}: {
  title: string
  summary: CameraConfigSummary
}) {
  const actualFrame = summary.actualFrame
  const details = [
    ...formatCameraConfig('请求', summary.requestedConfig),
    ...formatCameraConfig('提交', summary.submittedConfig),
    ...(summary.adjustments.length === 0
      ? ['尺寸／帧率调整：无']
      : summary.adjustments.map((adjustment) =>
          `调整 ${adjustment.field}：${adjustment.requestedValue} → ${adjustment.submittedValue}；${adjustment.reason}`,
        )),
    `实际布局：[${summary.blockLayout.rows}, ${summary.blockLayout.columns}]`,
    actualFrame == null
      ? '实际帧几何：尚未收到'
      : `实际帧：${actualFrame.width} × ${actualFrame.height} px；有效 crop (${actualFrame.crop.left}, ${actualFrame.crop.top}) ${actualFrame.crop.width} × ${actualFrame.crop.height} px；观测 FPS：${summary.observedFps ?? '尚未测得'}`,
  ]

  return (
    <View style={styles.configSummary}>
      <Text style={styles.sectionTitle}>{title}（相机 {summary.cameraId}）</Text>
      {details.map((detail, index) => (
        <Text key={`${title}-${index}`} style={styles.detail}>{detail}</Text>
      ))}
    </View>
  )
}



const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8fa' },
  content: { padding: 20, gap: 16 },
  title: { color: '#17202a', fontSize: 24, fontWeight: '700' },
  description: { color: '#52606d', fontSize: 15, lineHeight: 22 },
  statusCard: { padding: 16, borderRadius: 12, backgroundColor: '#fff', gap: 8 },
  configSummary: { gap: 6, paddingTop: 8 },
  sectionTitle: { color: '#263238', fontSize: 17, fontWeight: '600' },
  state: { color: '#166534', fontSize: 16, fontWeight: '600' },
  detail: { color: '#52606d', fontSize: 14, lineHeight: 20 },
  error: { color: '#b42318', fontSize: 14, lineHeight: 20 },
  previewFrame: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: '#e7ebef' },
  preview: { ...StyleSheet.absoluteFill },
  previewPlaceholder: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e7ebef' },
  actions: { gap: 10 },
  disclaimer: { color: '#667085', fontSize: 12, lineHeight: 18 },
  file: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e4e7ec', paddingTop: 10, gap: 4 },
  artifactFile: { paddingTop: 8, gap: 4 },
  filePath: { color: '#344054', fontSize: 13, lineHeight: 18 },
})
