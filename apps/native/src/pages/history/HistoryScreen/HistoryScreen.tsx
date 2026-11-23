/** 当前账号真实历史筛选、受控日历及同源记录浮层。 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, FlatList, Modal, ScrollView, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useStore } from '@nanostores/react'
import { useTheme } from 'styled-components/native'
import Svg, { Path } from 'react-native-svg'
import { useAuthState } from '@/app/auth/useAuthState'
import type { ProductTabParamList } from '@/app/navigation/types'
import { AppText } from '@/shared/components/AppText'
import { ActionButton } from '@/shared/components/ActionButton'
import { PageContainer } from '@/shared/components/PageContainer'
import { InsetTrack } from '@/shared/components/InsetTrack'
import { SelectionSheet } from '@/shared/components/SelectionSheet'
import { LoadingIndicator } from '@/shared/components/LoadingIndicator'
import { ArrowLeft, ArrowRight, ChevronRight, X } from '@/shared/graphics'
import { formatBeijingDateTime } from '@/shared/dateTime'
import { historyMessages } from '../historyMessages'
import { HistoryTrend } from '../HistoryTrend'
import { HISTORY_METRICS, HISTORY_PERIODS, adjacentHistoryMetric, calendarMonthCells, commitHistoryRange, formatHistoryNumber, initialHistoryFilter, isValidHistoryRange, moveCalendarMonth, moveHistoryPeriod, selectHistoryPeriod, selectHistoryView } from '../historyModel'
import type { HistoryMetric, HistoryRecord, HistoryRange } from '../historyModel'
import { formatHistoryValue } from '../historyModel'
import { useHistoryInterval } from '../useHistoryInterval'
import { CalendarCell, CalendarGrid, CalendarHighlight, CalendarOption, Empty, MetricChoice, MetricHeader, Neighbour, PeriodButton, PeriodHighlight, PeriodLabel, PeriodTrack, RecordButton, RecordsSurface, Row, Scrim, Sheet, SheetHeader, Slider, StatisticCard, StatisticExtremes, StatisticsRow, TextButton } from './styles'

type Overlay = 'metrics' | 'calendar' | 'all' | 'detail' | null

/** 原生 SVG 的日期入口，沿用共享线性图标的线宽与主题。 */
function CalendarIcon() {
  const theme = useTheme()
  return <Svg width={15} height={15} viewBox="0 0 24 24" accessible={false}><Path d="M8 3v4m8-4v4M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" fill="none" stroke={theme.colors.brand.action} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
}

