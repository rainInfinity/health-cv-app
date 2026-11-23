/** 简要结果与详情共用的两行两列看板，不推导健康状态。 */

import { useStore } from '@nanostores/react'
import { useState } from 'react'
import type { LayoutChangeEvent } from 'react-native'
import type { MeasurementReport } from '@/app/measurement/resultAdapter'
import { AppText } from '@/shared/components/AppText'
import { HealthIndicatorArtwork } from '@/shared/graphics'
import { formatHealthNumber, formatRiskLevel } from '@/shared/healthNumber'
import { fingertipResultsMessages } from '../fingertipResultsMessages'
import { SignalQualityBadge } from '../SignalQualityBadge'
import { Dashboard, DashboardRow, DialFrame, MetricBody, MetricCard, MetricReading, Reference, RiskReading } from './styles'

/** 读数中性展示，静态参考信息不驱动分级，缺失项仅占位。 */
export function FingertipResultDashboard({ report, detailed = false }: {
  /** 当前轮的真实成员结果。 */
  report?: MeasurementReport | null
  /** 详细报告的风险等级单行展示，简要面板仍为两行。 */
  detailed?: boolean
}) {
  const messages = useStore(fingertipResultsMessages)
  const [dialWidth, setDialWidth] = useState(126)
  function measureDial(event: LayoutChangeEvent) {
    const width = Math.min(126, event.nativeEvent.layout.width)
    if (width > 0) setDialWidth((previous) => previous === width ? previous : width)
  }
  const rows = [['heartRate', 'respirationRate'], ['oxygenSaturation', 'diabetesRisk']] as const
  function metricCard(kind: typeof rows[number][number]) {
    const item = report?.metrics[kind]
    const value = item?.status === 'succeeded' ? item.readings[0]?.value : undefined
    const risk = kind === 'diabetesRisk'
    return (
      <MetricCard key={kind}>
        {item?.quality && <SignalQualityBadge score={item.quality.score} accessibilityLabel={`${messages[`${kind}Name`]}${messages.qualityLabel({ score: formatHealthNumber(item.quality.score) })}`} />}
        <AppText variant="label">{messages[`${kind}Name`]}</AppText>
        <MetricBody style={risk && detailed ? { gap: 0, marginHorizontal: -1 } : undefined}>
          {kind === 'oxygenSaturation' ? (
            <DialFrame onLayout={measureDial} accessible accessibilityLabel={`${messages.oxygenSaturationName} ${value === undefined ? '--' : `${formatHealthNumber(value)}%`}`}>
              <HealthIndicatorArtwork kind={kind} presentation="result" value={value ?? null} emptyLabel="--" width={dialWidth} height={dialWidth * 76 / 126} />
            </DialFrame>
          ) : (
            <>
              <MetricReading>
                {risk ? <RiskReading variant="section" numberOfLines={detailed ? 1 : 2}>{item?.status === 'succeeded' ? formatRiskLevel(item.riskLevel, !detailed) : '--'}</RiskReading> : (
                  <>
                    <AppText variant="display">{value === undefined ? '--' : formatHealthNumber(value)}</AppText>
                    <AppText variant="caption" tone="muted">{messages[`${kind}Unit`]}</AppText>
                  </>
                )}
              </MetricReading>
              <HealthIndicatorArtwork kind={kind} presentation="result" oxygenStyle="symbol" width={56} height={56} />
            </>
          )}
        </MetricBody>
        <Reference>
          {item && item.status !== 'succeeded' ? <AppText variant="caption" tone="muted">{item.failureReason === 'quality' ? messages.qualityRejected : messages.notGenerated}</AppText> : <>
            <AppText variant="caption" tone="muted">{risk ? messages.referenceOnly : messages.referenceRange}</AppText>
            {!risk && <AppText variant="caption" tone="muted">{messages[`${kind}Reference`]}</AppText>}
          </>}
        </Reference>
      </MetricCard>
    )
  }
  return (
    <Dashboard accessibilityLabel={messages.dashboardAccessibility}>
      {rows.map((row, index) => <DashboardRow key={index}>{row.map(metricCard)}</DashboardRow>)}
    </Dashboard>
  )
}
