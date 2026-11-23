/** 提供显式授权、预览、主动 RPPG 测量和本地产物查询界面。 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFocusEffect, useIsFocused, useNavigation, usePreventRemove } from '@react-navigation/native'
import type { NavigationAction } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Platform } from 'react-native'
import { useStore } from '@nanostores/react'
import { createRPPGClient } from '@health-cv-app/acquisition'
import type {
  RPPGArtifact,
  RPPGPhase,
  RPPGSignalStatus,
  RPPGSnapshot,
  RPPGTerminationReason,
} from '@health-cv-app/acquisition'
import { RPPGPreview } from '@health-cv-app/acquisition/react'
import { RPPGWaveform } from '@/shared/components/RPPGWaveform'
import { appendRPPGRealtimeBatch } from '@/app/rppg/rppgWaveform'
import type { RPPGWaveformSample } from '@/app/rppg/rppgWaveform'
import { ActionButton } from '@/shared/components/ActionButton'
import { AppCard } from '@/shared/components/AppCard'
import { AppText } from '@/shared/components/AppText'
import { PageContainer } from '@/shared/components/PageContainer'
import { StatusFeedback } from '@/shared/components/StatusFeedback'
import { MAX_DISPLAYED_ARTIFACTS } from '@/shared/artifactDisplayLimit'
import { localizeRPPGError, rppgMessages } from '@/pages/dev/acquisition/rppgMessages'
import { createAcquisitionLeaveGuard } from '@/app/navigation/acquisitionLeaveGuard'
import { registerRPPGLeaveRequest } from '@/app/navigation/rppgNavigationGuard'
import type { DevStackParamList } from '@/app/navigation/types'
import type { RPPGMessageValues } from '@/pages/dev/acquisition/rppgMessages'
import {
  accumulateRPPGHeartRateSnapshot,
  createEmptyRPPGHeartRateSummary,
} from '@/app/rppg/rppgHeartRateSummary'

import {
  ArtifactFile,
  ArtifactGroup,
  PreviewFrame,
  PreviewPlaceholder,
  ProgressFill,
  ProgressTrack,
  rppgPreviewStyle,
} from './styles'

const EMPTY_SNAPSHOT: RPPGSnapshot = {
  phase: 'closed',
  sessionId: null,
  faceReady: false,
  readinessReason: null,
  readinessContinuousNanos: '0',
  measurementStartedAtElapsedNanos: null,
  targetMeasurementDurationNanos: '30000000000',
  latestHeartRate: null,
  latestInstantHeartRate: null,
  signalStatus: null,
  termination: null,
  artifact: null,
  error: null,
}

const PHASE_MESSAGE_KEYS: Record<RPPGPhase, keyof RPPGMessageValues> = {
  closed: 'phaseClosed',
  opening: 'phaseOpening',
  preview: 'phasePreview',
  observing: 'phaseObserving',
  measuring: 'phaseMeasuring',
  stopping: 'phaseStopping',
  completed: 'phaseCompleted',
  failed: 'phaseFailed',
}

/** 波形展示只保留试验配置规定的最近 15 秒。 */
const MAX_WAVEFORM_DURATION_MILLIS = 15_000
/** 20 Hz 重采样率下的固定样本上限，避免页面持有完整历史。 */
const MAX_WAVEFORM_POINTS = 300