/** 认证、入口参数和筛选均在本页面组合，不复制认证事实或存储读数。 */
export function HistoryScreen({ route, navigation }: BottomTabScreenProps<ProductTabParamList, 'History'>) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const messages = useStore(historyMessages)
  const auth = useAuthState()
  const focused = useIsFocused()
  const [filter, setFilter] = useState(initialHistoryFilter)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [recordId, setRecordId] = useState<string | null>(null)
  const [detailFromAll, setDetailFromAll] = useState(false)
  const [draft, setDraft] = useState<HistoryRange>({ from: filter.from, to: filter.to })
  const [calendarField, setCalendarField] = useState<'from' | 'to'>('from')
  const [month, setMonth] = useState(filter.from.slice(0, 7))
  const [calendarMode, setCalendarMode] = useState<'day' | 'month' | 'year'>('day')
  const [yearPage, setYearPage] = useState(2016)
  const [dateError, setDateError] = useState(false)
  const [dateSelected, setDateSelected] = useState(false)
  const [periodWidth, setPeriodWidth] = useState(0)
  const periodStep = (periodWidth - 4) / 4
  const slider = useRef(new Animated.Value(1)).current
  const [labelOpacity] = useState(() => HISTORY_PERIODS.map((period) => new Animated.Value(filter.period === period ? 1 : 0)))
  const interval = useHistoryInterval(filter, focused)
  const view = useMemo(() => selectHistoryView(auth, filter, interval.data, recordId), [auth, filter, interval.data, recordId])
  const loading = auth.status === 'authenticated' && (interval.fetching || (!view.complete && !interval.error))
  const names: Record<HistoryMetric, string> = { bloodPressure: messages.bloodPressure, heartRate: messages.heartRate, respirationRate: messages.respirationRate, oxygenSaturation: messages.oxygenSaturation, diabetesRisk: messages.diabetesRisk }
  const labels = filter.metric === 'bloodPressure' ? [messages.systolic, messages.diastolic] : [names[filter.metric]]
  const unit = filter.metric === 'bloodPressure' ? messages.bloodPressureUnit : filter.metric === 'oxygenSaturation' ? messages.oxygenUnit : filter.metric === 'diabetesRisk' ? '' : messages.rateUnit
  const low = Math.min(...view.statistics.map((item) => item.minimum))
  const high = Math.max(...view.statistics.map((item) => item.maximum))
  const step = view.statistics.length ? Math.max(1, Math.ceil((high - low || Math.abs(high) * .1 || 1) / 3)) : 1
  const domain: readonly [number, number, number] = view.statistics.length ? [Math.floor(low / step) * step - step, Math.ceil(high / step) * step + step, step] : [0, 1, 1]
  const previousMetric = adjacentHistoryMetric(filter.metric, -1)
  const nextMetric = adjacentHistoryMetric(filter.metric, 1)
  const emptyMessage = messages.emptyInterval({ metric: names[filter.metric] })
  const rangeLabel = filter.from === filter.to ? filter.from.replaceAll('-', '.') : `${filter.from.replaceAll('-', '.')} — ${filter.to.replaceAll('-', '.')}`
  const periodLabels = [messages.day, messages.sevenDays, messages.thirtyDays, messages.customPeriod]

  useEffect(() => {
    if (route.params?.metric === undefined) return
    const { metric, day } = route.params
    setFilter((current) => day ? { metric: metric!, period: 1, anchor: day, from: day, to: day } : { ...current, metric: metric! })
    setOverlay(null)
    setRecordId(null)
    navigation.setParams({ metric: undefined, day: undefined, requestId: undefined })
  }, [route.params?.metric, route.params?.day, route.params?.requestId, navigation])

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(slider, { toValue: HISTORY_PERIODS.indexOf(filter.period), duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ...HISTORY_PERIODS.map((period, index) => Animated.timing(labelOpacity[index], { toValue: filter.period === period ? 1 : 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true })),
    ])
    animation.start()
    return () => animation.stop()
  }, [filter.period, slider, labelOpacity])

  useEffect(() => {
    if (auth.status !== 'authenticated') {
      setRecordId(null)
      setOverlay((current) => current === 'detail' ? null : current)
    }
  }, [auth.status])

  useEffect(() => {
    if (!focused) {
      setOverlay(null)
      setRecordId(null)
    }
  }, [focused])

  /** 指标切换只改指标，保留已提交日期与周期。 */
  function chooseMetric(metric: HistoryMetric) {
    setFilter((current) => ({ ...current, metric }))
    setRecordId(null)
    setOverlay(null)
  }

  /** 新打开时从已提交范围建立草稿，关闭不会提交。 */
  function openCalendar() {
    setDraft({ from: filter.from, to: filter.to })
    setMonth(filter.from.slice(0, 7))
    setCalendarField('from')
    setCalendarMode('day')
    setDateError(false)
    setDateSelected(false)
    setOverlay('calendar')
  }

  /** 未点选日期时原样返回，只有有效的显式日期选择才提交自定义区间。 */
  function confirmCalendar() {
    if (!dateSelected) { setOverlay(null); return }
    if (!isValidHistoryRange(draft)) { setDateError(true); return }
    setFilter((current) => commitHistoryRange(current, draft))
    setOverlay(null)
  }

  /** 箭头根据当前面板浏览月份、年份或十二年区间，不提交日期草稿。 */
  function moveCalendar(direction: -1 | 1) {
    if (calendarMode === 'year') setYearPage((current) => current + direction * 12)
    else if (calendarMode === 'month') setMonth((current) => `${Number(current.slice(0, 4)) + direction}${current.slice(4)}`)
    else setMonth((current) => moveCalendarMonth(current, direction))
  }

  /** 全部列表中的详情返回仍停留原完整列表，主列表详情关闭返回主页面。 */
  function closeOverlay() {
    if (overlay === 'detail' && detailFromAll) setOverlay('all')
    else setOverlay(null)
    setRecordId(null)
  }

  /** 所有入口只保存稳定记录标识，读数每次重新按当前认证及范围派生。 */
  function openRecord(record: HistoryRecord, fromAll: boolean) {
    setRecordId(record.id)
    setDetailFromAll(fromAll)
    setOverlay('detail')
  }

  /** 主列表与虚拟化完整列表共用同一行及详情入口。 */
  function recordRow(record: HistoryRecord, index: number, total: number, fromAll: boolean) {
    return <RecordButton key={record.id} $divider={index < total - 1} accessibilityRole="button" onPress={() => openRecord(record, fromAll)} android_ripple={{ color: theme.colors.brand.subtle }}>
      <View style={{ flex: 1 }}><AppText variant="label">{formatBeijingDateTime(record.measuredAt, 'date')}</AppText><AppText variant="caption" tone="secondary">{formatBeijingDateTime(record.measuredAt, 'time')}</AppText></View>
      <View style={{ flex: 1, alignItems: 'flex-end' }}><AppText variant={record.metric === 'diabetesRisk' ? 'section' : undefined} numberOfLines={record.metric === 'diabetesRisk' ? 2 : undefined} style={record.metric === 'diabetesRisk' ? { fontSize: 20, lineHeight: 26, textAlign: 'center' } : { fontSize: 20, lineHeight: 26, fontWeight: '500' }}>{record.values.map((value) => formatHistoryValue(record, value)).join(' / ')}</AppText>{unit !== '' && <AppText variant="caption" tone="secondary">{unit}</AppText>}</View>
      <ChevronRight size={18} color={theme.colors.text.muted} />
    </RecordButton>
  }

  const overlayTitle = overlay === 'calendar' ? messages.chooseDates : overlay === 'detail' ? messages.recordDetail : messages.allRecords

  return <>
    <PageContainer backgroundVariant="home" edges={['top', 'left', 'right']} contentContainerStyle={{ paddingTop: 12, paddingHorizontal: theme.layout.pageGutter, paddingBottom: 8, gap: 0 }}>
      <MetricHeader>
        <Neighbour disabled={previousMetric === null} accessibilityRole="button" onPress={() => previousMetric && chooseMetric(previousMetric)}>{previousMetric && <AppText variant="caption" tone="secondary">{names[previousMetric]}</AppText>}</Neighbour>
        <MetricChoice onPress={() => setOverlay('metrics')} accessibilityRole="button" accessibilityLabel={messages.chooseMetric} accessibilityState={{ expanded: overlay === 'metrics' }}><AppText style={{ fontSize: 20, lineHeight: 28, fontWeight: '600', color: theme.colors.brand.action }}>{names[filter.metric]}</AppText><ChevronRight size={16} color={theme.colors.brand.action} style={{ position: 'absolute', right: 8, transform: [{ rotate: '90deg' }] }} /></MetricChoice>
        <Neighbour disabled={nextMetric === null} accessibilityRole="button" onPress={() => nextMetric && chooseMetric(nextMetric)} style={{ alignItems: 'flex-end' }}>{nextMetric && <AppText variant="caption" tone="secondary">{names[nextMetric]}</AppText>}</Neighbour>
      </MetricHeader>
      <PeriodTrack onLayout={(event) => setPeriodWidth(event.nativeEvent.layout.width)}>
        {periodWidth > 0 && <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0 }}><InsetTrack width={periodWidth} height={52} /></View>}
        {periodWidth > 0 && <Slider pointerEvents="none" style={{ width: periodStep - 4, transform: [{ translateX: Animated.multiply(slider, periodStep) }], boxShadow: `0px 2px 4px ${theme.colors.brand.action}2E, 2px 4px 12px ${theme.colors.text.primary}11` }}><InsetTrack width={periodStep - 4} height={44} highlighted recessed={false} /></Slider>}
        {HISTORY_PERIODS.map((period, index) => <PeriodButton key={period ?? 'custom'} hitSlop={{ top: 2, bottom: 2 }} accessibilityRole="button" accessibilityLabel={periodLabels[index]} accessibilityState={{ selected: filter.period === period }} onPress={() => period === null ? openCalendar() : setFilter((current) => selectHistoryPeriod(current, period))}><PeriodLabel><AppText variant="label" tone="secondary">{periodLabels[index]}</AppText><PeriodHighlight pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ opacity: labelOpacity[index] }}><AppText variant="label" style={{ color: theme.colors.surface.default }}>{periodLabels[index]}</AppText></PeriodHighlight></PeriodLabel></PeriodButton>)}
      </PeriodTrack>
      <Row style={{ marginTop: 4, marginBottom: 8 }}>
        {filter.period !== null && <TextButton onPress={() => setFilter((current) => moveHistoryPeriod(current, -1))} accessibilityRole="button" accessibilityLabel={messages.previousPeriod}><ArrowLeft size={18} color={theme.colors.brand.action} /></TextButton>}
        <TextButton style={{ flex: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 0 }} onPress={openCalendar} accessibilityRole="button" accessibilityLabel={messages.chooseDates}><AppText variant="caption">{rangeLabel}</AppText><CalendarIcon /></TextButton>
        {filter.period !== null && <TextButton onPress={() => setFilter((current) => moveHistoryPeriod(current, 1))} accessibilityRole="button" accessibilityLabel={messages.nextPeriod}><ArrowRight size={18} color={theme.colors.brand.action} /></TextButton>}
      </Row>
      {loading ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><LoadingIndicator size={36} /></View>
        : !view.complete || view.all.length === 0 ? <Empty style={{ flex: 1 }}>
          <AppText style={{ fontSize: 16, lineHeight: 24, fontWeight: '500', textAlign: 'center' }}>{interval.error && !view.complete ? messages.loadFailed : emptyMessage}</AppText>
          {!(interval.error && !view.complete) && <AppText variant="caption" tone="secondary">{filter.metric === 'diabetesRisk' ? messages.emptyAssessmentHint : messages.emptyMeasurementHint}</AppText>}
          <TextButton style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="button" onPress={interval.error && !view.complete ? interval.refresh : () => navigation.navigate('Features')}>
            <AppText variant="label" style={{ color: theme.colors.brand.action }}>{interval.error && !view.complete ? messages.retry : messages.measure}</AppText><ArrowRight size={16} color={theme.colors.brand.action} />
          </TextButton>
        </Empty> : <>
      <Row><AppText style={{ fontSize: 16, lineHeight: 24, fontWeight: '500' }}>{filter.metric === 'diabetesRisk' ? messages.assessmentRecords : `${names[filter.metric]}${messages.trend}`}</AppText><AppText variant="caption" tone="secondary">{view.all.length} {messages.recordCount}</AppText></Row>
      {filter.metric !== 'diabetesRisk' && focused && <HistoryTrend records={view.records} statistics={view.statistics} range={filter} labels={labels} unit={unit} domain={domain} maximumLabel={messages.maximum} minimumLabel={messages.minimum} combinedLabel={messages.combinedExtreme} accessibilityLabel={messages.chartAccessibility} legendAccessibility={messages.legendAccessibility} />}
      {view.statistics.length > 0 && <StatisticsRow style={{ marginTop: 16 }}>{view.statistics.map((statistic, index) => <StatisticCard key={labels[index]}>
        <AppText variant="label" tone="secondary">{messages.average}{labels[index]}</AppText>
        <Row style={{ justifyContent: 'flex-start', alignItems: 'flex-end', gap: 4, marginTop: 8 }}><AppText variant="display">{formatHistoryNumber(statistic.average)}</AppText><AppText variant="caption" tone="secondary" style={{ marginBottom: 6 }}>{unit}</AppText></Row>
        <StatisticExtremes>{(['maximum', 'minimum'] as const).map((kind) => <Row key={kind} style={{ alignItems: 'center', gap: 4 }}>
          <Row style={{ justifyContent: 'flex-start', gap: 4 }}><Svg width={10} height={10} viewBox="0 0 10 10" accessible={false}><Path d={kind === 'maximum' ? 'M5 1 10 9H0Z' : 'M0 1h10L5 9Z'} fill={index === 0 ? theme.colors.brand.primary : theme.colors.brand.gradient.end} /></Svg><AppText variant="caption" tone="secondary" style={{ lineHeight: 18 }}>{messages[kind]}</AppText></Row>
          <AppText variant="caption" style={{ lineHeight: 18 }}>{formatHistoryNumber(statistic[kind])} <AppText variant="caption" tone="secondary">{unit}</AppText></AppText>
        </Row>)}</StatisticExtremes>
      </StatisticCard>)}</StatisticsRow>}
      <Row style={{ marginTop: 10, marginBottom: 4 }}><AppText style={{ fontSize: 16, lineHeight: 24, fontWeight: '500' }}>{filter.metric === 'diabetesRisk' ? messages.recentAssessments : messages.recentMeasurements}</AppText><TextButton disabled={view.all.length === 0} style={{ opacity: view.all.length === 0 ? .4 : 1 }} onPress={() => setOverlay('all')} accessibilityRole="button"><AppText variant="caption" style={{ color: theme.colors.brand.action }}>{messages.viewAll}</AppText></TextButton></Row>
      {view.recent.length > 0 ? <RecordsSurface>{view.recent.map((record, index) => recordRow(record, index, view.recent.length, false))}</RecordsSurface> : <AppText variant="caption" tone="secondary" style={{ textAlign: 'center', paddingVertical: 24 }}>{emptyMessage}</AppText>}
      </>}
      {!loading && !interval.error && <AppText variant="caption" tone="secondary" style={{ lineHeight: 18, textAlign: 'center', marginTop: 20, marginBottom: 4 }}>{messages.disclaimer}</AppText>}
    </PageContainer>
    <SelectionSheet visible={focused && overlay === 'metrics'} title={messages.chooseMetric} cancelLabel={messages.cancel} confirmLabel={messages.confirm} value={filter.metric} options={HISTORY_METRICS.map((metric) => ({ value: metric, label: names[metric] }))} onCancel={closeOverlay} onConfirm={chooseMetric} />
    <Modal visible={focused && overlay !== null && overlay !== 'metrics'} transparent animationType="fade" onRequestClose={closeOverlay}>
      <Scrim onPress={closeOverlay} style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}>
        <Sheet onStartShouldSetResponder={() => true} accessibilityViewIsModal>
          <SheetHeader $calendar={overlay === 'calendar'}>
            {overlay === 'detail' && detailFromAll ? <TextButton onPress={closeOverlay} accessibilityRole="button" accessibilityLabel={messages.back}><ArrowLeft size={20} color={theme.colors.brand.action} /></TextButton> : null}
            <AppText variant="section" style={{ flex: 1, ...(overlay === 'calendar' ? { textAlign: 'center', fontWeight: '700' } as const : {}) }}>{overlayTitle}</AppText>
            {overlay !== 'calendar' && <TextButton onPress={closeOverlay} accessibilityRole="button" accessibilityLabel={messages.close}><X size={20} color={theme.colors.text.secondary} /></TextButton>}
          </SheetHeader>
          {overlay === 'calendar' && <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16, gap: 12 }} showsVerticalScrollIndicator={false}>
            <Row>{(['from', 'to'] as const).map((field) => <TextButton key={field} style={{ flex: 1, borderRadius: 8, backgroundColor: calendarField === field ? theme.colors.brand.subtle : theme.colors.surface.subtle }} onPress={() => { setCalendarField(field); setMonth(draft[field].slice(0, 7)); setCalendarMode('day') }} accessibilityRole="button" accessibilityState={{ selected: calendarField === field }}><AppText variant="caption" tone="secondary">{field === 'from' ? messages.startDate : messages.endDate}</AppText><AppText variant="label">{draft[field]}</AppText></TextButton>)}</Row>
            <Row>
              <TextButton onPress={() => moveCalendar(-1)} accessibilityRole="button" accessibilityLabel={calendarMode === 'day' ? messages.previousMonth : calendarMode === 'month' ? '上一年' : '上十二年'}><ArrowLeft size={20} color={theme.colors.brand.action} /></TextButton>
              <Row style={{ gap: 0 }}>
                <TextButton onPress={() => { setYearPage(Math.floor(Number(month.slice(0, 4)) / 12) * 12); setCalendarMode((current) => current === 'year' ? 'day' : 'year') }} accessibilityRole="button" accessibilityLabel="选择年份" accessibilityState={{ selected: calendarMode === 'year' }}><AppText variant="section" style={{ color: calendarMode === 'year' ? theme.colors.brand.action : theme.colors.text.primary }}>{calendarMode === 'year' ? `${yearPage}至${yearPage + 11}` : `${month.slice(0, 4)}年`}</AppText></TextButton>
                {calendarMode !== 'year' && <TextButton onPress={() => setCalendarMode((current) => current === 'month' ? 'day' : 'month')} accessibilityRole="button" accessibilityLabel="选择月份" accessibilityState={{ selected: calendarMode === 'month' }}><AppText variant="section" style={{ color: calendarMode === 'month' ? theme.colors.brand.action : theme.colors.text.primary }}>{month.slice(5)}月</AppText></TextButton>}
              </Row>
              <TextButton onPress={() => moveCalendar(1)} accessibilityRole="button" accessibilityLabel={calendarMode === 'day' ? messages.nextMonth : calendarMode === 'month' ? '下一年' : '下十二年'}><ArrowRight size={20} color={theme.colors.brand.action} /></TextButton>
            </Row>
            {calendarMode === 'day' ? <CalendarGrid>{messages.weekdays.split(',').map((weekday: string) => <View key={weekday} style={{ width: '14.285714%', alignItems: 'center', paddingVertical: 8 }}><AppText variant="caption" tone="secondary">{weekday}</AppText></View>)}{calendarMonthCells(month).map((date, index) => <CalendarCell key={date ?? `empty-${index}`} disabled={date === null} accessibilityRole="button" accessibilityLabel={date ?? undefined} accessibilityState={{ selected: date !== null && (date === draft.from || date === draft.to) }} onPress={() => { if (!date) return; setDraft((current) => ({ ...current, [calendarField]: date })); setDateSelected(true); setDateError(false); if (calendarField === 'from') setCalendarField('to') }}><CalendarHighlight $day pointerEvents="none" $selected={date !== null && (date === draft.from || date === draft.to)} $inside={date !== null && date > draft.from && date < draft.to}><AppText variant="label" style={{ color: date === draft.from || date === draft.to ? theme.colors.surface.default : theme.colors.text.primary }}>{date ? Number(date.slice(-2)) : ''}</AppText></CalendarHighlight></CalendarCell>)}</CalendarGrid> : <CalendarGrid>{Array.from({ length: 12 }, (_, index) => {
              const value = calendarMode === 'year' ? yearPage + index : index + 1
              const selected = value === Number(calendarMode === 'year' ? month.slice(0, 4) : month.slice(5))
              return <CalendarOption key={value} onPress={() => { setMonth(calendarMode === 'year' ? `${value}${month.slice(4)}` : `${month.slice(0, 4)}-${String(value).padStart(2, '0')}`); setCalendarMode(calendarMode === 'year' ? 'month' : 'day') }} accessibilityRole="button" accessibilityLabel={`${value}${calendarMode === 'year' ? '年' : '月'}`} accessibilityState={{ selected }}><CalendarHighlight pointerEvents="none" $selected={false} $inside={selected} /><AppText variant="label" style={{ color: selected ? theme.colors.brand.action : theme.colors.text.primary }}>{value}{calendarMode === 'month' ? '月' : ''}</AppText></CalendarOption>
            })}</CalendarGrid>}
            {dateError && <AppText accessibilityRole="alert" variant="caption" style={{ color: theme.colors.feedback.error }}>{messages.invalidRange}</AppText>}
            <Row>
              <View style={{ flex: 1 }}><ActionButton label={messages.cancel} secondary onPress={closeOverlay} /></View>
              <View style={{ flex: 1 }}><ActionButton label={messages.confirm} onPress={confirmCalendar} /></View>
            </Row>
          </ScrollView>}
          {overlay === 'all' && <><AppText variant="caption" tone="secondary" style={{ paddingHorizontal: 16, paddingBottom: 8 }}>{rangeLabel}，共 {view.all.length} {messages.recordCount}</AppText><FlatList data={view.all} keyExtractor={(record) => record.id} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }} initialNumToRender={10} windowSize={5} showsVerticalScrollIndicator={false} renderItem={({ item, index }) => recordRow(item, index, view.all.length, true)} ListEmptyComponent={<Empty><AppText tone="secondary">{emptyMessage}</AppText></Empty>} /></>}
          {overlay === 'detail' && <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} showsVerticalScrollIndicator={false}>{view.detail ? <>
            <AppText variant="caption" tone="secondary">{formatBeijingDateTime(view.detail.measuredAt, 'fullDateTime')}</AppText>
            <AppText variant="section">{names[view.detail.metric]}</AppText>
            <AppText variant={view.detail.metric === 'diabetesRisk' ? 'section' : 'display'} numberOfLines={view.detail.metric === 'diabetesRisk' ? 2 : undefined} style={view.detail.metric === 'diabetesRisk' ? { fontSize: 20, lineHeight: 26, textAlign: 'center' } : undefined}>{view.detail.values.map((value) => formatHistoryValue(view.detail!, value)).join(' / ')}<AppText variant="caption" tone="secondary">{unit ? ` ${unit}` : ''}</AppText></AppText>
            <AppText tone="secondary">{labels.join(' / ')}</AppText>
            <AppText variant="caption" tone="secondary">仅供健康管理参考，非医学诊断依据。</AppText>
          </> : <Empty><AppText tone="secondary">{emptyMessage}</AppText></Empty>}</ScrollView>}
        </Sheet>
      </Scrim>
    </Modal>
  </>
}
