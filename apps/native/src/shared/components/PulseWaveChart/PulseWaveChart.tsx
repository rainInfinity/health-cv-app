/** 使用 ECharts 原生 SVG 绘制脉搏波，原生合成层平移而不插值采样形状。 */

import { memo, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, AppState } from 'react-native'
import type { LayoutChangeEvent } from 'react-native'
import { SVGRenderer } from '@wuba/react-native-echarts/svgChart'
import Svg, { Defs, Line, LinearGradient, Rect, Stop } from 'react-native-svg'
import { init, use } from 'echarts/core'
import type { ComposeOption, EChartsType } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import type { LineSeriesOption } from 'echarts/charts'
import { GridComponent } from 'echarts/components'
import type { GridComponentOption } from 'echarts/components'
import { useTheme } from 'styled-components/native'
import { AppText } from '@/shared/components/AppText'
import { ChartFrame, ChartPlaceholder } from './styles'
import { ScrollingSvgChart } from './ScrollingSvgChart'
import type { ScrollingSvgHandle } from './ScrollingSvgChart'
import { createPulseCanvas } from './pulseScroll'

use([LineChart, GridComponent, SVGRenderer])

type PulseChartOption = ComposeOption<LineSeriesOption | GridComponentOption>

/** 有界坐标数据及绘图区约束；时间统一使用毫秒。 */
export interface PulseWaveChartProps {
  /** 时间与原始幅值；null 表示必须断开的缺口，不补零。 */
  points: [number, number | null][]
  /** 可见窗口左端，单位毫秒。 */
  startTimeMs: number
  /** 可见窗口右端，单位毫秒，必须大于左端。 */
  endTimeMs: number
  /** 显示纵轴下界，不回写原始样本。 */
  minimum: number
  /** 显示纵轴上界，必须大于下界。 */
  maximum: number
  /** 容器实际高度，单位 dp。 */
  height: number
  /** 产品单基线／渐隐，或开发页诊断网格。 */
  appearance: 'diagnostic' | 'product'
  /** 没有可绘制数据时的提示；空字符串表示只保留绘图区。 */
  emptyMessage: string
  /** 辅助技术读取的完整曲线说明。 */
  accessibilityLabel: string
  /** 运行中跟随最新时仅对整条曲线做原生水平平移；不补间幅值。 */
  scrolling?: boolean
}

/** 图表只随数据批次重绘；批次之间由 native driver 平移已有 SVG。 */
export const PulseWaveChart = memo(function PulseWaveChart({ points, startTimeMs, endTimeMs, minimum, maximum, height, appearance, emptyMessage, accessibilityLabel, scrolling = false }: PulseWaveChartProps) {
  const theme = useTheme()
  const host = useRef<ScrollingSvgHandle | null>(null)
  const chart = useRef<EChartsType | null>(null)
  const size = useRef({ width: 0, height: 0 })
  const [width, setWidth] = useState(0)
  const product = appearance === 'product'
  const fadeId = `pulse-fade-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const [reducedMotion, setReducedMotion] = useState(true)
  const [active, setActive] = useState(AppState.currentState === 'active')
  const windowMillis = endTimeMs - startTimeMs
  const canvas = useMemo(() => createPulseCanvas(width, windowMillis, endTimeMs), [width, windowMillis, endTimeMs])
  const pixelsPerMs = canvas.pixelsPerMs
  const canvasWidth = product ? canvas.width : width
  const canScroll = product && scrolling && active && !reducedMotion

  useEffect(() => {
    let mounted = true
    let revision = 0
    const motionSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      revision += 1
      setReducedMotion(enabled)
    })
    const appSubscription = AppState.addEventListener('change', (state) => setActive(state === 'active'))
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted && revision === 0) setReducedMotion(enabled)
    }, () => undefined)
    return () => {
      mounted = false
      motionSubscription.remove()
      appSubscription.remove()
    }
  }, [])
  const option = useMemo<PulseChartOption>(() => {
    const tone = theme.colors.brand.action
    return {
      animation: false,
      grid: { left: product ? 4 : 12, right: 12, top: product ? 8 : 16, bottom: product ? 8 : 16 },
      xAxis: {
        type: 'value', min: product ? canvas.minimumTimeMs : startTimeMs, max: product ? canvas.maximumTimeMs : endTimeMs,
        axisLine: { show: false },
        axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false },
      },
      yAxis: {
        type: 'value', min: minimum, max: maximum, interval: (maximum - minimum) / 2,
        axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false },
        splitLine: { show: !product, lineStyle: { color: theme.roles.divider } },
      },
      series: [{
        id: 'pulse', type: 'line', data: points, showSymbol: false, silent: true,
        connectNulls: false, smooth: false, clip: true,
        lineStyle: {
          width: product ? 2.5 : 2, cap: 'round', join: 'round',
          color: product ? tone : theme.colors.brand.primary,
        },
        emphasis: { disabled: true },
      }],
    }
  }, [points, startTimeMs, endTimeMs, minimum, maximum, product, theme, canvas])

  useEffect(() => {
    if (!host.current || width <= 0 || height <= 0) return
    host.current.prepareUpdate()
    if (!chart.current) {
      chart.current = init(host.current, undefined, { renderer: 'svg', width: canvasWidth, height })
    } else if (size.current.width !== canvasWidth || size.current.height !== height) {
      chart.current.resize({ width: canvasWidth, height })
    }
    size.current = { width: canvasWidth, height }
    chart.current.setOption(option)
  }, [width, canvasWidth, height, option, canScroll])

  useEffect(() => () => {
    chart.current?.dispose()
    chart.current = null
  }, [])

  /** 仅在实际宽度变化时调整画布，数据更新不触发布局状态。 */
  function handleLayout(event: LayoutChangeEvent) {
    const nextWidth = event.nativeEvent.layout.width
    setWidth((previous) => previous === nextWidth ? previous : nextWidth)
  }

  return (
    <ChartFrame onLayout={handleLayout} style={{ height, backgroundColor: product ? theme.colors.surface.default : theme.colors.surface.subtle }} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <ScrollingSvgChart ref={host} width={canvasWidth} height={height} originOffset={product ? canvas.originOffset : 0} pixelsPerMs={pixelsPerMs} endTimeMs={endTimeMs} scrolling={canScroll} product={product} />
      {product && width > 16 && (
        <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none" accessible={false}>
          <Defs>
            <LinearGradient id={fadeId} x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0" stopColor={theme.colors.surface.default} stopOpacity={1} />
              <Stop offset="1" stopColor={theme.colors.surface.default} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={4} y={8} width={(width - 16) * 0.14} height={Math.max(0, height - 16)} fill={`url(#${fadeId})`} />
          <Line x1={4} x2={width - 12} y1={height - 8} y2={height - 8} stroke={theme.colors.border.default} strokeOpacity={0.7} />
        </Svg>
      )}
      {points.length < 2 && emptyMessage !== '' && (
        <ChartPlaceholder pointerEvents="none"><AppText tone="secondary" variant="caption">{emptyMessage}</AppText></ChartPlaceholder>
      )}
    </ChartFrame>
  )
})
