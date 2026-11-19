/** 独立报告视窗只横向平移固定样例，不读取或替换真实采集历史。 */

import { useStore } from '@nanostores/react'
import { useMemo, useRef, useState } from 'react'
import { PanResponder, View } from 'react-native'
import type { LayoutChangeEvent } from 'react-native'
import { useTheme } from 'styled-components/native'
import { AppText } from '@/shared/components/AppText'
import { PulseWaveChart } from '@/shared/components/PulseWaveChart'
import { selectPulseWindow } from '@/shared/components/PulseWaveHistory/pulseWaveWindow'
import { fingertipResultSample, processedPulseSample } from '../fingertipResultSample'
import { fingertipResultsMessages, formatResultWaveRange } from '../fingertipResultsMessages'
import { ProcessedTag, WaveCard, WaveHeading, WaveNavigation, WavePlot, WaveTitle } from './styles'

const WINDOW_MS = 6_000
const LAST_WINDOW_START_MS = fingertipResultSample.durationMs - WINDOW_MS

/** 默认从 0–6 秒开始，不自动跟随、缩放、显示拖动条或实时返回最新按钮。 */
export function ProcessedPulseWave() {
  const messages = useStore(fingertipResultsMessages)
  const theme = useTheme()
  const [startTimeMs, setStartTimeMs] = useState(0)
  const current = useRef({ startTimeMs, width: 0 })
  current.current.startTimeMs = startTimeMs
  const dragStart = useRef(0)
  const visible = useMemo(() => selectPulseWindow(processedPulseSample, startTimeMs), [startTimeMs])
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => gesture.numberActiveTouches === 1 && Math.abs(gesture.dx) > 3 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: () => { dragStart.current = current.current.startTimeMs },
    onPanResponderMove: (_, gesture) => {
      if (gesture.numberActiveTouches !== 1) return
      const width = Math.max(1, current.current.width - 16)
      setStartTimeMs(Math.max(0, Math.min(LAST_WINDOW_START_MS, dragStart.current - gesture.dx / width * WINDOW_MS)))
    },
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
  }), [])

  function measurePlot(event: LayoutChangeEvent) {
    current.current.width = event.nativeEvent.layout.width
  }

  return (
    <WaveCard style={theme.surfaceElevation.raised}>
      <WaveHeading>
        <WaveTitle><AppText variant="section" accessibilityRole="header">{messages.pulseWave}</AppText><ProcessedTag><AppText variant="caption" style={{ color: theme.colors.brand.action }}>{messages.processed}</AppText></ProcessedTag></WaveTitle>
        <AppText variant="caption" tone="muted">{messages.swipeHint}</AppText>
      </WaveHeading>
      <WavePlot onLayout={measurePlot} {...responder.panHandlers}>
        <View pointerEvents="none">
          <PulseWaveChart points={visible} startTimeMs={startTimeMs} endTimeMs={startTimeMs + WINDOW_MS} minimum={-0.135} maximum={1.212} height={164} appearance="product" emptyMessage="" accessibilityLabel={messages.waveAccessibility} />
        </View>
      </WavePlot>
      <WaveNavigation><AppText variant="caption" style={{ color: theme.colors.brand.action }}>{formatResultWaveRange(messages.waveRange, startTimeMs)}</AppText><AppText variant="caption" tone="muted">{messages.waveDuration}</AppText></WaveNavigation>
    </WaveCard>
  )
}
