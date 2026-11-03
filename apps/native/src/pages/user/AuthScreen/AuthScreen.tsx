/** 使用唯一认证服务完成登录或注册并就地显示字段错误。 */

import { useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'
import { ArrowLeft, ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react-native'
import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme } from 'styled-components/native'

import { useAppServices } from '@/app/providers/AppProviders'
import type { RootStackParamList } from '@/app/navigation/types'
import { authMessages } from '@/pages/user/authMessages'
import { classifyAuthFormError } from '@/pages/user/authFormErrors'
import { useFeedback } from '@/shared/components/FeedbackHost'
import { ActionButton } from '@/shared/components/ActionButton'
import { AppCard } from '@/shared/components/AppCard'
import { AppInput } from '@/shared/components/AppInput'
import { AppText } from '@/shared/components/AppText'
import { PageContainer } from '@/shared/components/PageContainer'
import { StatusFeedback } from '@/shared/components/StatusFeedback'
import { XinmuLogo } from '@/shared/components/XinmuLogo'

import {
  AuthAlternate,
  AuthAlternateAction,
  AuthBrand,
  AuthBrandCopy,
  AuthFields,
  AuthPasswordField,
  AuthFootnote,
  AuthSubmit,
  AuthSwitch,
  AuthToolbar,
  BackButton,
  PasswordToggle,
} from './styles'

/** 描述共享表单当前采用的认证命令。 */
export interface AuthScreenProps {
  /** 登录会建立会话；注册只创建账号并返回登录页。 */
  mode: 'login' | 'register'
  /** 可选的回填用户名，不包含密码或令牌。 */
  initialUsername?: string
}

/** 渲染经真实认证服务提交的单一登录或注册表单。 */
export function AuthScreen({ mode, initialUsername = '' }: AuthScreenProps) {
  const theme = useTheme()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const services = useAppServices()
  const messages = useStore(authMessages)
  const { showToast } = useFeedback()
  const isRegister = mode === 'register'
  const [username, setUsername] = useState(initialUsername)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [confirmationVisible, setConfirmationVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [confirmationError, setConfirmationError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const submitLock = useRef(false)
  useEffect(() => {
    if (mode !== 'login' || initialUsername == null) return
    setUsername(initialUsername)
    setPassword('')
    setPasswordVisible(false)
    setUsernameError(null)
    setPasswordError(null)
    setFormError(null)
  }, [initialUsername, mode])

  /** 检查仅由界面负责的必填、长度和确认密码约束。 */
  function validate(): boolean {
    setUsernameError(null)
    setPasswordError(null)
    setConfirmationError(null)
    setFormError(null)
    let valid = true
    if (username.trim().length === 0) {
      setUsernameError(messages.usernameRequired)
      valid = false
    } else if (username.length > 150) {
      setUsernameError(messages.usernameTooLong)
      valid = false
    }
    if (password.length === 0) {
      setPasswordError(messages.passwordRequired)
      valid = false
    }
    if (isRegister && confirmation !== password) {
      setConfirmationError(messages.passwordMismatch)
      valid = false
    }
    return valid
  }

  /** 提交凭据时只传用户名和密码，不把确认密码交给服务端。 */
  async function submit(): Promise<void> {
    if (submitLock.current || services == null || !validate()) return
    submitLock.current = true
    setSubmitting(true)
    try {
      if (isRegister) {
        const account = await services.auth.register({ username, password })
        showToast({ tone: 'success', message: messages.registerSuccess })
        navigation.popTo('Login', { username: account.username })
        return
      }
      await services.auth.signIn({ username, password })
      showToast({ tone: 'success', message: messages.loginSuccess })
      navigation.reset({
        index: 0,
        routes: [{ name: 'ProductTabs', params: { screen: 'User' } }],
      })
    } catch (error) {
      const messageKey = classifyAuthFormError(error)
      const message = messages[messageKey]
      if (messageKey === 'usernameExists') setUsernameError(message)
      else if (messageKey === 'invalidCredentials') setPasswordError(message)
      else setFormError(message)
    } finally {
      submitLock.current = false
      setSubmitting(false)
    }
  }

  /** 在登录与注册模式间切换并保留用户名，不保留密码。 */
  function switchMode(): void {
    if (isRegister) {
      navigation.popTo('Login', { username })
      return
    }
    navigation.navigate('Register', { username })
  }
  /** 以同一品牌控件显示密码显隐状态。 */
  function renderPasswordToggle(field: string, visible: boolean, toggle: () => void) {
    const label = visible ? messages.hidePassword({ field }) : messages.showPassword({ field })
    const Icon = visible ? EyeOff : Eye
    return (
      <PasswordToggle onPress={toggle} accessibilityRole="button" accessibilityLabel={label}>
        <Icon size={theme.icon.compact} color={theme.colors.brand.action} />
      </PasswordToggle>
    )
  }

  return (
    <PageContainer
      edges={['top', 'left', 'right', 'bottom']}
      backgroundVariant="auth"
      contentContainerStyle={{ gap: 0, paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.lg }}
    >
      <AuthToolbar>
        <BackButton
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={messages.back}
        >
          <ArrowLeft size={theme.icon.default} color={theme.colors.text.primary} />
        </BackButton>
        <AuthSwitch
          onPress={switchMode}
          accessibilityRole="button"
          accessibilityLabel={isRegister ? messages.switchToLogin : messages.switchToRegister}
        >
          <AppText variant="label" style={{ color: theme.colors.brand.action }}>
            {isRegister ? messages.switchToLogin : messages.switchToRegister}
          </AppText>
        </AuthSwitch>
      </AuthToolbar>
      <AuthBrand>
        <XinmuLogo size={64} />
        <AuthBrandCopy>
          <AppText variant="title">{messages.brand}</AppText>
          <AppText variant="caption" tone="secondary">{messages.slogan}</AppText>
        </AuthBrandCopy>
      </AuthBrand>
      <AppCard
        contentPadding={{
          horizontal: theme.spacing.xl,
          vertical: isRegister ? theme.spacing.lg : theme.spacing.xl,
        }}
      >
        <AuthFields $register={isRegister}>
          <AppInput
            label={messages.username}
            placeholder={messages.usernamePlaceholder}
            value={username}
            onChangeText={(value) => {
              setUsername(value)
              setUsernameError(null)
            }}
            error={usernameError}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            maxLength={151}
            editable={!submitting}
            returnKeyType="next"
          />
          <AuthPasswordField $register={isRegister}>
            <View>
              <AppInput
                label={messages.password}
                placeholder={messages.passwordPlaceholder}
                value={password}
                onChangeText={(value) => {
                  setPassword(value)
                  setPasswordError(null)
                }}
                error={passwordError}
                secureTextEntry={!passwordVisible}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                textContentType={isRegister ? 'newPassword' : 'password'}
                editable={!submitting}
                returnKeyType={isRegister ? 'next' : 'done'}
                onSubmitEditing={() => isRegister ? undefined : void submit()}
                style={{ paddingRight: theme.spacing.xxxxl }}
              />
              {renderPasswordToggle(messages.password, passwordVisible, () => setPasswordVisible((value) => !value))}
            </View>
            {isRegister && (
              <AppText variant="caption" tone="secondary">{messages.registerPasswordHint}</AppText>
            )}
          </AuthPasswordField>
          {isRegister && (
            <AppInput
              label={messages.confirmPassword}
              placeholder={messages.confirmPasswordPlaceholder}
              value={confirmation}
              onChangeText={(value) => {
                setConfirmation(value)
                setConfirmationError(null)
              }}
              error={confirmationError}
              secureTextEntry={!confirmationVisible}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              editable={!submitting}
              returnKeyType="done"
              onSubmitEditing={() => void submit()}
              style={{ paddingRight: theme.spacing.xxxxl }}
            />
          )}
          {formError != null && <StatusFeedback title={formError} tone="error" />}
          <AuthSubmit $register={isRegister}>
            <ActionButton
              label={isRegister ? messages.submitRegister : messages.submitLogin}
              loading={submitting}
              disabled={services == null || submitting}
              icon={(
                <ArrowRight
                  size={theme.icon.compact}
                  color={services == null || submitting
                    ? theme.roles.button.disabled.foreground
                    : theme.colors.surface.default}
                />
              )}
              iconPosition="trailing"
              onPress={() => void submit()}
            />
            {isRegister && (
              <AppText variant="caption" tone="secondary" style={{ textAlign: 'center' }}>
                {messages.registerSuccessNote}
              </AppText>
            )}
          </AuthSubmit>
        </AuthFields>
      </AppCard>
      <AuthAlternate $register={isRegister}>
        <AppText variant="label" tone="secondary" style={{ fontWeight: '400' }}>
          {isRegister ? messages.alternateHasAccount : messages.alternateNoAccount}
        </AppText>
        <AuthAlternateAction
          onPress={switchMode}
          accessibilityRole="button"
          accessibilityLabel={isRegister ? messages.switchToLogin : messages.switchToRegister}
        >
          <AppText variant="label" style={{ color: theme.colors.brand.action }}>
            {isRegister ? messages.loginTitle : messages.switchToRegister}
          </AppText>
        </AuthAlternateAction>
      </AuthAlternate>
      <AuthFootnote $register={isRegister}>
        <ShieldCheck size={theme.spacing.md} color={theme.colors.brand.action} />
        <AppText variant="caption" tone="secondary">{messages.privacyNote}</AppText>
      </AuthFootnote>
    </PageContainer>
  )
}
