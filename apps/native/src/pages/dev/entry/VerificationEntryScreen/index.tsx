/** 展示无需云端服务即可访问的本地验证能力入口。 */

import { useStore } from '@nanostores/react'
import { devMessages } from '@/pages/dev/devMessages'
import { navigationMessages } from '@/app/i18n/navigationMessages'
import { EntryLink } from '@/pages/dev/entry/EntryLink'
import { AppText } from '@/shared/components/AppText'
import { PageContainer } from '@/shared/components/PageContainer'

/** 渲染主动 PPG、被动 RPPG、传感器、语言状态和反馈预览入口。 */
export function VerificationEntryScreen() {
  const messages = useStore(navigationMessages)
  const dev = useStore(devMessages)

  return (
    <PageContainer edges={['left', 'right']}>
      <AppText tone="secondary">{messages.entryDescription}</AppText>
      <EntryLink
        route="Acquisition"
        label={messages.entryActive}
        accessibilityLabel={messages.active}
        hint={messages.openPageHint}
      />
      <EntryLink
        route="RPPG"
        label={messages.entryRppg}
        accessibilityLabel={messages.rppg}
        hint={messages.openPageHint}
      />
      <EntryLink
        route="PassiveCapture"
        label={messages.entryPassive}
        accessibilityLabel={messages.passive}
        hint={messages.openPageHint}
      />
      <EntryLink
        route="Sensors"
        label={messages.entrySensors}
        accessibilityLabel={messages.sensors}
        hint={messages.openPageHint}
      />
      <EntryLink
        route="LanguageSettings"
        label={messages.entrySettings}
        accessibilityLabel={messages.settings}
        hint={messages.openPageHint}
      />
      <EntryLink
        route="FeedbackPreview"
        label={dev.feedback}
        accessibilityLabel={dev.feedback}
        hint={dev.feedbackDescription}
      />
    </PageContainer>
  )
}
