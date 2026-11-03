/** 仅作为意外直达路由的静态说明，不读取或展示历史数据。 */

import { useStore } from '@nanostores/react'

import { historyMessages } from '@/pages/history/historyMessages'
import { AppCard } from '@/shared/components/AppCard'
import { AppText } from '@/shared/components/AppText'
import { PageContainer } from '@/shared/components/PageContainer'

import { HistoryCopy } from './styles'

/** 显示历史暂未开放状态，不创建历史查询或业务页。 */
export function HistoryUnavailableScreen() {
  const messages = useStore(historyMessages)
  return (
    <PageContainer edges={['top', 'left', 'right']}>
      <AppText variant="title">{messages.title}</AppText>
      <AppCard>
        <HistoryCopy>
          <AppText>{messages.message}</AppText>
        </HistoryCopy>
      </AppCard>
    </PageContainer>
  )
}
