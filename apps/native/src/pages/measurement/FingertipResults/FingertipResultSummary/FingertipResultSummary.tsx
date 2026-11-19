/** 采集页受控结果面板的自然高度正文，不管理导航或检测资源。 */

import { useStore } from '@nanostores/react'
import { useTheme } from 'styled-components/native'
import { AppText } from '@/shared/components/AppText'
import { ActionButton } from '@/shared/components/ActionButton'
import { ArrowRight, CircleCheck } from '@/shared/graphics'
import { fingertipResultsMessages } from '../fingertipResultsMessages'
import { FingertipResultDashboard } from '../FingertipResultDashboard'
import { Actions, Completion, CompletionHint, CompletionTitle, Disclaimer, RetestButton, SuccessTitle, SummaryBody } from './styles'

export interface FingertipResultSummaryProps {
  /** 由采集页核验同轮结果资格并导航。 */
  onDetails: () => void
  /** 沿用采集页安全关闭旧轮后重测的命令。 */
  onRetest: () => void
}

/** 简要结果仅在指标卡下方保留短声明，详情页完整说明保持独立。 */
export function FingertipResultSummary({ onDetails, onRetest }: FingertipResultSummaryProps) {
  const messages = useStore(fingertipResultsMessages)
  const theme = useTheme()
  return (
    <SummaryBody>
      <Completion>
        <CompletionTitle>
          <CircleCheck size={40} fill={theme.colors.feedback.success} color={theme.colors.surface.default} strokeWidth={2} accessible={false} />
          <SuccessTitle accessibilityRole="header">{messages.completedTitle}</SuccessTitle>
        </CompletionTitle>
        <CompletionHint>{messages.summaryHint}</CompletionHint>
        <AppText variant="caption" tone="muted">{messages.measurementTime}</AppText>
      </Completion>
      <FingertipResultDashboard variant="summary" />
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
