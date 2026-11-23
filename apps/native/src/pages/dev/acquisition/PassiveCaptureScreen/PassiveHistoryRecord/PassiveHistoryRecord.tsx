/** 展示单轮频谱窗口均值和持久化逐搏序列，不把初步值混入均值。 */
import { useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'
import type { RPPGArtifact } from '@health-cv-app/acquisition'
import { passiveCaptureMessages } from '@/app/passive-capture-messages'
import { loadRPPGHistory } from '@/app/rppg/loadRppgHistory'
import type { RPPGHistory } from '@/app/rppg/rppgHistory'
import { AppText } from '@/shared/components/AppText'
import { StatusFeedback } from '@/shared/components/StatusFeedback'
import { BeatRow, BeatValue, HistoryGroup, SequenceToggle } from './styles'

/** 单条已发布会话；刷新代次变化时丢弃旧文件读取的迟到结果。 */
interface PassiveHistoryRecordProps {
  /** 本条历史的真实原生产物引用。 */
  artifact: RPPGArtifact
}

/** 显式输出设备本地年月日，避免运行时忽略zh-CN而产生歧义日期。 */
function formatStartedAt(value: string): string {
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** 有限读取一轮历史并按需展开逐搏数据，读取失败不显示部分均值。 */
export function PassiveHistoryRecord({ artifact }: PassiveHistoryRecordProps) {
  const messages = useStore(passiveCaptureMessages)
  const [history, setHistory] = useState<RPPGHistory | null>(null)
  const [failed, setFailed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    let active = true
    setHistory(null)
    setFailed(false)
    void loadRPPGHistory(artifact).then((value) => {
      if (active) setHistory(value)
    }).catch(() => {
      if (active) setFailed(true)
    })
    return () => { active = false }
  }, [artifact])

  if (failed) return <StatusFeedback tone="error" title={messages.historyReadFailed} />
  if (history == null) return <StatusFeedback tone="pending" title={messages.historyLoading} />

  return (
    <HistoryGroup>
      <AppText tone="secondary" variant="caption">
        {formatStartedAt(history.startedAt)}
        {messages.metadataSeparator}{history.configVersion}
      </AppText>
      <AppText variant="section">
        {messages.historyAverage}{messages.labelSeparator}
        {history.averageHeartRateBpm == null ? '--' : Math.trunc(history.averageHeartRateBpm)} bpm
      </AppText>
      <AppText tone="secondary">
        {messages.validHeartRateWindows}{messages.labelSeparator}
        {history.validWindowCount} / {artifact.sampleCounts.heartRateWindows}
      </AppText>
      <AppText tone="muted" variant="caption">
        {messages.measurementTarget}{messages.labelSeparator}{history.targetSeconds} {messages.secondsUnit}
        {messages.metadataSeparator}{messages.historySpectralWindow}{messages.labelSeparator}{history.windowSeconds} {messages.secondsUnit}
      </AppText>
      {history.beats == null ? (
        <AppText tone="muted" variant="caption">{messages.historyLegacyNoBeats}</AppText>
      ) : history.beats.length === 0 ? (
        <AppText tone="muted" variant="caption">{messages.historyNoBeats}</AppText>
      ) : (
        <>
          <SequenceToggle
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onPress={() => setExpanded((value) => !value)}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <AppText>{expanded ? messages.historyCollapse : messages.historyExpand}
              {messages.labelSeparator}{history.beats.length}
            </AppText>
          </SequenceToggle>
          {expanded && (
            <HistoryGroup>
              <AppText tone="muted" variant="caption">{messages.historyBeatDescription}</AppText>
              <BeatRow>
                <BeatValue tone="secondary" variant="caption">{messages.historyTimeColumn}</BeatValue>
                <BeatValue tone="secondary" variant="caption">{messages.historyBpmColumn}</BeatValue>
                <BeatValue tone="secondary" variant="caption">{messages.historyRrColumn}</BeatValue>
              </BeatRow>
              {history.beats.map((beat, index, beats) => (
                <HistoryGroup key={`${beat.segmentIndex}-${beat.timeMs}`}>
                  {(index === 0 || beat.segmentIndex !== beats[index - 1].segmentIndex) && (
                    <AppText tone="muted" variant="caption">
                      {messages.historySegment}{messages.labelSeparator}{beat.segmentIndex}
                    </AppText>
                  )}
                  <BeatRow>
                    <BeatValue variant="caption">{(beat.timeMs / 1_000).toFixed(2)}</BeatValue>
                    <BeatValue variant="caption">{beat.heartRateBpm.toFixed(1)}</BeatValue>
                    <BeatValue variant="caption">{beat.intervalMs.toFixed(1)}</BeatValue>
                  </BeatRow>
                </HistoryGroup>
              ))}
            </HistoryGroup>
          )}
        </>
      )}
    </HistoryGroup>
  )
}