/** 呈现可离线访问、进入时不申请权限或启动相机的主动 RPPG 页面。 */
export function RPPGScreen() {
  const messages = useStore(rppgMessages)
  const navigation = useNavigation<NativeStackNavigationProp<DevStackParamList>>()
  const isFocused = useIsFocused()
  const [client, setClient] = useState(
    () => Platform.OS === 'android' ? createRPPGClient() : null,
  )
  const [snapshot, setSnapshot] = useState<RPPGSnapshot>(
    () => client?.getSnapshot() ?? EMPTY_SNAPSHOT,
  )
  const [artifacts, setArtifacts] = useState<RPPGArtifact[]>([])
  const [waveformSamples, setWaveformSamples] = useState<RPPGWaveformSample[]>([])
  const [heartRateSummary, setHeartRateSummary] = useState(createEmptyRPPGHeartRateSummary)
  const [permissionGranted, setPermissionGranted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [allowRemoval, setAllowRemoval] = useState(false)
  const [cameraCommandPending, setCameraCommandPending] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [measurementElapsedMillis, setMeasurementElapsedMillis] = useState(0)
  const mounted = useRef(false)
  const pendingNavigationAction = useRef<NavigationAction | null>(null)
  const pendingCameraCommand = useRef<Promise<void> | null>(null)
  const cameraSessionGeneration = useRef(0)
  const runtimeClosed = useRef(false)
  const visibleArtifacts = useMemo(
    () => artifacts.slice(-MAX_DISPLAYED_ARTIFACTS),
    [artifacts],
  )
  const leaveGuard = useMemo(() => createAcquisitionLeaveGuard<NavigationAction | (() => void)>({
    waitForCameraCommand: async () => {
      const pending = pendingCameraCommand.current
      if (pending != null) await pending
    },
    getSessionGeneration: () => cameraSessionGeneration.current,
    isCameraActive: () => {
      const current = client?.getSnapshot()
      return current != null && (current.phase !== 'closed' || current.sessionId != null)
    },
    closeCamera: async () => {
      if (client != null) {
        await client.close()
        runtimeClosed.current = true
      }
    },
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
  }), [client])
  const shouldPreventRemove = !allowRemoval && (
    cameraCommandPending
    || snapshot.phase !== 'closed'
    || snapshot.sessionId != null
  )

  usePreventRemove(shouldPreventRemove, ({ data }) => {
    setLocalError(null)
    void leaveGuard.request(data.action)
  })

  const refreshArtifacts = useCallback(async () => {
    if (client == null) return
    try {
      const result = await client.listArtifacts()
      if (mounted.current) setArtifacts(result)
    } catch (error) {
      if (mounted.current) setLocalError(readErrorCode(error))
    }
  }, [client])

  const updateSnapshot = useCallback((nextSnapshot: RPPGSnapshot) => {
    if (!mounted.current) return
    setSnapshot(nextSnapshot)
    setHeartRateSummary((previous) => accumulateRPPGHeartRateSnapshot(previous, nextSnapshot))
  }, [])

  useEffect(() => {
    mounted.current = true
    if (client == null) {
      setLocalError('PLATFORM_UNSUPPORTED')
      return () => {
        mounted.current = false
        leaveGuard.dispose()
      }
    }

    const unsubscribe = client.subscribe(updateSnapshot)
    const unsubscribeRealtime = client.subscribeRealtime((batch) => {
      if (mounted.current) {
        setWaveformSamples((current) => appendRPPGRealtimeBatch(current, batch, {
          durationMillis: MAX_WAVEFORM_DURATION_MILLIS,
          maxPoints: MAX_WAVEFORM_POINTS,
        }))
      }
    })
    void refreshArtifacts()
    return () => {
      mounted.current = false
      pendingNavigationAction.current = null
      leaveGuard.dispose()
      unsubscribe()
      unsubscribeRealtime()
      void client.close().catch(() => undefined)
    }
  }, [client, leaveGuard, refreshArtifacts, updateSnapshot])

  useEffect(() => {
    if (!allowRemoval) return
    const action = pendingNavigationAction.current
    pendingNavigationAction.current = null
    setAllowRemoval(false)
    if (action != null) navigation.dispatch(action)
  }, [allowRemoval, navigation])

  useFocusEffect(
    useCallback(() => {
      if (runtimeClosed.current && Platform.OS === 'android') {
        const nextClient = createRPPGClient()
        runtimeClosed.current = false
        setClient(nextClient)
        setSnapshot(nextClient.getSnapshot())
        setWaveformSamples([])
        setHeartRateSummary(createEmptyRPPGHeartRateSummary())
        setLocalError(null)
        return
      }
      let focused = true
      const unregisterLeaveRequest = registerRPPGLeaveRequest((continueNavigation) => {
        setLocalError(null)
        void leaveGuard.request(continueNavigation)
      })
      if (client != null) {
        void client.listArtifacts()
          .then((result) => {
            if (focused) setArtifacts(result)
          })
          .catch((error: unknown) => {
            if (focused) setLocalError(readErrorCode(error))
          })
      }
      return () => {
        focused = false
        unregisterLeaveRequest()
      }
    }, [client, leaveGuard]),
  )

  useEffect(() => {
    if (snapshot.phase !== 'measuring') {
      setMeasurementElapsedMillis(0)
      return
    }
    const startedAt = Date.now()
    const updateProgress = () => setMeasurementElapsedMillis(Date.now() - startedAt)
    updateProgress()
    const timer = setInterval(updateProgress, 250)
    return () => clearInterval(timer)
  }, [snapshot.measurementStartedAtElapsedNanos, snapshot.phase])

  async function runCommand(command: () => Promise<unknown>): Promise<void> {
    if (client == null || busy) return
    setBusy(true)
    setCameraCommandPending(true)
    setLocalError(null)
    const operation = (async () => {
      try {
        await command()
        if (mounted.current) updateSnapshot(client.getSnapshot())
        await refreshArtifacts()
      } catch (error) {
        if (mounted.current) setLocalError(readErrorCode(error))
      } finally {
        if (mounted.current) setBusy(false)
      }
    })()
    pendingCameraCommand.current = operation
    try {
      await operation
    } finally {
      if (pendingCameraCommand.current === operation) pendingCameraCommand.current = null
      if (mounted.current) setCameraCommandPending(false)
    }
  }


  const isPreviewVisible = snapshot.phase === 'preview'
    || snapshot.phase === 'observing'
    || snapshot.phase === 'measuring'
    || snapshot.phase === 'stopping'
  const canOpenPreview = snapshot.phase === 'closed'
    || snapshot.phase === 'completed'
    || snapshot.phase === 'failed'
  const measurementDurationMillis = Math.max(
    1,
    Number(snapshot.targetMeasurementDurationNanos) / 1_000_000,
  )
  const progress = snapshot.phase === 'completed'
    ? 1
    : snapshot.phase === 'measuring'
      ? Math.min(1, measurementElapsedMillis / measurementDurationMillis)
      : 0
  const progressPercent = Math.round(progress * 100)
  const errorCode = localError ?? snapshot.error?.code ?? null
  const latestHeartRateWindow = heartRateSummary.latestWindow
  const instantHeartRate = snapshot.phase === 'measuring' ? snapshot.latestInstantHeartRate : null
  const averageHeartRateBpm = heartRateSummary.validWindowCount > 0
    ? heartRateSummary.validHeartRateSum / heartRateSummary.validWindowCount
    : null
  const statusTone = snapshot.phase === 'failed'
    ? 'error'
    : snapshot.phase === 'completed'
      ? 'success'
      : snapshot.phase === 'opening' || snapshot.phase === 'stopping' || busy
        ? 'pending'
        : 'info'

  return (
    <PageContainer edges={['left', 'right']}>
      <AppText variant="title">{messages.screenTitle}</AppText>
      <AppText tone="secondary">{messages.screenDescription}</AppText>
      <AppText tone="muted" variant="caption">{messages.privacyNotice}</AppText>

      <AppCard>
        <AppText variant="section">{messages.statusTitle}</AppText>
        <StatusFeedback
          tone={statusTone}
          title={messages[PHASE_MESSAGE_KEYS[snapshot.phase]]}
        />
        <AppText tone="secondary">
          {messages.permissionStatus}：{permissionGranted ? messages.permissionConfirmed : messages.permissionNotConfirmed}
        </AppText>
        {snapshot.sessionId != null && (
          <AppText tone="secondary">{messages.session}：{snapshot.sessionId}</AppText>
        )}
        <AppText tone="secondary">
          {messages.faceStatus}：{snapshot.faceReady ? messages.faceReady : messages.faceNotReady}
        </AppText>
        {snapshot.phase === 'observing' && (
          <AppText tone="secondary">
            {messages.readinessDuration}：{formatSeconds(Number(snapshot.readinessContinuousNanos) / 1_000_000_000)}
          </AppText>
        )}
        <AppText tone="secondary">
          {messages.targetDuration}：{formatSeconds(measurementDurationMillis / 1_000)}
        </AppText>
        {(snapshot.phase === 'measuring' || snapshot.phase === 'completed') && (
          <>
            <AppText tone="secondary">{messages.measurementProgress}：{progressPercent}%</AppText>
            <ProgressTrack
              accessibilityRole="progressbar"
              accessibilityLabel={messages.measurementProgress}
              accessibilityValue={{ min: 0, max: 100, now: progressPercent }}
            >
              <ProgressFill $progress={progress} />
            </ProgressTrack>
          </>
        )}
        {snapshot.termination != null && (
          <AppText tone="secondary">
            {messages.termination}：{localizeTermination(snapshot.termination, messages)}
          </AppText>
        )}
        {errorCode != null && (
          <>
            <StatusFeedback
              tone="error"
              title={messages.errorTitle}
              message={localizeRPPGError(errorCode, messages)}
            />
            <AppText accessibilityRole="alert" tone="muted" variant="caption">
              {messages.errorCode}：{errorCode}
            </AppText>
          </>
        )}
      </AppCard>

      <AppCard>
        <AppText variant="section">{messages.previewTitle}</AppText>
        <PreviewFrame>
          {client != null && isFocused && (
            <RPPGPreview
              accessible={false}
              accessibilityLabel={messages.previewLabel}
              style={rppgPreviewStyle}
            />
          )}
          {!isPreviewVisible && (
            <PreviewPlaceholder pointerEvents="none">
              <AppText tone="secondary">{messages.previewPlaceholder}</AppText>
            </PreviewPlaceholder>
          )}
        </PreviewFrame>
      </AppCard>

      <AppCard>
        <AppText variant="section">{messages.waveformTitle}</AppText>
        <RPPGWaveform
          samples={waveformSamples}
          durationMillis={MAX_WAVEFORM_DURATION_MILLIS}
          emptyMessage={messages.waveformEmpty}
          accessibilityLabel={messages.waveformAccessibility}
        />
        <AppText tone="muted" variant="caption">{messages.waveformDescription}</AppText>
      </AppCard>

      <AppCard>
        <AppText variant="section">{messages.signalTitle}</AppText>
        <AppText variant="section">{messages.instantHeartRateTitle}</AppText>
        {instantHeartRate != null ? (
          <>
            <AppText variant="display">{instantHeartRate.heartRateBpm.toFixed(1)} bpm</AppText>
            <AppText tone="secondary">
              {messages.instantIntervalLabel}：{(Number(instantHeartRate.intervalNanos) / 1_000_000).toFixed(1)} ms
            </AppText>
          </>
        ) : (
          <StatusFeedback
            tone="info"
            title={snapshot.phase === 'measuring'
              ? messages.instantHeartRateInsufficient
              : messages.instantHeartRateWaiting}
          />
        )}
        <AppText tone="muted" variant="caption">{messages.instantHeartRateDescription}</AppText>
        <AppText variant="section">{messages.spectralHeartRateTitle}</AppText>
        <StatusFeedback
          tone={snapshot.signalStatus === 'valid_heart_rate' ? 'success' : 'info'}
          title={localizeSignalStatus(snapshot.signalStatus, messages)}
        />
        <StatusFeedback
          tone={latestHeartRateWindow?.valid ? 'success' : 'info'}
          title={latestHeartRateWindow == null
            ? messages.signalPending
            : latestHeartRateWindow.valid
              ? messages.latestWindowValid
              : messages.latestWindowInvalid}
        />
        <AppText variant="display">
          {latestHeartRateWindow?.valid && latestHeartRateWindow.heartRateBpm != null
            ? `${latestHeartRateWindow.heartRateBpm} bpm`
            : messages.noValidHeartRate}
        </AppText>
        {latestHeartRateWindow != null && !latestHeartRateWindow.valid && latestHeartRateWindow.reason != null && (
          <AppText tone="secondary">{messages.rejectionReason}：{latestHeartRateWindow.reason}</AppText>
        )}
        <AppText tone="secondary">
          {messages.heartRateAverage}：{averageHeartRateBpm == null
            ? messages.noValidAverage
            : `${averageHeartRateBpm.toFixed(1)} bpm`}
        </AppText>
        <AppText tone="secondary">
          {messages.validWindowCount}：{heartRateSummary.validWindowCount}
        </AppText>
        {heartRateSummary.lastValidWindow?.heartRateBpm != null && (
          <AppText tone="secondary">
            {messages.lastValidHeartRate}：{heartRateSummary.lastValidWindow.heartRateBpm} bpm
          </AppText>
        )}
      </AppCard>

      <AppCard>
        <AppText variant="section">{messages.actionsTitle}</AppText>
        <AppText tone="secondary">
          {permissionGranted ? messages.permissionGrantedHint : messages.permissionRequiredHint}
        </AppText>
        <ActionButton
          label={permissionGranted ? messages.permissionConfirmed : messages.requestPermission}
          secondary
          disabled={client == null || busy || permissionGranted}
          loading={busy && !permissionGranted}
          onPress={() => void runCommand(async () => {
            await client?.requestCameraPermission()
            if (mounted.current) setPermissionGranted(true)
          })}
        />
        {canOpenPreview && (
          <ActionButton
            label={messages.openPreview}
            disabled={client == null || busy || !permissionGranted}
            loading={busy && permissionGranted}
            onPress={() => {
              cameraSessionGeneration.current += 1
              void runCommand(() => client?.openPreview() ?? Promise.resolve())
            }}
          />
        )}
        {snapshot.phase === 'preview' && (
          <ActionButton
            label={messages.startObservation}
            disabled={busy}
            loading={busy}
            onPress={() => void runCommand(() => client?.start() ?? Promise.resolve())}
          />
        )}
        {(snapshot.phase === 'observing' || snapshot.phase === 'measuring') && (
          <ActionButton
            label={messages.stopAndSave}
            disabled={busy}
            loading={busy}
            secondary
            onPress={() => void runCommand(() => client?.stop() ?? Promise.resolve())}
          />
        )}
        {busy && <StatusFeedback tone="pending" title={messages.waitingForNative} />}
      </AppCard>

      <AppCard>
        <AppText variant="section">{messages.completedFiles}</AppText>
        <AppText tone="muted" variant="caption">{messages.artifactListHint}</AppText>
        <ActionButton
          label={messages.refreshArtifacts}
          secondary
          disabled={client == null || busy}
          onPress={() => void refreshArtifacts()}
        />
        {artifacts.length > visibleArtifacts.length && (
          <AppText tone="muted" variant="caption">{messages.artifactLimitNote}</AppText>
        )}
        {visibleArtifacts.length === 0 ? (
          <StatusFeedback tone="info" title={messages.noCompletedFiles} />
        ) : visibleArtifacts.map((artifact) => (
          <ArtifactGroup key={artifact.sessionId}>
            <AppText tone="secondary">{messages.session}：{artifact.sessionId}</AppText>
            {artifact.files.map((file) => (
              <ArtifactFile key={file.kind}>
                <AppText tone="secondary" variant="caption">{localizeArtifactFile(file.kind, messages)}</AppText>
                <AppText selectable variant="caption">{file.path}</AppText>
                <AppText tone="secondary" variant="caption">{messages.fileSize}：{file.sizeBytes} bytes</AppText>
              </ArtifactFile>
            ))}
          </ArtifactGroup>
        ))}
      </AppCard>
    </PageContainer>
  )
}


/** 显示传感器时间对应的秒数；无效值明确显示为零。 */
function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0.0 s'
  return `${seconds.toFixed(1)} s`
}

