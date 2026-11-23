/** 历史正向健康读数的独立 ECharts 原生 SVG；不复用脉搏波幅值翻转。 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, View, type GestureResponderEvent } from 'react-native'
import SvgChart, { SVGRenderer } from '@wuba/react-native-echarts/svgChart'
import { init, use } from 'echarts/core'
import type { ComposeOption, EChartsType } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import type { LineSeriesOption } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent, MarkPointComponent } from 'echarts/components'
import type { GridComponentOption, LegendComponentOption, TooltipComponentOption, MarkPointComponentOption } from 'echarts/components'
import { useTheme } from 'styled-components/native'
import { AppText } from '@/shared/components/AppText'
import { formatBeijingDateTime } from '@/shared/dateTime'
import { formatHistoryNumber } from '../historyModel'
import type { HistoryRange, HistoryRecord, HistoryStatistic } from '../historyModel'
import { ChartStage, LegendButton, LegendRow, LegendStroke, ReadingTooltip } from './styles'

use([LineChart, GridComponent, LegendComponent, TooltipComponent, MarkPointComponent, SVGRenderer])
type TrendOption = ComposeOption<LineSeriesOption | GridComponentOption | LegendComponentOption | TooltipComponentOption | MarkPointComponentOption>

/** 当前筛选结果的纯展示输入，不承担认证、查询或医学判断。 */
export interface HistoryTrendProps {
  /** 按测量时间正序排列的实际区间记录，不补零或补造日期。 */
  records: readonly HistoryRecord[]
  /** 与 records 同源、按读数组件顺序排列的区间统计。 */
  statistics: readonly HistoryStatistic[]
  /** 已提交的含首尾日历区间，用于保持真实日期坐标边界。 */
  range: HistoryRange
  /** 各读数组件的本地化名称，血压依次为收缩压和舒张压。 */
  labels: readonly string[]
  /** 当前指标单位，供交互提示显示。 */
  unit: string
  /** 纵轴下界、上界及刻度间隔，不用于推断健康等级。 */
  domain: readonly [number, number, number]
  /** 最高值标记的本地化语义名称，图中以同色上三角表示。 */
  maximumLabel: string
  /** 最低值标记的本地化语义名称，图中以同色下三角表示。 */
  minimumLabel: string
  /** 最高最低相等时的合并语义名称，图中以双三角表示。 */
  combinedLabel: string
  /** 趋势区域的完整无障碍说明。 */
  accessibilityLabel: string
  /** 图例显隐操作的无障碍说明。 */
  legendAccessibility: string
}


