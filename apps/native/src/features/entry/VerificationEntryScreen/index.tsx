/** 展示无需云端服务即可访问的本地验证能力入口。 */

import { useStore } from '@nanostores/react'
import { navigationMessages } from '@/app/i18n/navigationMessages'
import { EntryLink } from '@/features/entry/EntryLink'
import { AppText } from '@/shared/components/AppText'
import { PageContainer } from '@/shared/components/PageContainer'

/** 渲染主动 PPG、被动录像、传感器和语言设置入口。 */
export function VerificationEntryScreen() {
  const messages = useStore(navigationMessages)

  return (
    <PageContainer>
      <AppText tone="secondary">{messages.entryDescription}</AppText>
      <EntryLink
        route="Acquisition"
        label={messages.entryActive}
        accessibilityLabel={messages.active}
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
    </PageContainer>
  )
}
