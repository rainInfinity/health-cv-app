/** 简要结果与详情共用的两行两列看板，不推导健康状态。 */

import { useStore } from '@nanostores/react'
import { useState } from 'react'
import type { LayoutChangeEvent } from 'react-native'
import { useTheme } from 'styled-components/native'
import { AppText } from '@/shared/components/AppText'
import { HealthIndicatorArtwork } from '@/shared/graphics'
import { fingertipResultSample } from '../fingertipResultSample'
import { fingertipResultsMessages } from '../fingertipResultsMessages'
import { SignalQualityBadge } from '../SignalQualityBadge'
import { Dashboard, DashboardRow, DialFrame, MetricBody, MetricCard, MetricReading, Reference, RiskReading, RiskText } from './styles'

export interface FingertipResultDashboardProps {
  /** 弹层使用淡灰边框，详情使用轻阴影；正文与数据保持一致。 */
  variant: 'summary' | 'details'
}

/** 保留完整半圆比例；窄卡只按可用画布等比缩小，不裁掉刻度。 */
export function FingertipResultDashboard({ variant }: FingertipResultDashboardProps) {
  const messages = useStore(fingertipResultsMessages)
  const theme = useTheme()
  const summary = variant === 'summary'
  const cardStyle = summary ? undefined : theme.surfaceElevation.raised
  const [dialWidth, setDialWidth] = useState(126)
  const [heart, breath, oxygen] = fingertipResultSample.vitals
  function measureDial(event: LayoutChangeEvent) {
    const width = Math.min(126, event.nativeEvent.layout.width)
    if (width > 0) setDialWidth((previous) => previous === width ? previous : width)
  }

  return (
    <Dashboard accessibilityLabel={messages.dashboardAccessibility}>
      <DashboardRow>
        {[heart, breath].map((item) => {
          return (
            <MetricCard key={item.kind} $summary={summary} style={cardStyle}>
              <SignalQualityBadge score={item.qualityScore} accessibilityLabel={messages[`${item.kind}QualityAccessibility`]} />
              <AppText variant="label">{messages[`${item.kind}Name`]}</AppText>
              <MetricBody>
                <MetricReading><AppText variant="display">{item.value}</AppText><AppText variant="caption" tone="muted">{messages[`${item.kind}Unit`]}</AppText></MetricReading>
                <HealthIndicatorArtwork kind={item.kind} presentation="result" width={56} height={56} />
              </MetricBody>
              <Reference><AppText variant="caption" tone="muted">{messages.referenceLabel}</AppText><AppText variant="caption" tone="muted">{messages[`${item.kind}Reference`]}</AppText></Reference>
            </MetricCard>
          )
        })}
      </DashboardRow>
      <DashboardRow>
        <MetricCard $summary={summary} style={cardStyle}>
          <SignalQualityBadge score={oxygen.qualityScore} accessibilityLabel={messages.oxygenSaturationQualityAccessibility} />
          <AppText variant="label">{messages.oxygenSaturationName}</AppText>
          <DialFrame onLayout={measureDial} accessible accessibilityLabel={`${messages.oxygenSaturationName} ${oxygen.value}%`}>
            <HealthIndicatorArtwork kind="oxygenSaturation" presentation="result" value={oxygen.value} width={dialWidth} height={dialWidth * 76 / 126} />
          </DialFrame>
          <Reference><AppText variant="caption" tone="muted">{messages.referenceLabel}</AppText><AppText variant="caption" tone="muted">{messages.oxygenSaturationReference}</AppText></Reference>
        </MetricCard>
        <MetricCard $summary={summary} style={cardStyle}>
          <SignalQualityBadge score={fingertipResultSample.riskQualityScore} accessibilityLabel={messages.diabetesRiskQualityAccessibility} />
          <AppText variant="label">{messages.diabetesRiskName}</AppText>
          <MetricBody>
            <RiskReading><RiskText>{messages.diabetesRiskLevel}</RiskText><RiskText>{messages.diabetesRiskRisk}</RiskText></RiskReading>
            <HealthIndicatorArtwork kind="diabetesRisk" presentation="result" width={56} height={56} />
          </MetricBody>
          <Reference><AppText variant="caption" tone="muted">{messages.referenceOnly}</AppText></Reference>
        </MetricCard>
      </DashboardRow>
    </Dashboard>
  )
}
