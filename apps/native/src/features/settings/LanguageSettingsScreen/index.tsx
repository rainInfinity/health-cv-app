/** 展示并保存简体中文、英文或跟随系统的语言选择。 */

import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { languagePreference } from '@/app/preferences'
import type { LanguagePreference } from '@/app/preferences'
import { languageSettingsMessages } from '@/features/settings/languageMessages'
import { LanguageChoice } from '@/features/settings/LanguageChoice'
import { AppText } from '@/shared/components/AppText'
import { PageContainer } from '@/shared/components/PageContainer'
import { StatusFeedback } from '@/shared/components/StatusFeedback'

import { Options } from './styles'

/** 即时应用选择并对存储失败给出不会误导用户的本地提示。 */
export function LanguageSettingsScreen() {
  const messages = useStore(languageSettingsMessages)
  const preference = useStore(languagePreference)
  const [saveFailed, setSaveFailed] = useState(false)

  const chooseLanguage = (value: LanguagePreference) => {
    try {
      languagePreference.set(value)
      setSaveFailed(false)
    } catch {
      setSaveFailed(true)
    }
  }

  return (
    <PageContainer contentContainerStyle={{ paddingBottom: 32 }}>
      <AppText accessibilityRole="header" variant="title">{messages.title}</AppText>
      <AppText tone="secondary">{messages.description}</AppText>
      <Options accessibilityRole="radiogroup">
        <LanguageChoice
          value="zh-CN"
          label={messages.simplifiedChinese}
          selected={preference === 'zh-CN'}
          hint={preference === 'zh-CN' ? messages.selectedHint : messages.chooseHint}
          onSelect={chooseLanguage}
        />
        <LanguageChoice
          value="en-US"
          label={messages.english}
          selected={preference === 'en-US'}
          hint={preference === 'en-US' ? messages.selectedHint : messages.chooseHint}
          onSelect={chooseLanguage}
        />
        <LanguageChoice
          value="system"
          label={messages.system}
          selected={preference === 'system'}
          hint={preference === 'system' ? messages.selectedHint : messages.chooseHint}
          onSelect={chooseLanguage}
        />
      </Options>
      {saveFailed && <StatusFeedback tone="error" title={messages.saveError} />}
    </PageContainer>
  )
}
