/** 原文解读与固定评估只用于结果展示，不从采集值或参考区间推导。 */

import { useStore } from '@nanostores/react'
import { useTheme } from 'styled-components/native'
import { AppText } from '@/shared/components/AppText'
import { HealthIndicatorArtwork } from '@/shared/graphics'
import { fingertipResultSample } from '../fingertipResultSample'
import { fingertipResultsMessages } from '../fingertipResultsMessages'
import { Advice, Assessment, Content, Guidance, Identity, IdentityTitle, InterpretationCard, Interpretations, Introduction, MainRow, Reading, ReadingHeader, ReadingNumber, RiskParagraph, RiskReading, SectionHeading } from './styles'

/** 四张独立白卡保留全部介绍、建议与风险含义，不截断正文。 */
export function FingertipResultInterpretations() {
  const messages = useStore(fingertipResultsMessages)
  const theme = useTheme()
  return (
    <Interpretations>
      <SectionHeading><AppText variant="section" accessibilityRole="header">{messages.interpretation}</AppText><AppText variant="caption" tone="muted">{messages.restingReference}</AppText></SectionHeading>
      {fingertipResultSample.vitals.map((item) => {
        return (
          <InterpretationCard key={item.kind} style={theme.surfaceElevation.raised}>
            <MainRow>
              <Identity><IdentityTitle accessibilityRole="header">{messages[`${item.kind}Name`]}</IdentityTitle><HealthIndicatorArtwork kind={item.kind} presentation="result" oxygenStyle="symbol" width={48} height={48} /></Identity>
              <Content>
                <ReadingHeader>
                  <Reading><ReadingNumber>{item.value}</ReadingNumber><AppText variant="caption" tone="muted">{messages[`${item.kind}Unit`]}</AppText></Reading>
                  <Assessment><AppText variant="caption" style={{ color: theme.colors.brand.action }}>{messages[`${item.kind}Assessment`]}</AppText></Assessment>
                </ReadingHeader>
                <Introduction tone="secondary">{messages[`${item.kind}Introduction`]}</Introduction>
              </Content>
            </MainRow>
            <Guidance><Advice tone="muted">{messages[`${item.kind}Advice`]}</Advice></Guidance>
          </InterpretationCard>
        )
      })}
      <InterpretationCard style={theme.surfaceElevation.raised}>
        <MainRow>
          <Identity><IdentityTitle accessibilityRole="header">{messages.diabetesRiskName}</IdentityTitle><HealthIndicatorArtwork kind="diabetesRisk" presentation="result" width={48} height={48} /></Identity>
          <Content>
            <RiskReading>{messages.diabetesRiskValue}</RiskReading>
            <Introduction tone="secondary">{messages.diabetesRiskIntroduction}</Introduction>
          </Content>
        </MainRow>
        <Guidance>
          <AppText variant="label">{messages.diabetesRiskGuidanceTitle}</AppText>
          <RiskParagraph tone="secondary">{messages.diabetesRiskGuidance}</RiskParagraph>
          <RiskParagraph tone="secondary">{messages.diabetesRiskLimitations}</RiskParagraph>
        </Guidance>
      </InterpretationCard>
    </Interpretations>
  )
}
