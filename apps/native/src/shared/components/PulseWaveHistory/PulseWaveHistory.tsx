/** 共用固定六秒历史回看、实时跟随与原生触摸隔离，不生成或改写样本。 */

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { PanResponder, View } from 'react-native'
import type { LayoutChangeEvent } from 'react-native'
import { useTheme } from 'styled-components/native'
import { AppText } from '@/shared/components/AppText'
import { PulseWaveChart } from '@/shared/components/PulseWaveChart'
import { MAX_PULSE_SCROLL_MS } from '@/shared/components/PulseWaveChart/pulseScroll'
import { ArrowRight } from '@/shared/graphics'
import { clampPulseWindowStart, formatPulseWindow, PULSE_WINDOW_MS, selectPulseWindow } from './pulseWaveWindow'
import type { PulsePoint } from './pulseWaveWindow'
import { HistoryFrame, HistoryHeading, HistoryPlot, LatestButton } from './styles'

/** 整轮采样由调用方持有；高度仅约束绘图区，不包含标题。 */
export interface PulseWaveHistoryProps {
  /** 本轮相对起点的毫秒坐标，按时间递增，可只追加同一个数组。 */
  points: readonly PulsePoint[]
  /** 最新采样／展示位置，单位毫秒，与 points 使用同一原点。 */
  latestTimeMs: number
  /** 本轮纵轴下界，不随回看窗口缩放。 */
  minimum: number
  /** 本轮纵轴上界，不改变原样本。 */
  maximum: number
  /** 标题使用现有页面文案。 */
  title: string
  /** 绘图区辅助技术说明。 */
  accessibilityLabel: string
  /** 绘图区固定高度，单位 dp；省略时填满剩余空间。 */
  height?: number
  /** 弹性绘图区的最小高度，单位 dp。 */
  minimumHeight?: number
  /** 标题与绘图区间距，单位 dp。 */
  headingGap?: number
  /** 触摸期间暂停外层横向分页，结束或取消后恢复。 */
  onInteractionChange?: (active: boolean) => void
  /** 正在前台检测并显示波形页时允许原生自动平移。 */
  scrolling?: boolean
}

/** 只平移时间坐标；采样继续追加时回看绝对时间段保持不动。 */
export const PulseWaveHistory = memo(function PulseWaveHistory({ points, latestTimeMs, minimum, maximum, title, accessibilityLabel, height, minimumHeight = 64, headingGap = 8, onInteractionChange, scrolling = false }: PulseWaveHistoryProps) {
  const theme = useTheme()
  const [requestedStart, setRequestedStart] = useState<number | null>(null)
  const [plotSize, setPlotSize] = useState({ width: 0, height: height ?? minimumHeight })
  const previousLatest = useRef(latestTimeMs)
  const startTimeMs = clampPulseWindowStart(latestTimeMs, requestedStart)
  const reset = points.length === 0 || latestTimeMs < previousLatest.current
  const effectiveStart = reset ? latestTimeMs - PULSE_WINDOW_MS : startTimeMs
  const following = requestedStart === null || reset
  // 回看窗口已有完整数据后，后续采样不再重复重建不可变的历史绘图坐标。
  const visibleDataTime = Math.min(latestTimeMs, effectiveStart + PULSE_WINDOW_MS + MAX_PULSE_SCROLL_MS)
  const empty = points.length === 0
  const visible = useMemo(() => selectPulseWindow(points, effectiveStart, MAX_PULSE_SCROLL_MS), [points, empty, visibleDataTime, effectiveStart])
  const current = useRef({ latestTimeMs, startTimeMs: effectiveStart, width: plotSize.width, onInteractionChange })
  current.current = { latestTimeMs, startTimeMs: effectiveStart, width: plotSize.width, onInteractionChange }
  const dragStart = useRef(0)

  useEffect(() => {
    if (reset) setRequestedStart(null)
    previousLatest.current = latestTimeMs
  }, [latestTimeMs, reset])

  useEffect(() => () => current.current.onInteractionChange?.(false), [])

  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => gesture.numberActiveTouches === 1 && Math.abs(gesture.dx) > 3 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: () => {
      dragStart.current = current.current.startTimeMs
      current.current.onInteractionChange?.(true)
    },
    onPanResponderMove: (_, gesture) => {
      if (gesture.numberActiveTouches !== 1 || current.current.latestTimeMs <= PULSE_WINDOW_MS) return
      const width = Math.max(1, current.current.width - 16)
      setRequestedStart(clampPulseWindowStart(current.current.latestTimeMs, dragStart.current - gesture.dx / width * PULSE_WINDOW_MS))
    },
    onPanResponderRelease: () => current.current.onInteractionChange?.(false),
    onPanResponderTerminate: () => current.current.onInteractionChange?.(false),
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
  }), [])

  /** 实测绘图区而非标题容器，浮层和渐隐始终使用同一画布尺寸。 */
  function measurePlot(event: LayoutChangeEvent) {
    const { width, height: measuredHeight } = event.nativeEvent.layout
    setPlotSize((previous) => previous.width === width && previous.height === measuredHeight ? previous : { width, height: measuredHeight })
  }

  return (
    <HistoryFrame>
      <HistoryHeading style={{ marginBottom: headingGap }}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="caption" tone="muted">{formatPulseWindow(effectiveStart)}</AppText>
      </HistoryHeading>
      <HistoryPlot
        style={height === undefined ? { minHeight: minimumHeight } : { height, flex: 0 }}
        onLayout={measurePlot}
        onTouchStart={() => onInteractionChange?.(true)}
        onTouchEnd={() => onInteractionChange?.(false)}
        onTouchCancel={() => onInteractionChange?.(false)}
        {...responder.panHandlers}
      >
        <View pointerEvents="none">
          <PulseWaveChart points={visible} startTimeMs={effectiveStart} endTimeMs={effectiveStart + PULSE_WINDOW_MS} minimum={minimum} maximum={maximum} height={height ?? plotSize.height} appearance="product" emptyMessage="" accessibilityLabel={accessibilityLabel} scrolling={scrolling && following} />
        </View>
        {!following && latestTimeMs > PULSE_WINDOW_MS && (
          <LatestButton
            style={({ pressed }) => ({ top: ((height ?? plotSize.height) - 48) / 2, opacity: pressed ? 0.65 : 1 })}
            accessibilityRole="button"
            accessibilityLabel="回到最新"
            onPress={() => setRequestedStart(null)}
          >
            <ArrowRight size={22} color={theme.colors.brand.action} accessible={false} />
          </LatestButton>
        )}
      </HistoryPlot>
    </HistoryFrame>
  )
})
