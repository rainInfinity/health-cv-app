/** 提供四种 Android 传感器的能力查询、独立启停与文件查看界面。 */

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import type { SensorKind } from '@health-cv-app/acquisition'
import {
  connectSensorScreen,
  refreshSensorScreen,
  sensorArtifacts,
  sensorCapabilities,
  sensorErrors,
  sensorKinds,
  sensorSnapshots,
  setSensorError,
  startSensorCapture,
  stopSensorCapture,
} from '@/app/sensors'
import { ActionButton } from '@/shared/components/ActionButton'
import { AppCard } from '@/shared/components/AppCard'
import { AppInput } from '@/shared/components/AppInput'
import { AppText } from '@/shared/components/AppText'
import { PageContainer } from '@/shared/components/PageContainer'
import { MAX_DISPLAYED_ARTIFACTS } from '@/shared/artifactDisplayLimit'
import { StatusFeedback } from '@/shared/components/StatusFeedback'

import { ArtifactGroup, ArtifactList, SensorControls } from './styles'
import {
  localizeSensorCoordinateSystem,
  localizeSensorName,
  localizeSensorPhase,
  localizeSensorUnit,
  sensorCaptureMessages,
} from '@/pages/dev/sensors/sensorCaptureMessages'
import { localizeSensorCaptureError } from '@/pages/dev/sensors/sensorErrorLocalization'

