/** 展示开发构建仍保留的简体中文状态，不再提供生效语言切换。 */

import { useStore } from '@nanostores/react'

import { languageSettingsMessages } from '@/pages/dev/settings/languageMessages'
import { AppCard } from '@/shared/components/AppCard'
import { AppText } from '@/shared/components/AppText'
import { PageContainer } from '@/shared/components/PageContainer'
import { StatusFeedback } from '@/shared/components/StatusFeedback'

/** 说明当前版本语言范围，同时保留旧偏好兼容。 */
export function LanguageSettingsScreen() {
  const messages = useStore(languageSettingsMessages)

  return (
    <PageContainer edges={['left', 'right']}>
      <AppText accessibilityRole="header" variant="title">{messages.title}</AppText>
      <AppText tone="secondary">{messages.description}</AppText>
      <AppCard>
        <StatusFeedback
          title={messages.simplifiedChinese}
          message={messages.selectedHint}
          tone="info"
        />
      </AppCard>
    </PageContainer>
  )
}
