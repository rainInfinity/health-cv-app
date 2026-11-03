/** 提供用途说明、启停配置、真实服务状态和完成视频查询界面。 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'
import type { PassiveCaptureArtifact } from '@health-cv-app/acquisition'
import { AppState, Linking } from 'react-native'
import { useTheme } from 'styled-components/native'
import {
  connectPassiveCaptureScreen,
  passiveCaptureClient,
  passiveCaptureSnapshot,
  refreshPassiveCaptureSnapshot,
} from '@/app/passive-capture'
import {
  localizePassiveCaptureError,
  localizePassiveCaptureReason,
  localizePassiveCaptureState,
  passiveCaptureMessages,
} from '@/pages/dev/acquisition/passiveCaptureMessages'
import { feedbackMessages } from '@/app/i18n/feedbackMessages'
import { useFeedback } from '@/shared/components/FeedbackHost'
import { ActionButton } from '@/shared/components/ActionButton'
import { AppCard } from '@/shared/components/AppCard'
import { AppInput } from '@/shared/components/AppInput'
import { AppText } from '@/shared/components/AppText'
import { PageContainer } from '@/shared/components/PageContainer'
import { MAX_DISPLAYED_ARTIFACTS } from '@/shared/artifactDisplayLimit'
import { StatusFeedback } from '@/shared/components/StatusFeedback'

import { ActionGroup, ArtifactGroup } from './styles'

/** 呈现独立的 Android 后台解锁机会录像控制面板。 */
export function PassiveCaptureScreen() {
  const snapshot = useStore(passiveCaptureSnapshot)
  const messages = useStore(passiveCaptureMessages)
  const sharedMessages = useStore(feedbackMessages)
  const { showModal } = useFeedback()
  const theme = useTheme()
  const [artifacts, setArtifacts] = useState<PassiveCaptureArtifact[]>([])
  const visibleArtifacts = useMemo(
    () => artifacts.slice(-MAX_DISPLAYED_ARTIFACTS),
    [artifacts],
  )
  const [intervalInput, setIntervalInput] = useState(String(snapshot.config.intervalSeconds))
  const [durationInput, setDurationInput] = useState(String(snapshot.config.durationSeconds))
  const [localError, setLocalError] = useState<string | null>(null)
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
      if (mounted.current) setLocalError(readErrorCode(error))
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
      if (mounted.current) setLocalError(readErrorCode(error))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  /** 仅在用户明确启用被动采集时引导厂商后台活动设置。 */
  function showBackgroundSettingsGuidance(): void {
    showModal({
      title: messages.guidanceTitle,
      message: messages.guidanceMessage,
      closeLabel: sharedMessages.dismiss,
      actions: [
        { label: messages.cancel },
        { label: messages.openSettings, onPress: () => Linking.openSettings() },
        {
          label: messages.continueEnable,
          primary: true,
          onPress: () => runCommand(() => passiveCaptureClient.enable()),
        },
      ],
    })
  }

  const serviceActive = snapshot.state === 'starting'
    || snapshot.state === 'waiting'
    || snapshot.state === 'recording'
    || snapshot.state === 'stopping'
  const errorCode = localError
    ?? snapshot.errorCode
    ?? (snapshot.errorMessage != null || snapshot.state === 'failed' ? 'UNKNOWN' : null)
  const canOpenSettings = errorCode != null && (
    errorCode.includes('PERMISSION')
    || errorCode.includes('NOTIFICATION')
  )

  return (
    <PageContainer edges={['left', 'right']} contentContainerStyle={{ paddingBottom: theme.spacing.xl }}>
      <AppText variant="title">{messages.screenTitle}</AppText>
      <AppText tone="secondary">{messages.screenDescription}</AppText>
      <AppText tone="muted" variant="caption">{messages.privacyNotice}</AppText>

      <AppCard>
        <AppText variant="section">{messages.stateTitle}</AppText>
        <StatusFeedback
          tone={snapshot.state === 'starting' || snapshot.state === 'stopping' ? 'pending' : 'info'}
          title={localizePassiveCaptureState(snapshot.state, messages)}
        />
        <AppText tone="secondary">
          {messages.cameraLabel}{messages.labelSeparator}{
            snapshot.state === 'recording'
              ? messages.cameraRecording
              : snapshot.state === 'stopping'
                ? messages.cameraStopping
                : messages.cameraInactive
          }
        </AppText>
        {snapshot.sessionId != null && (
          <AppText tone="secondary">{messages.session}{messages.labelSeparator}{snapshot.sessionId}</AppText>
        )}
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
            onPress={() => void Linking.openSettings()}
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
        <ActionButton
          label={messages.saveConfig}
          disabled={serviceActive || busy}
          loading={busy}
          secondary
          onPress={() => void runCommand(async () => {
            const config = {
              intervalSeconds: Number(intervalInput),
              durationSeconds: Number(durationInput),
            }
            await passiveCaptureClient.setConfig(config)
          })}
        />
      </AppCard>

      <ActionGroup>
        {!serviceActive ? (
          <ActionButton
            label={messages.enable}
            disabled={busy}
            loading={busy}
            onPress={showBackgroundSettingsGuidance}
          />
        ) : (
          <ActionButton
            label={messages.disable}
            disabled={busy}
            loading={busy}
            secondary
            onPress={() => void runCommand(() => passiveCaptureClient.disable())}
          />
        )}
        {(busy || snapshot.state === 'starting' || snapshot.state === 'stopping') && (
          <StatusFeedback tone="pending" title={messages.commandPending} />
        )}
      </ActionGroup>

      <AppCard>
        <AppText variant="section">{messages.completedVideos}</AppText>
        <AppText tone="muted" variant="caption">{messages.artifactQueryScope}</AppText>
        {artifacts.length > visibleArtifacts.length && (
          <AppText tone="muted" variant="caption">{messages.artifactLimitNote}</AppText>
        )}
        {artifacts.length === 0 ? (
          <StatusFeedback
            tone="info"
            title={messages.noCompletedVideos}
            message={messages.cancelledVideoDescription}
          />
        ) : visibleArtifacts.map((artifact) => (
          <ArtifactGroup key={artifact.sessionId}>
            <AppText tone="secondary">{messages.artifactSession}{messages.labelSeparator}{artifact.sessionId}</AppText>
            <AppText tone="secondary" variant="caption">{messages.artifactPath}{messages.labelSeparator}</AppText>
            <AppText selectable variant="caption">{artifact.path}</AppText>
            <AppText tone="secondary" variant="caption">
              {messages.dimensions}{messages.labelSeparator}{artifact.width} × {artifact.height}{messages.metadataSeparator}{messages.duration}{messages.labelSeparator}{artifact.durationMillis} ms{messages.metadataSeparator}{messages.fileSize}{messages.labelSeparator}{artifact.sizeBytes} bytes
            </AppText>
          </ArtifactGroup>
        ))}
      </AppCard>
    </PageContainer>
  )
}

/** 从结构化异常提取稳定错误码，不保留底层消息。 */
function readErrorCode(error: unknown): string {
  if (
    error != null
    && typeof error === 'object'
    && 'code' in error
    && typeof error.code === 'string'
    && error.code.length > 0
  ) {
    return error.code
  }
  return 'UNKNOWN'
}