/** 图例仅操作曲线、面积和极值，统计始终由调用方的筛选结果决定。 */
export function HistoryTrend(props: HistoryTrendProps) {
  const theme = useTheme()
  const host = useRef<HTMLElement | null>(null)
  const chart = useRef<EChartsType | null>(null)
  const [width, setWidth] = useState(0)
  const opacity = useRef(new Animated.Value(0)).current
  const rendered = useRef(false)
  const entered = useRef(false)
  const [initialized, setInitialized] = useState(false)
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null)
  const readingId = useRef(0)
  const [reading, setReading] = useState<{
    /** 本次点击标识，隔离已撤下浮层的迟到布局。 */
    id: number
    /** 点击时图表配置的身份，更新后不再展示旧内容。 */
    option: TrendOption
    /** 点击时区域宽度，尺寸变化后撤下旧定位。 */
    width: number
    /** 当前区间实际记录的索引。 */
    index: number
    /** 选中点在图表内的横向位置，单位 dp。 */
    x: number
    /** 选中点在图表内的纵向位置，单位 dp。 */
    y: number
    /** 浮层自然尺寸，首次测量前不显示。 */
    size: { width: number; height: number } | null
  } | null>(null)
  const selectionKey = JSON.stringify([props.range.from, props.range.to, props.records.map((record) => record.id), props.labels])
  const [legendState, setLegendState] = useState<{ selectionKey: string; hidden: readonly number[] }>({ selectionKey, hidden: [] })
  const hidden = legendState.selectionKey === selectionKey ? legendState.hidden : []
  const lastPoint = useRef<number | null>(null)
  /** 按下位置确定触摸坐标，横向意图明确后才阻止父页面接管。 */
  const touch = useRef<{ pageX: number; pageY: number; x: number; dragging: boolean } | null>(null)
  const colors = [theme.colors.brand.primary, theme.colors.brand.gradient.end]

  useEffect(() => {
    let mounted = true
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      if (mounted) setReduceMotion(enabled)
    })
    void AccessibilityInfo.isReduceMotionEnabled().then(
      (enabled) => { if (mounted) setReduceMotion(enabled) },
      () => { if (mounted) setReduceMotion(true) },
    )
    return () => {
      mounted = false
      subscription.remove()
      opacity.stopAnimation()
    }
  }, [opacity])

  useEffect(() => {
    if (!initialized || reduceMotion === null) return
    if (reduceMotion) {
      entered.current = true
      opacity.stopAnimation()
      opacity.setValue(1)
      return
    }
    if (entered.current) return
    entered.current = true
    Animated.timing(opacity, {
      toValue: 1,
      duration: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [initialized, opacity, reduceMotion])

  useEffect(() => {
    setLegendState((previous) => previous.selectionKey === selectionKey ? previous : { selectionKey, hidden: [] })
  }, [selectionKey])
  const option = useMemo<TrendOption>(() => ({
    animation: reduceMotion === false,
    animationDuration: 350,
    animationDurationUpdate: 350,
    animationEasing: 'cubicOut',
    animationEasingUpdate: 'cubicOut',
    useUTC: true,
    grid: { left: 0, right: 36, top: 52, bottom: 28 },
    legend: { show: false, data: props.labels.slice(), selected: Object.fromEntries(props.labels.map((label, index) => [label, !hidden.includes(index)])) },
    tooltip: {
      trigger: 'axis', triggerOn: 'none', showContent: false,
      axisPointer: { type: 'line', snap: true, animation: false, lineStyle: { color: theme.colors.text.muted, type: 'dashed' } },
    },
    xAxis: {
      type: 'time', min: Date.parse(`${props.range.from}T00:00:00+08:00`), max: Date.parse(`${props.range.to}T23:59:59.999+08:00`), splitNumber: props.range.from === props.range.to ? 4 : 3,
      axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
      axisLabel: { color: theme.colors.text.muted, fontSize: 11, hideOverlap: true, showMinLabel: true, alignMinLabel: 'left', formatter: (value: number) => formatBeijingDateTime(value, props.range.from === props.range.to ? 'time' : 'axisDate') },
    },
    yAxis: {
      type: 'value', position: 'right', min: props.domain[0], max: props.domain[1], interval: props.domain[2],
      axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: theme.colors.text.muted, fontSize: 11 },
      splitLine: { lineStyle: { color: theme.colors.border.default, type: 'dashed' } },
    },
    series: props.labels.map((label, component) => {
      const color = component === 0 ? theme.colors.brand.primary : theme.colors.brand.gradient.end
      // zrender 只将 rgba 的透明度拆成 stop-opacity，八位十六进制会被原生初帧忽略。
      const transparentColor = `rgba(${parseInt(color.slice(1, 3), 16)},${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)},0)`
      const statistic = props.statistics[component]
      /** 极值绑定首条位置，以同色图标和数值标注，相等时合并。 */
      const mark = (record: HistoryRecord, value: number, text: string, icon: '▲' | '▼' | '▲▼', position: 'top' | 'bottom') => {
        const index = props.records.indexOf(record)
        return { name: text, coord: [Date.parse(record.measuredAt), value], value, label: { formatter: `{icon|${icon}} ${formatHistoryNumber(value)}`, position, align: index === 0 ? 'left' as const : index >= props.records.length - 2 ? 'right' as const : 'center' as const } }
      }
      return {
        id: `history-${component}`, name: label, type: 'line' as const,
        data: props.records.map((record) => [Date.parse(record.measuredAt), record.values[component]]),
        showSymbol: false, symbol: 'circle', symbolSize: 7, smooth: .3, smoothMonotone: 'x' as const, connectNulls: false,
        lineStyle: { width: 2.5, color, type: component === 0 ? 'solid' as const : 'dashed' as const },
        areaStyle: { origin: 'start' as const, opacity: .28, color: { type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color }, { offset: 1, color: transparentColor }] } },
        itemStyle: { color: theme.colors.surface.default, borderWidth: 2, borderColor: color },
        emphasis: { scale: 1.5, itemStyle: { color: theme.colors.surface.default, borderWidth: 2, borderColor: color } },
        markPoint: {
          symbolSize: 0, silent: true,
          label: { color: theme.colors.text.secondary, fontSize: 11, distance: 6, backgroundColor: `${theme.colors.surface.default}E6`, padding: [3, 5], borderRadius: 5, rich: { icon: { color, fontSize: 10 } } },
          data: statistic.minimum === statistic.maximum
            ? [mark(statistic.maximumRecord, statistic.maximum, props.combinedLabel, '▲▼', 'top')]
            : [mark(statistic.maximumRecord, statistic.maximum, props.maximumLabel, '▲', 'top'), mark(statistic.minimumRecord, statistic.minimum, props.minimumLabel, '▼', 'bottom')],
        },
      }
    }),
  }), [props, theme, hidden, reduceMotion])

  useEffect(() => {
    if (!host.current || width <= 0) return
    if (!chart.current) {
      const instance = init(host.current, undefined, { renderer: 'svg', width, height: 232 })
      chart.current = instance
      // 正尺寸布局和首次实际绘制完成后才入场，筛选及交互更新不重播。
      const onFinished = () => {
        if (!rendered.current) {
          rendered.current = true
          setInitialized(true)
        }
        instance.off('finished', onFinished)
      }
      instance.on('finished', onFinished)
    } else if (chart.current.getWidth() !== width) chart.current.resize({ width, height: 232 })
    chart.current.dispatchAction({ type: 'downplay' })
    chart.current.dispatchAction({ type: 'hideTip' })
    // 首帧沿用原生渐入，后续保留系列身份以执行 ECharts 更新动画并移除旧系列。
    chart.current.setOption({ ...option, animationDuration: rendered.current ? 350 : 0 }, { replaceMerge: ['series'] })
    lastPoint.current = null
    touch.current = null
    setReading(null)
  }, [option, width])

  useEffect(() => () => {
    chart.current?.dispose()
    chart.current = null
  }, [])

  /** 原生触摸选择最近的实际记录，提示不补造缺失日期。 */
  function showReading(x: number) {
    const instance = chart.current
    if (!instance || props.records.length === 0 || hidden.length === props.labels.length) return
    const timestamp = instance.convertFromPixel({ xAxisIndex: 0 }, x) as number
    if (!Number.isFinite(timestamp)) return
    let nearest = 0
    for (let index = 1; index < props.records.length; index += 1) {
      if (Math.abs(Date.parse(props.records[index].measuredAt) - timestamp) < Math.abs(Date.parse(props.records[nearest].measuredAt) - timestamp)) nearest = index
    }
    if (lastPoint.current === nearest) return
    if (lastPoint.current !== null) instance.dispatchAction({ type: 'downplay', dataIndex: lastPoint.current })
    lastPoint.current = nearest
    const seriesIndex = props.labels.findIndex((_, index) => !hidden.includes(index))
    const record = props.records[nearest]
    const point = instance.convertToPixel({ seriesIndex }, [Date.parse(record.measuredAt), record.values[seriesIndex]]) as number[]
    if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return
    instance.dispatchAction({ type: 'highlight', dataIndex: nearest })
    instance.dispatchAction({ type: 'showTip', seriesIndex, dataIndex: nearest })
    const id = ++readingId.current
    setReading((previous) => ({ id, option, width, index: nearest, x: point[0], y: point[1], size: previous?.size ?? null }))
  }

  /** 仅接管明确的横向拖动，纵向移动继续由外层页面滚动处理。 */
  function shouldDrag(event: GestureResponderEvent) {
    const start = touch.current
    if (!start || event.nativeEvent.touches.length !== 1) return false
    const dx = event.nativeEvent.pageX - start.pageX
    const dy = event.nativeEvent.pageY - start.pageY
    return Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)
  }

  /** 以按下时的图表坐标加绝对位移选点，不依赖 SVG 子元素的局部坐标。 */
  function dragReading(event: GestureResponderEvent) {
    const start = touch.current
    if (!start) return
    start.dragging = true
    showReading(start.x + event.nativeEvent.pageX - start.pageX)
  }

  // 同一帧即撤下旧筛选或旧尺寸的内容，不等待图表更新 effect。
  const activeReading = reading?.option === option && reading.width === width ? reading : null
  const record = activeReading ? props.records[activeReading.index] : null
  const tooltipSize = activeReading?.size
  const tooltipLeft = activeReading && tooltipSize
    ? Math.max(8, Math.min(width - tooltipSize.width - 8, activeReading.x + 12 + tooltipSize.width <= width - 8 ? activeReading.x + 12 : activeReading.x - tooltipSize.width - 12))
    : 8
  const tooltipTop = activeReading && tooltipSize
    ? Math.max(8, Math.min(232 - tooltipSize.height - 8, activeReading.y - tooltipSize.height / 2))
    : 8

  return (
    <ChartStage style={{ opacity }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View
        accessible accessibilityRole="image" accessibilityLabel={props.accessibilityLabel} style={{ height: 232 }}
        onTouchStart={(event) => {
          const { pageX, pageY, locationX, touches } = event.nativeEvent
          touch.current = touches.length === 1 ? { pageX, pageY, x: locationX, dragging: false } : null
          if (touch.current) showReading(locationX)
        }}
        onStartShouldSetResponder={() => false}
        onMoveShouldSetResponder={shouldDrag}
        onResponderGrant={dragReading}
        onResponderMove={dragReading}
        onResponderTerminationRequest={() => false}
        onResponderRelease={(event) => { dragReading(event); touch.current = null }}
        onResponderTerminate={() => { touch.current = null }}
        onTouchCancel={() => { touch.current = null }}
        onTouchEnd={(event) => {
          const start = touch.current
          if (!start || start.dragging) return
          if (Math.abs(event.nativeEvent.pageX - start.pageX) < 6 && Math.abs(event.nativeEvent.pageY - start.pageY) < 6) showReading(start.x)
          touch.current = null
        }}
      >
        <View pointerEvents="none"><SvgChart ref={host} handleGesture={false} style={{ width, height: 232 }} /></View>
      </View>
      <LegendRow accessibilityLabel={props.legendAccessibility}>
        {props.labels.map((label, index) => (
          <LegendButton key={label} accessibilityRole="button" accessibilityState={{ selected: !hidden.includes(index) }} onPress={() => setLegendState({ selectionKey, hidden: hidden.includes(index) ? hidden.filter((item) => item !== index) : [...hidden, index] })} style={{ opacity: hidden.includes(index) ? .4 : 1 }}>
            <LegendStroke style={{ borderColor: colors[index], borderStyle: index === 0 ? 'solid' : 'dashed' }} />
            <AppText variant="caption" tone="secondary">{label}</AppText>
          </LegendButton>
        ))}
      </LegendRow>
      {activeReading && record ? (
        <ReadingTooltip
          pointerEvents="none"
          onLayout={(event) => {
            const { width: tooltipWidth, height } = event.nativeEvent.layout
            setReading((previous) => previous?.id === activeReading.id
              && (previous.size?.width !== tooltipWidth || previous.size.height !== height)
              ? { ...previous, size: { width: tooltipWidth, height } }
              : previous)
          }}
          style={{
            left: tooltipLeft,
            top: tooltipTop,
            maxWidth: Math.max(0, width - 16),
            opacity: tooltipSize ? 1 : 0,
            boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 16, color: `${theme.colors.text.primary}1F` }],
          }}
        >
          <AppText variant="caption">{formatBeijingDateTime(record.measuredAt, 'fullDateTime')}</AppText>
          {record.values.map((value, component) => (
            <AppText key={component} variant="caption">{`${props.labels[component]}  ${formatHistoryNumber(value)} ${props.unit}`}</AppText>
          ))}
        </ReadingTooltip>
      ) : null}
    </ChartStage>
  )
}
