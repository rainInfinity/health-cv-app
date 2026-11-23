/** 一般性指标说明不推断正常范围、医学风险或个性化建议。 */
import { useStore } from '@nanostores/react'
import type { MeasurementReport } from '@/app/measurement/resultAdapter'
import { AppText } from '@/shared/components/AppText'
import { HealthIndicatorArtwork } from '@/shared/graphics'
import { formatHealthNumber, formatRiskLevel } from '@/shared/healthNumber'
import { fingertipResultsMessages } from '../fingertipResultsMessages'
import { Advice, Assessment, Content, Identity, IdentityTitle, InterpretationCard, Interpretations, Introduction, MainRow, Reading, ReadingHeader, ReadingNumber, RiskGuidance, RiskParagraph, SectionHeading } from './styles'

/** 同源读数与通用解读分开呈现，未知评估不套用设计样例结论。 */
export function FingertipResultInterpretations({ report }: { report?: MeasurementReport | null }) {
  const messages = useStore(fingertipResultsMessages)
  return (
    <Interpretations>
      <SectionHeading><AppText variant="section" accessibilityRole="header">{messages.interpretation}</AppText><AppText variant="caption" tone="muted">{messages.restingReference}</AppText></SectionHeading>
      {(['heartRate', 'respirationRate', 'oxygenSaturation', 'diabetesRisk'] as const).map((kind) => {
        const item = report?.metrics[kind]
        const value = item?.status === 'succeeded' ? item.readings[0]?.value : undefined
        return (
          <InterpretationCard key={kind}>
            <MainRow>
              <Identity><IdentityTitle accessibilityRole="header">{messages[`${kind}Name`]}</IdentityTitle><HealthIndicatorArtwork kind={kind} presentation="result" oxygenStyle="symbol" width={48} height={48} /></Identity>
              <Content>
                <ReadingHeader>
                  <Reading>
                    {kind === 'diabetesRisk'
                      ? <AppText variant="section" numberOfLines={1} style={{ fontSize: 20, lineHeight: 26, textAlign: 'center' }}>{item?.status === 'succeeded' ? formatRiskLevel(item.riskLevel, false) : '--'}</AppText>
                      : <ReadingNumber numberOfLines={1}>{value === undefined ? '--' : formatHealthNumber(value)}</ReadingNumber>}
                    {kind !== 'diabetesRisk' && <AppText variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 0 }}>{messages[`${kind}Unit`]}</AppText>}
                  </Reading>
                  {kind !== 'diabetesRisk' && <Assessment variant="caption">--</Assessment>}
                </ReadingHeader>
                <Introduction tone="secondary">{item?.status === 'succeeded' ? messages[`${kind}Introduction`] : item?.failureReason === 'quality' ? messages.qualityRejected : messages.notGenerated}</Introduction>
              </Content>
            </MainRow>
            {item?.status === 'succeeded' && (kind === 'diabetesRisk' ? (
              <RiskGuidance>
                <AppText variant="label" style={{ fontWeight: '500' }}>{messages.riskGuidanceTitle}</AppText>
                <RiskParagraph tone="secondary">{messages.riskGuidance}</RiskParagraph>
              </RiskGuidance>
            ) : <Advice tone="muted">{messages[`${kind}Advice`]}</Advice>)}
          </InterpretationCard>
        )
      })}
    </Interpretations>
  )
}
