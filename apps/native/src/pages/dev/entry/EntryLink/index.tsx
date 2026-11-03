/** 将本地功能入口映射为无障碍操作按钮。 */

import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ActionButton } from '@/shared/components/ActionButton'
import type { DevStackParamList } from '@/app/navigation/types'

/** 入口按钮能够到达的功能路由。 */
type FeatureRouteName = 'Acquisition' | 'PassiveCapture' | 'Sensors' | 'LanguageSettings' | 'FeedbackPreview'

/** 描述单个可访问的本地功能入口。 */
export interface EntryLinkProps {
  /** 目标页面路由。 */
  route: FeatureRouteName
  /** 入口按钮的简短可见名称。 */
  label: string
  /** 完整的功能名称，用于辅助技术。 */
  accessibilityLabel: string
  /** 当前语言下的辅助技术提示。 */
  hint: string
}

/** 导航至指定本地功能，不触发采集命令。 */
export function EntryLink({ route, label, accessibilityLabel, hint }: EntryLinkProps) {
  const navigation = useNavigation<NativeStackNavigationProp<DevStackParamList>>()

  return (
    <ActionButton
      label={label}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={hint}
      secondary
      onPress={() => navigation.navigate(route)}
    />
  )
}