/** 提取稳定错误码，不向界面传播未知异常内容。 */
function readErrorCode(error: unknown): string {
  if (error != null && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code
  }
  return 'UNKNOWN'
}

/** 显示最终信号结论，不把无效读数伪装成零心率。 */
function localizeSignalStatus(
  status: RPPGSignalStatus | null,
  messages: RPPGMessageValues,
): string {
  if (status === 'valid_heart_rate') return messages.signalValid
  if (status === 'no_valid_heart_rate') return messages.signalNoValidHeartRate
  if (status === 'no_waveform') return messages.signalNoWaveform
  return messages.signalPending
}

/** 把正常结束原因映射为本地说明。 */
function localizeTermination(
  reason: RPPGTerminationReason,
  messages: RPPGMessageValues,
): string {
  const labels: Record<RPPGTerminationReason, string> = {
    target_duration: messages.terminationTargetDuration,
    user_stop: messages.terminationUserStop,
    page_left: messages.terminationPageLeft,
    app_background: messages.terminationAppBackground,
    observation_timeout: messages.terminationObservationTimeout,
    interrupted: messages.terminationInterrupted,
  }
  return labels[reason]
}

/** 将已发布会话的文件用途映射为可读标签。 */
function localizeArtifactFile(
  kind: 'session' | 'pulse' | 'heart-rate' | 'instant-heart-rate',
  messages: RPPGMessageValues,
): string {
  if (kind === 'session') return messages.fileSession
  if (kind === 'pulse') return messages.filePulse
  if (kind === 'instant-heart-rate') return messages.fileInstantHeartRate
  return messages.fileHeartRate
}
