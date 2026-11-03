/** 说明当前仅开放简体中文，并保留旧偏好兼容而不切换界面。 */

import { useStore } from '@nanostores/react'

import { defineFeatureMessages } from '@/app/i18n'
import { AppCard } from '@/shared/components/AppCard'
import { AppText } from '@/shared/components/AppText'
import { PageContainer } from '@/shared/components/PageContainer'

import { LanguageOptionList } from './styles'

const languageMessages = defineFeatureMessages('pages/language-info')

/** 展示当前支持范围和旧语言设置的兼容说明，不提供虚假切换选项。 */
export function LanguageInfoScreen() {
  const messages = useStore(languageMessages)

  return (
    <PageContainer edges={['left', 'right', 'bottom']}>
      <AppText tone="secondary">{messages.description}</AppText>
      <AppCard>
        <LanguageOptionList>
          <AppText variant="section">{messages.currentLanguage}</AppText>
          <AppText>{messages.simplifiedChinese}</AppText>
          <AppText variant="caption" tone="secondary">{messages.currentVersionOnly}</AppText>
        </LanguageOptionList>
      </AppCard>
      <AppText variant="caption" tone="secondary">{messages.legacyPreference}</AppText>
    </PageContainer>
  )
}