/** 呈现独立于登录、相机及云端配置的传感器验证入口。 */
export function SensorCaptureScreen() {
  const snapshots = useStore(sensorSnapshots)
  const capabilities = useStore(sensorCapabilities)
  const artifacts = useStore(sensorArtifacts)
  const errors = useStore(sensorErrors)
  const messages = useStore(sensorCaptureMessages)
  const visibleArtifactsByKind = useMemo(() => ({
    accelerometer: artifacts.accelerometer.slice(-MAX_DISPLAYED_ARTIFACTS),
    gyroscope: artifacts.gyroscope.slice(-MAX_DISPLAYED_ARTIFACTS),
    magnetometer: artifacts.magnetometer.slice(-MAX_DISPLAYED_ARTIFACTS),
    gravity: artifacts.gravity.slice(-MAX_DISPLAYED_ARTIFACTS),
  }), [artifacts])
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
    <PageContainer edges={['left', 'right']}>
      <AppText variant="title">{messages.screenTitle}</AppText>
      <AppText tone="secondary">{messages.screenDescription}</AppText>

      {sensorKinds.map((kind) => {
        const snapshot = snapshots[kind]
        const capability = capabilities[kind]
        const sensorName = localizeSensorName(kind, messages)
        const isBusy = busyKinds.has(kind)
        const canStart = capability?.available === true
          && !isBusy
          && (snapshot.phase === 'idle' || snapshot.phase === 'failed')
        const canStop = snapshot.phase === 'capturing' && !isBusy
        const errorCode = errors[kind]?.code
          ?? snapshot.errorCode
          ?? (snapshot.errorMessage != null ? 'SENSOR_CAPTURE_FAILED' : null)

        return (
          <AppCard key={kind}>
            <AppText variant="section">{sensorName}</AppText>
            <AppText tone="secondary" variant="caption">
              {messages.typeLabel}{messages.labelSeparator}{sensorName}
            </AppText>
            <AppText tone="secondary" variant="caption">
              {messages.unitLabel}{messages.labelSeparator}{localizeSensorUnit(kind, messages)}
            </AppText>
            <AppText tone="secondary" variant="caption">
              {messages.coordinateLabel}{messages.labelSeparator}{messages.coordinateSystem}
            </AppText>

            <AppText tone="secondary" variant="caption">
              {messages.capabilityLabel}{messages.labelSeparator}{capability == null
                ? messages.capabilityChecking
                : capability.available
                  ? `${capability.deviceName ?? messages.defaultDevice}${messages.separator}${messages.minimumInterval} ${capability.minSamplingPeriodMicros ?? messages.unknown} ${messages.microseconds}`
                  : messages.capabilityUnavailable}
            </AppText>
            {!capability?.available && capability != null && (
              <StatusFeedback
                tone="info"
                title={messages.unavailableTitle}
                message={messages.unavailableMessage}
              />
            )}

            <StatusFeedback
              tone={snapshot.phase === 'starting' || snapshot.phase === 'stopping' || isBusy
                ? 'pending'
                : snapshot.phase === 'failed'
                  ? 'error'
                  : 'info'}
              title={`${messages.statusLabel}${messages.labelSeparator}${localizeSensorPhase(snapshot.phase, messages)}`}
            />
            {snapshot.sessionId != null && (
              <AppText tone="secondary">
                {messages.session}{messages.labelSeparator}{snapshot.sessionId}
              </AppText>
            )}
            {snapshot.requestedSamplingPeriodMicros != null && (
              <AppText tone="secondary" variant="caption">
                {messages.requestedInterval} {snapshot.requestedSamplingPeriodMicros} {messages.microseconds}
                {messages.separator}{messages.registeredInterval} {snapshot.registeredSamplingPeriodMicros ?? messages.unknown} {messages.microseconds}
              </AppText>
            )}
            <AppText tone="muted" variant="caption">{messages.samplingDisclaimer}</AppText>

            <SensorControls>
              <AppInput
                label={messages.inputLabel}
                accessibilityLabel={`${sensorName} ${messages.inputAccessibility}`}
                disabled={isBusy || snapshot.phase === 'capturing' || snapshot.phase === 'stopping'}
                keyboardType="numeric"
                onChangeText={(value) => setPeriods((current) => ({ ...current, [kind]: value }))}
                value={periods[kind]}
              />
              <ActionButton
                label={messages.startCapture}
                disabled={!canStart}
                loading={isBusy}
                onPress={() => void runCommand(kind, () => startSensorCapture(kind, Number(periods[kind])))}
              />
              <ActionButton
                label={messages.stopAndSave}
                disabled={!canStop}
                loading={isBusy}
                secondary
                onPress={() => void runCommand(kind, () => stopSensorCapture(kind))}
              />
            </SensorControls>

            {errorCode != null && (
              <>
                <StatusFeedback
                  tone="error"
                  title={messages.errorTitle}
                  message={localizeSensorCaptureError(errorCode, messages)}
                />
                <AppText accessibilityRole="alert" tone="muted" variant="caption">
                  {messages.errorCode}{messages.labelSeparator}{errorCode}
                </AppText>
              </>
            )}

            <ArtifactList>
              <AppText variant="label">{messages.completedFiles}</AppText>
              {artifacts[kind].length === 0 ? (
                <StatusFeedback tone="info" title={messages.noCompletedFiles} />
              ) : visibleArtifactsByKind[kind].map((artifact) => (
                <ArtifactGroup key={artifact.sessionId}>
                  <AppText tone="secondary">
                    {messages.artifactSession}{messages.labelSeparator}{artifact.sessionId}
                  </AppText>
                  <AppText selectable variant="caption">{messages.artifactPath}{messages.labelSeparator}{artifact.path}</AppText>
                  <AppText tone="secondary" variant="caption">
                    {artifact.sampleCount} {messages.sampleCount}{messages.separator}{artifact.sizeBytes} {messages.bytes}
                    {messages.separator}{messages.artifactRequestedInterval} {artifact.requestedSamplingPeriodMicros} {messages.microseconds}
                    {messages.separator}{messages.artifactRegisteredInterval} {artifact.registeredSamplingPeriodMicros} {messages.microseconds}
                  </AppText>
                  <AppText tone="secondary" variant="caption">
                    {messages.artifactTimeRange} {artifact.startedAtMillis}–{artifact.finishedAtMillis} ms
                    {messages.separator}{messages.unitLabel} {localizeSensorUnit(artifact.kind, messages)}
                    {messages.separator}{messages.coordinateLabel} {localizeSensorCoordinateSystem(artifact.coordinateSystem, messages)}
                  </AppText>
                </ArtifactGroup>
              ))}
              {artifacts[kind].length > visibleArtifactsByKind[kind].length && (
                <AppText tone="muted" variant="caption">{messages.artifactLimitNote}</AppText>
              )}
              <AppText tone="muted" variant="caption">{messages.currentProcessNote}</AppText>
            </ArtifactList>
          </AppCard>
        )
      })}

      <ActionButton
        label={messages.refresh}
        disabled={busyKinds.size > 0}
        secondary
        onPress={() => void refreshSensorScreen()}
      />
      <AppText tone="muted" variant="caption">{messages.pageLifecycleNote}</AppText>
    </PageContainer>
  )
}

