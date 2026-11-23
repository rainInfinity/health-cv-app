/** 展示被动 RPPG 服务、测量配置、心率历史及旧视频。 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { useStore } from '@nanostores/react'
import type { PassiveVideoArtifact, RPPGArtifact } from '@health-cv-app/acquisition'
import { AppState } from 'react-native'
import { useTheme } from 'styled-components/native'
import {
  connectPassiveCaptureScreen,
  disablePassiveCapture,
  isPassiveCaptureEnabled,
  openPassiveCaptureSettings,
  passiveCaptureBusy,
  passiveCaptureClient,
  passiveCaptureError,
  passiveCaptureSnapshot,
  readPassiveCaptureErrorCode,
  refreshPassiveCaptureSnapshot,
  setPassiveCaptureConfig,
} from '@/app/passive-capture'
import { usePassiveCaptureEnable } from '@/app/passive-capture-interaction'
import {
  canOpenPassiveCaptureSettings,
  localizePassiveCaptureError,
  passiveCaptureMessages,
} from '@/app/passive-capture-messages'
import {
  localizePassiveCaptureReason,
  localizePassiveCaptureState,
  localizeRppgSignalStatus,
  localizeRppgTermination,
} from '@/pages/dev/acquisition/passiveCaptureMessages'
import { ActionButton } from '@/shared/components/ActionButton'
import { AppCard } from '@/shared/components/AppCard'
import { AppInput } from '@/shared/components/AppInput'
import { AppText } from '@/shared/components/AppText'
import { PageContainer } from '@/shared/components/PageContainer'
import { MAX_DISPLAYED_ARTIFACTS } from '@/shared/artifactDisplayLimit'
import { StatusFeedback } from '@/shared/components/StatusFeedback'

import { ActionGroup, ArtifactGroup } from './styles'
import { PassiveHistoryRecord } from './PassiveHistoryRecord'

/** 呈现独立的 Android 被动 RPPG 服务、配置与本地产物。 */
export function PassiveCaptureScreen() {
  const snapshot = useStore(passiveCaptureSnapshot)
  const messages = useStore(passiveCaptureMessages)
  const busy = useStore(passiveCaptureBusy)
  const commandError = useStore(passiveCaptureError)
  const requestEnable = usePassiveCaptureEnable()
  const theme = useTheme()
  const [artifacts, setArtifacts] = useState<RPPGArtifact[]>([])
  const [videoArtifacts, setVideoArtifacts] = useState<PassiveVideoArtifact[]>([])
  const [filesSessionId, setFilesSessionId] = useState<string | null>(null)
  const visibleArtifacts = useMemo(
    () => artifacts.slice(-MAX_DISPLAYED_ARTIFACTS).reverse(),
    [artifacts],
  )
  const visibleVideoArtifacts = useMemo(
    () => videoArtifacts.slice(-MAX_DISPLAYED_ARTIFACTS),
    [videoArtifacts],
  )
  const [intervalInput, setIntervalInput] = useState(String(snapshot.config.intervalSeconds))
  const [durationInput, setDurationInput] = useState(String(snapshot.config.measurementDurationSeconds))
  const [localError, setLocalError] = useState<string | null>(null)
  const mounted = useRef(false)
  const refreshArtifacts = useCallback(async () => {
    try {
      const [rppgResults, historicalVideos] = await Promise.all([
        passiveCaptureClient.listArtifacts(),
        passiveCaptureClient.listVideoArtifacts(),
      ])
      if (mounted.current) {
        setArtifacts(rppgResults)
        setVideoArtifacts(historicalVideos)
      }
    } catch (error) {
      if (mounted.current) setLocalError(readPassiveCaptureErrorCode(error))
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    const unsubscribe = connectPassiveCaptureScreen()
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
  }, [refreshArtifacts])
  useFocusEffect(
    useCallback(() => {
      refreshPassiveCaptureSnapshot()
      void refreshArtifacts()
      return undefined
    }, [refreshArtifacts]),
  )

  useEffect(() => {
    setIntervalInput(String(snapshot.config.intervalSeconds))
    setDurationInput(String(snapshot.config.measurementDurationSeconds))
  }, [snapshot.config.intervalSeconds, snapshot.config.measurementDurationSeconds])

  useEffect(() => {
    if (
      snapshot.lastReason != null &&
      (snapshot.state === 'waiting' || snapshot.state === 'failed' || snapshot.state === 'disabled')
    ) {
      void refreshArtifacts()
    }
  }, [snapshot.lastReason, snapshot.state, refreshArtifacts])

  /** 原生命令共享防重；开发页只刷新自己的本地产物列表。 */
  async function runCommand(command: () => Promise<boolean>): Promise<void> {
    setLocalError(null)
    await command()
    await refreshArtifacts()
  }

  const serviceActive = isPassiveCaptureEnabled(snapshot)
    || snapshot.state === 'starting' || snapshot.state === 'stopping'
  const errorCode = commandError ?? localError
  const instantHeartRate = snapshot.state === 'measuring' ? snapshot.latestInstantHeartRate : null
  const canOpenSettings = canOpenPassiveCaptureSettings(errorCode)

  return (
    <PageContainer edges={['left', 'right']} contentContainerStyle={{ paddingBottom: theme.spacing.xl }}>
      <AppText variant="title">{messages.screenTitle}</AppText>
      <AppText tone="secondary">{messages.screenDescription}</AppText>
      <AppText tone="muted" variant="caption">{messages.privacyNotice}</AppText>

      <AppCard>
        <AppText variant="section">{messages.stateTitle}</AppText>
        <StatusFeedback
          tone={
            snapshot.state === 'starting' ||
            snapshot.state === 'observing' ||
            snapshot.state === 'measuring' ||
            snapshot.state === 'stopping'
              ? 'pending'
              : 'info'
          }
          title={localizePassiveCaptureState(snapshot.state, messages)}
        />
        <AppText tone="secondary">
          {messages.cameraLabel}{messages.labelSeparator}{
            snapshot.state === 'measuring'
              ? messages.cameraMeasuring
              : snapshot.state === 'observing'
                ? messages.cameraObserving
                : snapshot.state === 'stopping'
                  ? messages.cameraStopping
                  : messages.cameraInactive
          }
        </AppText>
        {snapshot.state === 'measuring' && (
          <AppText tone="secondary">
            {messages.measurementTarget}{messages.labelSeparator}
            {snapshot.config.measurementDurationSeconds} {messages.secondsUnit}
          </AppText>
        )}
        {snapshot.sessionId != null && (
          <AppText tone="secondary">{messages.session}{messages.labelSeparator}{snapshot.sessionId}</AppText>
        )}
        <AppText variant="section">{messages.instantHeartRateTitle}</AppText>
        {instantHeartRate != null ? (
          <>
            <AppText variant="display">{instantHeartRate.heartRateBpm.toFixed(1)} bpm</AppText>
            <AppText tone="secondary">
              {messages.instantIntervalLabel}{messages.labelSeparator}
              {(Number(instantHeartRate.intervalNanos) / 1_000_000).toFixed(1)} ms
            </AppText>
          </>
        ) : (
          <StatusFeedback
            tone="info"
            title={snapshot.state === 'measuring'
              ? messages.instantHeartRateInsufficient
              : messages.instantHeartRateWaiting}
          />
        )}
        <AppText tone="muted" variant="caption">{messages.instantHeartRateDescription}</AppText>
        {snapshot.lastReason != null && (
          <AppText tone="secondary">
            {messages.latestEvent}{messages.labelSeparator}{localizePassiveCaptureReason(snapshot.lastReason, messages)}
          </AppText>
        )}
        {errorCode != null && (
          <>
            <StatusFeedback
              tone="error"
              title={messages.errorTitle}
              message={localizePassiveCaptureError(errorCode, messages)}
            />
            <AppText accessibilityRole="alert" tone="muted" variant="caption">
              {messages.errorCode}{messages.labelSeparator}{errorCode}
            </AppText>
          </>
        )}
        {canOpenSettings && (
          <ActionButton
            label={messages.openAppSettings}
            disabled={busy}
            loading={busy}
            secondary
            onPress={() => void openPassiveCaptureSettings()}
          />
        )}
      </AppCard>

      <AppCard>
        <AppText variant="section">{messages.configTitle}</AppText>
        <AppText tone="secondary" variant="caption">{messages.cycleHint}</AppText>
        <AppInput
          label={messages.intervalLabel}
          accessibilityLabel={messages.intervalAccessibility}
          disabled={serviceActive || busy}
          keyboardType="decimal-pad"
          onChangeText={setIntervalInput}
          value={intervalInput}
        />
        <AppInput
          label={messages.durationLabel}
          accessibilityLabel={messages.durationAccessibility}
          disabled={serviceActive || busy}
          keyboardType="decimal-pad"
          onChangeText={setDurationInput}
          value={durationInput}
        />
        {Number.isFinite(Number(durationInput)) &&
          Number(durationInput) > 0 &&
          Number(durationInput) < snapshot.minimumHeartRateMeasurementSeconds && (
            <StatusFeedback
              tone="info"
              title={messages.durationBelowMinimum({
                seconds: String(snapshot.minimumHeartRateMeasurementSeconds),
              })}
            />
          )}
        <ActionButton
          label={messages.saveConfig}
          disabled={serviceActive || busy}
          loading={busy}
          secondary
          onPress={() => void runCommand(() => setPassiveCaptureConfig({
            intervalSeconds: Number(intervalInput),
            measurementDurationSeconds: Number(durationInput),
          }))}
        />
      </AppCard>

      <ActionGroup>
        {!serviceActive ? (
          <ActionButton
            label={messages.enable}
            disabled={busy}
            loading={busy}
            onPress={() => { setLocalError(null); requestEnable() }}
          />
        ) : (
          <ActionButton
            label={messages.disable}
            disabled={busy}
            loading={busy}
            secondary
            onPress={() => void runCommand(disablePassiveCapture)}
          />
        )}
        {(busy || snapshot.state === 'starting' || snapshot.state === 'stopping') && (
          <StatusFeedback tone="pending" title={messages.commandPending} />
        )}
      </ActionGroup>

      <AppCard>
        <AppText variant="section">{messages.completedResults}</AppText>
        <AppText tone="muted" variant="caption">{messages.rppgResultScope}</AppText>
        {artifacts.length > visibleArtifacts.length && (
          <AppText tone="muted" variant="caption">{messages.artifactLimitNote}</AppText>
        )}
        {artifacts.length === 0 ? (
          <StatusFeedback
            tone="info"
            title={messages.noCompletedResults}
            message={messages.noResultDescription}
          />
        ) : visibleArtifacts.map((artifact) => (
          <ArtifactGroup key={artifact.sessionId}>
            <AppText tone="secondary">{messages.artifactSession}{messages.labelSeparator}{artifact.sessionId}</AppText>
            <PassiveHistoryRecord artifact={artifact} />
            <AppText tone="secondary" variant="caption">
              {messages.resultSource}{messages.labelSeparator}{messages.sourcePassive}
              {messages.metadataSeparator}{messages.resultTermination}{messages.labelSeparator}
              {localizeRppgTermination(artifact.termination, messages)}
            </AppText>
            <AppText tone="secondary" variant="caption">
              {messages.signalQuality}{messages.labelSeparator}{localizeRppgSignalStatus(artifact.signalStatus, messages)}
            </AppText>
            <AppText tone="secondary" variant="caption">
              {messages.pulseSamples}{messages.labelSeparator}{artifact.sampleCounts.pulseSamples}
              {messages.metadataSeparator}{messages.heartRateWindows}{messages.labelSeparator}{artifact.sampleCounts.heartRateWindows}
              {messages.metadataSeparator}{messages.validHeartRateWindows}{messages.labelSeparator}{artifact.sampleCounts.validHeartRateWindows}
              {messages.metadataSeparator}{messages.rejectedHeartRateWindows}{messages.labelSeparator}{artifact.sampleCounts.rejectedHeartRateWindows}
            </AppText>
            <ActionButton
              label={filesSessionId === artifact.sessionId ? messages.historyHideFiles : messages.historyShowFiles}
              secondary
              onPress={() => setFilesSessionId((current) => current === artifact.sessionId ? null : artifact.sessionId)}
            />
            {filesSessionId === artifact.sessionId && artifact.files.map((file) => (
              <ArtifactGroup key={`${artifact.sessionId}-${file.kind}`}>
                <AppText tone="secondary" variant="caption">
                  {file.kind === 'session'
                    ? messages.sessionFile
                    : file.kind === 'pulse'
                      ? messages.pulseFile
                      : file.kind === 'instant-heart-rate'
                        ? messages.instantHeartRateFile
                        : messages.heartRateFile}
                  {messages.labelSeparator}{file.sizeBytes} bytes
                </AppText>
                <AppText selectable variant="caption">{file.path}</AppText>
              </ArtifactGroup>
            ))}
          </ArtifactGroup>
        ))}
      </AppCard>

      <AppCard>
        <AppText variant="section">{messages.historicalVideos}</AppText>
        <AppText tone="muted" variant="caption">{messages.historicalVideoScope}</AppText>
        {videoArtifacts.length > visibleVideoArtifacts.length && (
          <AppText tone="muted" variant="caption">{messages.artifactLimitNote}</AppText>
        )}
        {videoArtifacts.length === 0 ? (
          <StatusFeedback
            tone="info"
            title={messages.noHistoricalVideos}
            message={messages.historicalVideoDescription}
          />
        ) : visibleVideoArtifacts.map((artifact) => (
          <ArtifactGroup key={artifact.sessionId}>
            <AppText tone="secondary">{messages.artifactSession}{messages.labelSeparator}{artifact.sessionId}</AppText>
            <AppText tone="secondary" variant="caption">{messages.artifactPath}{messages.labelSeparator}</AppText>
            <AppText selectable variant="caption">{artifact.path}</AppText>
            <AppText tone="secondary" variant="caption">
              {messages.dimensions}{messages.labelSeparator}{artifact.width} × {artifact.height}
              {messages.metadataSeparator}{messages.duration}{messages.labelSeparator}{artifact.durationMillis} ms
              {messages.metadataSeparator}{messages.fileSize}{messages.labelSeparator}{artifact.sizeBytes} bytes
            </AppText>
          </ArtifactGroup>
        ))}
      </AppCard>
    </PageContainer>
  )
}


