/** 血压简要结果只提供自然高度正文，不持有采集或导航副作用。 */
import { useStore } from '@nanostores/react'
import { useTheme } from 'styled-components/native'
import type { MeasurementReport } from '@/app/measurement/resultAdapter'
import { AppText } from '@/shared/components/AppText'
import { ActionButton } from '@/shared/components/ActionButton'
import { ArrowRight, CircleCheck } from '@/shared/graphics'
import { bloodPressureResultsMessages } from '../bloodPressureResultsMessages'
import { BloodPressureResultCard } from '../BloodPressureResultCard'
import { Actions, Completion, CompletionHint, CompletionTitle, Disclaimer, RetestButton, SuccessTitle, SummaryBody } from './styles'

/** 完成区表示本轮流程已结束，详情与重测仍由采集页安全衔接。 */
export function BloodPressureResultSummary({ report, onDetails, onRetest }: { report: MeasurementReport; onDetails(): void; onRetest(): void }) {
  const messages = useStore(bloodPressureResultsMessages)
  const theme = useTheme()
  return (
    <SummaryBody>
      <Completion>
        <CompletionTitle>
          <CircleCheck size={40} fill={theme.colors.feedback.success} color={theme.colors.surface.default} strokeWidth={2} accessible={false} />
          <SuccessTitle accessibilityRole="header">{messages.completedTitle}</SuccessTitle>
        </CompletionTitle>
        <CompletionHint>{messages.summaryHint}</CompletionHint>
        <AppText variant="caption" tone="muted">{report.measurementTime}</AppText>
      </Completion>
      <BloodPressureResultCard report={report} />
      <Disclaimer variant="caption" tone="muted">{messages.summaryDisclaimer}</Disclaimer>
      <Actions>
        <ActionButton label={messages.details} icon={<ArrowRight size={20} color={theme.colors.surface.default} accessible={false} />} iconPosition="trailing" onPress={onDetails} />
        <RetestButton onPress={onRetest} accessibilityRole="button" accessibilityLabel={messages.retest} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <AppText style={{ color: theme.colors.brand.action }}>{messages.retest}</AppText>
        </RetestButton>
      </Actions>
    </SummaryBody>
  )
}
