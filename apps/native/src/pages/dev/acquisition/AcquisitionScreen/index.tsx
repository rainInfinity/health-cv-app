/** 提供手动打开相机、采集、正常停止和完成文件查询界面。 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'
import { useFocusEffect, useNavigation, usePreventRemove } from '@react-navigation/native'
import type { NavigationAction } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { CameraPreview } from '@health-cv-app/acquisition/react'
import type {
  AcquisitionArtifact,
  AcquisitionState,
} from '@health-cv-app/acquisition'
import {
  acquisitionCameraQuery,
  acquisitionClient,
  acquisitionSnapshot,
  closeAcquisitionScreen,
  connectAcquisitionScreen,
  preserveAcquisitionCleanupError,
} from '@/app/acquisition'
import { createAcquisitionLeaveGuard } from '@/app/navigation/acquisitionLeaveGuard'
import { registerAcquisitionLeaveRequest } from '@/app/navigation/acquisitionNavigationGuard'
import type { DevStackParamList } from '@/app/navigation/types'
import { ActionButton } from '@/shared/components/ActionButton'
import { AppCard } from '@/shared/components/AppCard'
import { AppText } from '@/shared/components/AppText'
import { PageContainer } from '@/shared/components/PageContainer'
import { MAX_DISPLAYED_ARTIFACTS } from '@/shared/artifactDisplayLimit'
import { StatusFeedback } from '@/shared/components/StatusFeedback'
import { CameraConfigSummaryView } from '@/pages/dev/acquisition/CameraConfigSummaryView'
import { CameraQueryPanel } from '@/pages/dev/acquisition/CameraQueryPanel'
import { CameraConfigurationEditor } from '@/pages/dev/acquisition/CameraConfigurationEditor'
import {
  acquisitionMessages,
  localizeAcquisitionError,
} from '@/pages/dev/acquisition/acquisitionMessages'
import type { AcquisitionMessageValues } from '@/pages/dev/acquisition/acquisitionMessages'

import {
  ActionGroup,
  ArtifactFile,
  cameraPreviewStyle,
  FileGroup,
  PreviewFrame,
  PreviewPlaceholder,
} from './styles'

const STATE_MESSAGE_KEYS: Record<AcquisitionState, keyof AcquisitionMessageValues> = {
  closed: 'stateClosed',
  opening: 'stateOpening',
  preview: 'statePreview',
  capturing: 'stateCapturing',
  stopping: 'stateStopping',
  closing: 'stateClosing',
  failed: 'stateFailed',
}

type CameraCommandKind = 'open' | 'start' | 'stop' | 'close'

/** 表示一条已完成的主动相机操作及其失败原因。 */
interface CameraCommandOutcome {
  /** 原生命令是否成功。 */
  succeeded: boolean
  /** 命令失败时保留的原始错误。 */
  error?: unknown
}

/** 当前等待完成的主动相机命令。 */
interface PendingCameraCommand {
  /** 操作种类；失败的关闭不得自动重试。 */
  kind: CameraCommandKind
  /** 命令及其 UI 收尾结果。 */
  promise: Promise<CameraCommandOutcome>
}

