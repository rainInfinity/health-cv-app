/** 每张报告卡独立鉴权读取处理后文件，局部保留样本并横向回看真实时间轴。 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { AppState, PanResponder, View } from 'react-native'
import type { LayoutChangeEvent } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import type { Rsp } from '@health-cv-app/cloud-client'
import { useTheme } from 'styled-components/native'
import { useAppServices } from '@/app/providers/AppProviders'
import { useAuthState } from '@/app/auth/useAuthState'
import { downloadReportWaveform, getReportWaveWindow, selectReportWaveSource } from '@/app/measurement/reportWaveform'
import type { ReportWaveData, ReportWaveKind } from '@/app/measurement/reportWaveform'
import { AppText } from '@/shared/components/AppText'
import { PulseWaveChart } from '@/shared/components/PulseWaveChart'
import { LoadingIndicator } from '@/shared/components/LoadingIndicator'
import { selectPulseWindow } from '@/shared/components/PulseWaveHistory/pulseWaveWindow'
import { formatResultWaveDuration, formatResultWaveRange } from './reportWaveMessages'
import { ProcessedTag, WaveCard, WaveHeading, WaveNavigation, WavePlot, WaveTitle } from './styles'

/** 只接收权威任务及信号类型，不让调用方传入样例或再次翻转后端幅值。 */
interface ReportWaveformProps {
  /** 经当前账号任务详情查询取得的权威任务。 */
  task: Rsp.Tasks.TaskDetail
  /** 两种血压信号分别挂载，下载及回看互不影响。 */
  kind: ReportWaveKind
  title: string
  /** 沿用既有卡片标题文案；真实时长不读取旧固定时长文案。 */
  labels: { processed: string; swipeHint: string; waveRange: unknown; waveAccessibility: string; waveLoading: string; waveFailed: string }
}

/** 每次读取只影响本卡状态，失败不会重跑任务或隐藏报告读数。 */
export function ReportWaveform({ task, kind, title, labels: messages }: ReportWaveformProps) {
  const theme = useTheme()
  const services = useAppServices()
  const authState = useAuthState()
  const focused = useIsFocused()
  const [foreground, setForeground] = useState(AppState.currentState === 'active')
  const generation = useRef(services?.auth.getSessionGeneration() ?? -1).current
  const authorized = authState.status === 'authenticated' && services?.auth.isAuthenticatedAt(generation) === true
  const source = selectReportWaveSource(task, kind)
  const logicalName = source?.logicalName
  const taskRef = useRef(task)
  taskRef.current = task
  const [result, setResult] = useState<{ taskId: number; kind: ReportWaveKind; data?: ReportWaveData; error?: unknown } | null>(null)
  const [startTimeMs, setStartTimeMs] = useState(0)
  const data = authorized && focused && logicalName !== undefined && result?.taskId === task.taskId && result.kind === kind ? result.data : undefined
  const failed = !logicalName || !services || !authorized || (result?.taskId === task.taskId && result.kind === kind && result.error != null) || (data != null && data.samples.length === 0)
  const window = getReportWaveWindow(data?.durationMs ?? 0, startTimeMs)
  const current = useRef({ startTimeMs: 0, width: 0 })
  current.current.startTimeMs = window.startTimeMs
  const dragStart = useRef(0)
  const visible = useMemo(() => data ? selectPulseWindow(data.samples, window.startTimeMs) : [], [data, window.startTimeMs])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setForeground(state === 'active'))
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    setResult(null)
    setStartTimeMs(0)
    if (!services || !authorized || !focused || !foreground || !logicalName) return
    const controller = new AbortController()
    let active = true
    void downloadReportWaveform(services, taskRef.current, kind, generation, controller.signal).then(
      (next) => {
        if (active && services.auth.isAuthenticatedAt(generation)) setResult({ taskId: task.taskId, kind, data: next })
      },
      (error: unknown) => {
        if (!active || !services.auth.isAuthenticatedAt(generation)) return
        setResult({ taskId: task.taskId, kind, error })
      },
    )
    return () => {
      active = false
      controller.abort()
    }
  }, [services, authorized, focused, foreground, logicalName, task.taskId, kind, generation])

  const durationMs = data?.durationMs ?? 0
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => durationMs > 6_000 && gesture.numberActiveTouches === 1 && Math.abs(gesture.dx) > 3 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: () => { dragStart.current = current.current.startTimeMs },
    onPanResponderMove: (_, gesture) => {
      if (gesture.numberActiveTouches !== 1) return
      const width = Math.max(1, current.current.width - 16)
      setStartTimeMs(getReportWaveWindow(durationMs, dragStart.current - gesture.dx / width * Math.min(6_000, durationMs)).startTimeMs)
    },
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
  }), [durationMs])

  /** 将横向拖动映射为当前窗口真实毫秒位移。 */
  function measurePlot(event: LayoutChangeEvent) {
    current.current.width = event.nativeEvent.layout.width
  }

  return (
    <WaveCard>
      <WaveHeading>
        <WaveTitle><AppText variant="section" accessibilityRole="header">{title}</AppText><ProcessedTag><AppText variant="caption" style={{ color: theme.colors.brand.action }}>{messages.processed}</AppText></ProcessedTag></WaveTitle>
        {data && durationMs > 6_000 && <AppText variant="caption" tone="muted">{messages.swipeHint}</AppText>}
      </WaveHeading>
      {data && !failed ? (
        <>
          <WavePlot onLayout={measurePlot} {...responder.panHandlers}>
            <View pointerEvents="none">
              <PulseWaveChart points={visible} signal={kind} invertPpg={false} startTimeMs={window.startTimeMs} endTimeMs={window.endTimeMs} minimum={data.minimum} maximum={data.maximum} height={164} appearance="product" emptyMessage="" accessibilityLabel={messages.waveAccessibility} />
            </View>
          </WavePlot>
          <WaveNavigation><AppText variant="caption" style={{ color: theme.colors.brand.action }}>{formatResultWaveRange(messages.waveRange, window.startTimeMs, window.endTimeMs)}</AppText><AppText variant="caption" tone="muted">{formatResultWaveDuration(durationMs)}</AppText></WaveNavigation>
        </>
      ) : (
        <>
          <WavePlot style={{ alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            {!failed && <LoadingIndicator size={24} />}
            <AppText variant="caption" tone="muted">{failed ? messages.waveFailed : messages.waveLoading}</AppText>
          </WavePlot>
          <WaveNavigation><AppText variant="caption" tone="muted">--</AppText><AppText variant="caption" tone="muted">--</AppText></WaveNavigation>
        </>
      )}
    </WaveCard>
  )
}
