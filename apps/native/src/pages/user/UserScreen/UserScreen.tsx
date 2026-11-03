/** 展示单一认证状态、账户操作与未开放功能入口。 */

import { useStore } from '@nanostores/react'
import { Bell, ChevronRight, CircleQuestionMark, FileText, ShieldCheck, SlidersHorizontal, UserRound } from 'lucide-react-native'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme } from 'styled-components/native'

import { useAuthState } from '@/app/auth/useAuthState'
import { useAppServices } from '@/app/providers/AppProviders'
import type { RootStackParamList } from '@/app/navigation/types'
import { authMessages } from '@/pages/user/authMessages'
import { userMessages } from '@/pages/user/userMessages'
import { feedbackMessages } from '@/app/i18n/feedbackMessages'
import { useFeedback } from '@/shared/components/FeedbackHost'
import { ActionButton } from '@/shared/components/ActionButton'
import { AppCard } from '@/shared/components/AppCard'
import { AppText } from '@/shared/components/AppText'
import { PageContainer } from '@/shared/components/PageContainer'

import {
  AccountAvatar,
  AccountCopy,
  AccountIdentity,
  AccountPanel,
  AccountAction,
  MenuGroups,
  MenuRow,
  PrivacyFootnote,
  RetryButton,
} from './styles'

/** 渲染账号四态、认证入口和不触发资料写入的用户菜单。 */
export function UserScreen() {
  const theme = useTheme()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const services = useAppServices()
  const authState = useAuthState()
  const messages = useStore(userMessages)
  const authCopy = useStore(authMessages)
  const sharedCopy = useStore(feedbackMessages)
  const { showModal, showToast } = useFeedback()
  const isAuthenticated = authState.status === 'authenticated'
  const isRestoring = authState.status === 'restoring'
  const statusTitle = isAuthenticated ? authState.username : messages.guestName
  const statusMessage = isAuthenticated ? messages.authenticatedStatus : messages.guestStatus

  /** 打开统一未开放说明，不读取、编辑或提交账户资料。 */
  function showUnavailable(title: string, message: string): void {
    showModal({
      title,
      message,
      closeLabel: sharedCopy.dismiss,
      actions: [{ label: sharedCopy.dismiss, primary: true }],
    })
  }

  /** 退出本地会话并按实际远端撤销结果给出提示。 */
  async function signOut(): Promise<void> {
    if (services == null) return
    try {
      const result = await services.auth.signOut()
      if (result.credentialDeletion === 'failed') {
        showToast({ tone: 'error', message: authCopy.logoutStorageFailed })
      } else if (result.remoteRevocation === 'unconfirmed') {
        showToast({ tone: 'error', message: authCopy.logoutRemoteUnconfirmed })
      } else {
        showToast({ tone: 'success', message: authCopy.logoutSuccess })
      }
    } catch {
      showToast({ tone: 'error', message: authCopy.signOutError })
    }
  }

  /** 显示确认弹窗；取消和系统返回均不调用退出命令。 */
  function confirmSignOut(): void {
    showModal({
      title: messages.signOutTitle,
      message: messages.signOutMessage,
      closeLabel: sharedCopy.dismiss,
      actions: [
        { label: messages.cancel, primary: false },
        { label: messages.confirmSignOut, primary: true, onPress: signOut },
      ],
    })
  }

  /** 按页面归属分流设置路由，其他入口仅显示共同未开放说明。 */
  function openMenu(key: string): void {
    if (key === 'notifications') {
      navigation.navigate('PermissionSettings', { section: 'notifications' })
      return
    }
    if (key === 'privacy') {
      navigation.navigate('PermissionSettings', { section: 'privacy' })
      return
    }
    if (key === 'language') {
      navigation.navigate('LanguageInfo')
      return
    }
    showUnavailable(messages.notOpenTitle, messages.notOpenMessage)
  }

  const menuGroups = [
    [
      { key: 'myRecords', label: messages.myRecords, icon: FileText },
      { key: 'personalProfile', label: messages.personalProfile, icon: UserRound },
      { key: 'notifications', label: messages.notifications, icon: Bell },
    ],
    [
      { key: 'privacy', label: messages.privacy, icon: ShieldCheck },
      { key: 'language', label: messages.language, value: messages.languageValue, icon: SlidersHorizontal },
      { key: 'helpFeedback', label: messages.helpFeedback, icon: CircleQuestionMark },
    ],
  ]
  const identityContent = (
    <AccountIdentity>
      <AccountAvatar>
        {isRestoring
          ? <ActivityIndicator color={theme.colors.feedback.loading} />
          : <UserRound size={32} color={theme.colors.brand.action} />}
      </AccountAvatar>
      <AccountCopy>
        <AppText variant="title">{statusTitle}</AppText>
        <AppText
          variant="label"
          tone="secondary"
          style={{ fontWeight: theme.typography.weight.regular }}
        >
          {statusMessage}
        </AppText>
      </AccountCopy>
      {!isAuthenticated && (
        <ChevronRight size={theme.icon.compact} color={theme.colors.text.secondary} />
      )}
    </AccountIdentity>
  )

  return (
    <PageContainer
      edges={['top', 'left', 'right']}
      backgroundVariant="account"
      contentContainerStyle={{ gap: theme.spacing.md, paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.xl }}
    >
      <AppText variant="title">{messages.title}</AppText>
      <AccountPanel>
        {isAuthenticated ? (
          identityContent
        ) : (
          <Pressable
            onPress={() => navigation.navigate('Login')}
            accessibilityRole="button"
            accessibilityLabel={messages.login}
            accessibilityHint={authCopy.switchToRegister}
          >
            {identityContent}
          </Pressable>
        )}
        {!isAuthenticated && services != null && authState.status === 'unavailable' && (
          <RetryButton
            onPress={() => void services.auth.restore()}
            accessibilityRole="button"
            accessibilityLabel={messages.retryRestore}
          >
            <AppText variant="label" tone="secondary">{messages.retryRestore}</AppText>
            <ChevronRight size={theme.icon.compact} color={theme.colors.text.secondary} />
          </RetryButton>
        )}
      </AccountPanel>


      <MenuGroups>
        {menuGroups.map((group) => (
          <AppCard
            key={group[0].key}
            contentGap={0}
            contentPadding={{ horizontal: theme.spacing.lg, vertical: theme.spacing.xxs }}
          >
            {group.map((item, index) => {
              const Icon = item.icon
              return (
                <MenuRow
                  key={item.key}
                  onPress={() => openMenu(item.key)}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  style={index === group.length - 1 ? { borderBottomWidth: 0 } : undefined}
                >
                  <Icon size={theme.icon.compact} color={theme.colors.text.secondary} />
                  <View style={{ flex: 1 }}>
                    <AppText>{item.label}</AppText>
                  </View>
                  {'value' in item && <AppText variant="caption" tone="secondary">{item.value}</AppText>}
                  <ChevronRight size={theme.icon.compact} color={theme.colors.text.secondary} />
                </MenuRow>
              )
            })}
          </AppCard>
        ))}
      </MenuGroups>
      <PrivacyFootnote>
        <ShieldCheck size={theme.icon.compact} color={theme.colors.accent.blue} />
        <AppText variant="caption" tone="secondary">{messages.dataPrivacy}</AppText>
      </PrivacyFootnote>
      <AccountAction>
        {isAuthenticated ? (
          <ActionButton danger label={messages.signOut} onPress={confirmSignOut} />
        ) : (
          <ActionButton label={messages.login} onPress={() => navigation.navigate('Login')} />
        )}
      </AccountAction>
    </PageContainer>
  )
}