/** 呈现与云端环境无关的 Android 原生采集验证入口。 */
export function AcquisitionScreen() {
  const messages = useStore(acquisitionMessages)
  const navigation = useNavigation<NativeStackNavigationProp<DevStackParamList>>()
  const snapshot = useStore(acquisitionSnapshot)
  const cameraQuery = useStore(acquisitionCameraQuery)
  const [artifacts, setArtifacts] = useState<AcquisitionArtifact[]>([])
  const visibleArtifacts = useMemo(
    () => artifacts.slice(-MAX_DISPLAYED_ARTIFACTS),
    [artifacts],
  )
  const [localError, setLocalError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [allowRemoval, setAllowRemoval] = useState(false)
  const [cameraCommandPending, setCameraCommandPending] = useState(false)
  const mounted = useRef(false)
  const pendingNavigationAction = useRef<NavigationAction | null>(null)
  const pendingCameraCommand = useRef<PendingCameraCommand | null>(null)
  const cameraSessionGeneration = useRef(0)
  const leaveGuard = useMemo(() => createAcquisitionLeaveGuard<NavigationAction | (() => void)>({
    waitForCameraCommand: async () => {
      const pending = pendingCameraCommand.current
      if (pending == null) return
      const outcome = await pending.promise
      if (pending.kind === 'close' && !outcome.succeeded) throw outcome.error
    },
    getSessionGeneration: () => cameraSessionGeneration.current,
    isCameraActive: () => {
      const current = acquisitionClient.getSnapshot()
      return current.state !== 'closed' || current.sessionId != null
    },
    closeCamera: () => acquisitionClient.closeCamera(),
    onReady: (action) => {
      if (typeof action === 'function') {
        action()
        return
      }
      pendingNavigationAction.current = action
      setAllowRemoval(true)
    },
    onFailure: (error) => {
      if (mounted.current) setLocalError(readErrorCode(error))
    },
  }), [])
  const shouldPreventRemove = !allowRemoval && (
    cameraCommandPending
    || snapshot.state !== 'closed'
    || snapshot.sessionId != null
  )

  usePreventRemove(shouldPreventRemove, ({ data }) => {
    setLocalError(null)
    void leaveGuard.request(data.action)
  })
  useFocusEffect(
    useCallback(() => {
      let active = true
      const unregisterLeaveRequest = registerAcquisitionLeaveRequest((continueNavigation) => {
        setLocalError(null)
        void leaveGuard.request(continueNavigation)
      })
      void acquisitionClient.listArtifacts()
        .then((files) => {
          if (active) setArtifacts(files)
        })
        .catch((error: unknown) => {
          if (active) setLocalError(readErrorCode(error))
        })
      return () => {
        active = false
        unregisterLeaveRequest()
      }
    }, [leaveGuard]),
  )

  useEffect(() => {
    mounted.current = true
    const unsubscribe = connectAcquisitionScreen()

    return () => {
      mounted.current = false
      pendingNavigationAction.current = null
      leaveGuard.dispose()
      void closeAcquisitionScreen(unsubscribe).catch(preserveAcquisitionCleanupError)
    }
  }, [leaveGuard])

  useEffect(() => {
    if (!allowRemoval) return
    const action = pendingNavigationAction.current
    pendingNavigationAction.current = null
    setAllowRemoval(false)
    if (action != null) navigation.dispatch(action)
  }, [allowRemoval, navigation])

  async function runCommand(command: () => Promise<void>): Promise<CameraCommandOutcome> {
    setBusy(true)
    setLocalError(null)
    let outcome: CameraCommandOutcome = { succeeded: true }
    try {
      await command()
    } catch (error) {
      outcome = { succeeded: false, error }
      if (mounted.current) setLocalError(readErrorCode(error))
    } finally {
      if (mounted.current) {
        try {
          const files = await acquisitionClient.listArtifacts()
          if (mounted.current) setArtifacts(files)
        } catch (error) {
          if (mounted.current && outcome.succeeded) setLocalError(readErrorCode(error))
        } finally {
          if (mounted.current) setBusy(false)
        }
      }
    }
    return outcome
  }

  async function runCameraCommand(
    kind: CameraCommandKind,
    command: () => Promise<void>,
  ): Promise<void> {
    if (pendingCameraCommand.current != null) return
    if (kind === 'open') cameraSessionGeneration.current += 1
    setCameraCommandPending(true)
    const pending: PendingCameraCommand = { kind, promise: runCommand(command) }
    pendingCameraCommand.current = pending
    try {
      await pending.promise
    } finally {
      if (pendingCameraCommand.current === pending) pendingCameraCommand.current = null
      if (mounted.current) setCameraCommandPending(false)
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

  const visibleErrorCode = localError
    ?? snapshot.errorCode
    ?? (snapshot.errorMessage == null ? null : 'UNKNOWN')
  return (
    <PageContainer edges={['left', 'right']}>
      <AppText variant="title">{messages.screenTitle}</AppText>
      <AppText tone="secondary">{messages.screenDescription}</AppText>

      <CameraQueryPanel controlsDisabled={snapshot.state !== 'closed' || busy} />
      <CameraConfigurationEditor disabled={snapshot.state !== 'closed' || busy} />
      <AppCard>
        <AppText variant="section">{messages.statusTitle}</AppText>
        <StatusFeedback
          tone={busy || snapshot.state === 'opening' || snapshot.state === 'stopping' || snapshot.state === 'closing'
            ? 'pending'
            : 'info'}
          title={messages[STATE_MESSAGE_KEYS[snapshot.state]]}
        />
        {snapshot.sessionId != null && (
          <AppText tone="secondary">{messages.session}：{snapshot.sessionId}</AppText>
        )}
        {snapshot.cameraWidth > 0 && snapshot.cameraHeight > 0 && (
          <AppText tone="secondary">
            {messages.actualFrameSize}：{snapshot.cameraWidth} × {snapshot.cameraHeight}
            {snapshot.framesPerSecond > 0 ? `；${messages.observedFrameRate}：${snapshot.framesPerSecond}` : ''}
          </AppText>
        )}
        <AppText tone="secondary">
          {messages.torchAvailable}：{snapshot.torchAvailable ? messages.torchSupported : messages.torchUnavailable}
        </AppText>
        {snapshot.cameraConfig != null && (
          <CameraConfigSummaryView
            title={messages.frozenConfig}
            summary={snapshot.cameraConfig}
          />
        )}
        <AppText tone="secondary">
          {messages.lockPhase}：{formatLockPhase(snapshot.cameraLockStatus.phase, messages)}；{messages.ae}：{formatLockValue(snapshot.cameraLockStatus.aeLocked, messages)}；
          {messages.awb}：{formatLockValue(snapshot.cameraLockStatus.awbLocked, messages)}
        </AppText>
        {snapshot.cameraLockStatus.errorCode != null && (
          <AppText accessibilityRole="alert" tone="error" variant="caption">
            {messages.lockErrorCode}：{snapshot.cameraLockStatus.errorCode}
          </AppText>
        )}
        {visibleErrorCode != null && (
          <AppText accessibilityRole="alert" tone="error" variant="caption">
            {messages.errorCode}：{visibleErrorCode}
          </AppText>
        )}
        {visibleErrorCode != null && (
          <StatusFeedback
            tone="error"
            title={messages.captureErrorTitle}
            message={localizeAcquisitionError(visibleErrorCode, messages)}
          />
        )}
      </AppCard>

      <PreviewFrame>
        <CameraPreview style={cameraPreviewStyle} />
        {!isPreviewVisible && (
          <PreviewPlaceholder pointerEvents="none">
            <AppText tone="secondary">{messages.cameraNotOpen}</AppText>
          </PreviewPlaceholder>
        )}
      </PreviewFrame>

      <ActionGroup>
        {snapshot.state === 'closed' && (
          <ActionButton
            label={
              !cameraQuery.permissionGranted
                ? messages.requestPermissionFirst
                : !queryMatchesDraft
                  ? messages.queryBeforeOpen
                  : messages.openCamera
            }
            loading={busy}
            disabled={!canOpenCamera}
            onPress={() => {
              if (selectedConfig != null) {
                void runCameraCommand('open', () => acquisitionClient.openCamera(selectedConfig))
              }
            }}
          />
        )}
        {snapshot.state === 'preview' && (
          <ActionButton
            label={messages.startCapture}
            loading={busy}
            disabled={busy}
            onPress={() => void runCameraCommand('start', () => acquisitionClient.startCapture())}
          />
        )}
        {snapshot.state === 'capturing' && (
          <ActionButton
            label={messages.stopAndSave}
            loading={busy}
            disabled={busy}
            onPress={() => void runCameraCommand('stop', () => acquisitionClient.stopCapture().then(() => undefined))}
          />
        )}
        {(snapshot.state === 'preview' || snapshot.state === 'capturing' || snapshot.state === 'failed') && (
          <ActionButton
            label={messages.closeCamera}
            loading={busy}
            disabled={busy}
            secondary
            onPress={() => void runCameraCommand('close', () => acquisitionClient.closeCamera())}
          />
        )}
        {(busy || snapshot.state === 'opening' || snapshot.state === 'stopping' || snapshot.state === 'closing') && (
          <StatusFeedback tone="pending" title={messages.waitingForNative} />
        )}
      </ActionGroup>

      <AppCard>
        <AppText variant="section">{messages.hintsTitle}</AppText>
        <AppText tone="secondary">{messages.lightingHint}：{formatHint(snapshot.showSurroundingTip, messages)}</AppText>
        <AppText tone="secondary">{messages.coveringHint}：{formatHint(snapshot.showCoveringTip, messages)}</AppText>
        <AppText tone="muted" variant="caption">{messages.hintsDisclaimer}</AppText>
      </AppCard>

      <AppCard>
        <AppText variant="section">{messages.completedFiles}</AppText>
        <AppText tone="muted" variant="caption">{messages.artifactQueryScope}</AppText>
        {artifacts.length > visibleArtifacts.length && (
          <AppText tone="muted" variant="caption">{messages.artifactLimitNote}</AppText>
        )}
        {artifacts.length === 0 ? (
          <StatusFeedback tone="info" title={messages.noCompletedFiles} />
        ) : visibleArtifacts.map((artifact) => (
          <FileGroup key={artifact.sessionId}>
            <AppText tone="secondary">{messages.session}：{artifact.sessionId}</AppText>
            {artifact.cameraConfigSummary != null ? (
              <CameraConfigSummaryView
                title={messages.completedConfig}
                summary={artifact.cameraConfigSummary}
              />
            ) : (
              <AppText tone="secondary">{messages.artifactHasNoConfig}</AppText>
            )}
            {artifact.files.map((file) => (
              <ArtifactFile key={file.kind}>
                <AppText tone="secondary" variant="caption">
                  {file.kind === 'ppg' ? messages.ppgCsv : messages.cameraMetadataCsv}
                </AppText>
                <AppText selectable variant="caption">{file.path}</AppText>
                <AppText tone="secondary" variant="caption">{messages.size}：{file.sizeBytes} bytes</AppText>
              </ArtifactFile>
            ))}
          </FileGroup>
        ))}
      </AppCard>
    </PageContainer>
  )
}

/** 显示可空的最新提示，不推断未评估状态。 */
function formatHint(value: boolean | null, messages: AcquisitionMessageValues): string {
  if (value == null) return messages.hintNotEvaluated
  return value ? messages.hintTriggered : messages.hintNotTriggered
}

/** 从结构化错误中提取稳定代码；没有代码时只保留安全未知分类。 */
function readErrorCode(error: unknown): string {
  if (error != null && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code
  }
  return 'UNKNOWN'
}

/** 将可空 AE／AWB 状态转换为明确的界面语义。 */
function formatLockValue(value: boolean | null, messages: AcquisitionMessageValues): string {
  if (value == null) return messages.capabilityUnknown
  return value ? messages.lockLocked : messages.notLocked
}

/** 将原生自动算法锁定阶段映射为当前语言的状态文案。 */
function formatLockPhase(phase: string, messages: AcquisitionMessageValues): string {
  const labels: Record<string, string> = {
    'not-requested': messages.lockNotRequested,
    applying: messages.lockApplying,
    locked: messages.lockLocked,
    released: messages.lockReleased,
    failed: messages.lockFailed,
  }
  return labels[phase] ?? messages.capabilityUnknown
}
