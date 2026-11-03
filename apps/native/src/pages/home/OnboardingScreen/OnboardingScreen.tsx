/** 展示两步首次引导；仅跳过或完成时记录设备级标记。 */

import { useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useStore } from '@nanostores/react'
import { ArrowLeft, ArrowRight, Bell, Camera, ShieldCheck } from 'lucide-react-native'
import { useTheme } from 'styled-components/native'

import { onboardingCompleted } from '@/app/preferences'
import { recordOnboardingCompletion } from '@/app/startup/startupFlow'
import type { RootStackParamList } from '@/app/navigation/types'
import { startupMessages } from '@/pages/home/startupMessages'
import { FeatureIllustration } from '@/pages/features/FeatureIllustration'
import type { FeatureIllustrationKind } from '@/pages/features/FeatureIllustration'
import { ActionButton } from '@/shared/components/ActionButton'
import { AppCard } from '@/shared/components/AppCard'
import { AppText } from '@/shared/components/AppText'
import { PageContainer } from '@/shared/components/PageContainer'
import { useFeedback } from '@/shared/components/FeedbackHost'
import { XinmuLogo } from '@/shared/components/XinmuLogo'

import {
  BrandMini,
  FeatureTile,
  FeatureTiles,
  Footnote,
  HeaderAction,
  HeroArtwork,
  HeroStage,
  OnboardingContent,
  OnboardingCopy,
  OnboardingFooter,
  OnboardingToolbar,
  PermissionCopy,
  PermissionIcon,
  PermissionRow,
  PermissionRows,
  ProgressDot,
  SkipButton,
  StepProgress,
} from './styles'

/** 仅在用户跳过或完成时保存设备级引导状态，不主动请求权限。 */
export function OnboardingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Onboarding'>>()
  const messages = useStore(startupMessages)
  const { showToast } = useFeedback()
  const [step, setStep] = useState<1 | 2>(1)

  /** 即使本地存储暂时失败也允许用户进入应用，并明确提示重试时机。 */
  const completeOnboarding = () => {
    const saved = recordOnboardingCompletion(() => onboardingCompleted.set(true))
    if (!saved) showToast({ tone: 'error', message: messages.saveFailed })
    navigation.replace('ProductTabs')
  }

  const theme = useTheme()

  return (
    <PageContainer
      edges={['top', 'left', 'right', 'bottom']}
      backgroundVariant={step === 1 ? 'home' : 'functions'}
      contentContainerStyle={{
        gap: 0,
        paddingHorizontal: theme.layout.pageGutter,
        paddingTop: theme.layout.onboardingContentInset,
        paddingBottom: theme.layout.onboardingContentInset,
      }}
    >
      <OnboardingContent>
        <OnboardingToolbar>
          {step === 1 ? (
            <BrandMini>
              <XinmuLogo size={28} />
              <AppText variant="label">{messages.brand}</AppText>
            </BrandMini>
          ) : (
            <HeaderAction
              onPress={() => setStep(1)}
              accessibilityRole="button"
              accessibilityLabel={messages.back}
            >
              <ArrowLeft size={theme.icon.compact} color={theme.colors.brand.action} />
              <AppText variant="label" style={{ color: theme.colors.brand.action }}>{messages.back}</AppText>
            </HeaderAction>
          )}
          <SkipButton
            onPress={completeOnboarding}
            accessibilityRole="button"
            accessibilityLabel={messages.skipAccessibility}
          >
            <AppText variant="label" style={{ color: theme.colors.brand.action }}>{messages.skip}</AppText>
          </SkipButton>
        </OnboardingToolbar>

        {step === 1 ? (
          <>
            <OnboardingCopy>
              <AppText variant="title">{messages.stepOneTitle}</AppText>
              <AppText tone="secondary">{messages.stepOneDescription}</AppText>
            </OnboardingCopy>
            <HeroArtwork>
              <HeroStage>
                <FeatureIllustration kind="pressure" width={176} height={148} />
              </HeroStage>
              <AppText
                variant="label"
                style={{
                  color: theme.colors.brand.action,
                  fontWeight: '500',
                  marginTop: theme.spacing.xxs,
                }}
              >
                {messages.stepOneCaption}
              </AppText>
            </HeroArtwork>
            <FeatureTiles>
              {(['fingertip', 'oxygen', 'risk'] as const satisfies readonly FeatureIllustrationKind[]).map((kind, index) => {
                const label = messages.stepOneItems.split(',')[index]?.trim() ?? ''
                return (
                  <FeatureTile key={kind}>
                    <FeatureIllustration kind={kind} width={64} height={56} />
                    <AppText variant="caption" tone="secondary" style={{ textAlign: 'center' }}>
                      {label}
                    </AppText>
                  </FeatureTile>
                )
              })}
            </FeatureTiles>
          </>
        ) : (
          <>
            <OnboardingCopy>
              <AppText variant="title">{messages.stepTwoTitle}</AppText>
              <AppText tone="secondary">{messages.stepTwoDescription}</AppText>
            </OnboardingCopy>
            <AppCard
              contentGap={0}
              contentPadding={{ horizontal: theme.spacing.md, vertical: 0 }}
              style={{ marginTop: theme.spacing.xl }}
            >
              <PermissionRows>
                <PermissionRow>
                  <PermissionIcon>
                    <Camera size={theme.icon.compact} color={theme.colors.brand.action} />
                  </PermissionIcon>
                  <PermissionCopy>
                    <AppText variant="label">{messages.cameraTitle}</AppText>
                    <AppText variant="label" tone="secondary" style={{ fontWeight: '400', lineHeight: 20 }}>
                      {messages.cameraDescription}
                    </AppText>
                  </PermissionCopy>
                </PermissionRow>
                <PermissionRow>
                  <PermissionIcon>
                    <Bell size={theme.icon.compact} color={theme.colors.brand.action} />
                  </PermissionIcon>
                  <PermissionCopy>
                    <AppText variant="label">{messages.notificationTitle}</AppText>
                    <AppText variant="label" tone="secondary" style={{ fontWeight: '400', lineHeight: 20 }}>
                      {messages.notificationDescription}
                    </AppText>
                  </PermissionCopy>
                </PermissionRow>
                <PermissionRow $last>
                  <PermissionIcon>
                    <ShieldCheck size={theme.icon.compact} color={theme.colors.brand.action} />
                  </PermissionIcon>
                  <PermissionCopy>
                    <AppText variant="label">{messages.passiveTitle}</AppText>
                    <AppText variant="label" tone="secondary" style={{ fontWeight: '400', lineHeight: 20 }}>
                      {messages.passiveDescription}
                    </AppText>
                  </PermissionCopy>
                </PermissionRow>
              </PermissionRows>
            </AppCard>
          </>
        )}
        <OnboardingFooter>
          <StepProgress
            accessibilityRole="text"
            accessibilityLabel={step === 1 ? messages.stepOneProgress : messages.stepTwoProgress}
          >
            <ProgressDot $active={step === 1} />
            <ProgressDot $active={step === 2} />
          </StepProgress>
          <ActionButton
            label={step === 1 ? messages.next : messages.finish}
            icon={<ArrowRight size={theme.icon.compact} color={theme.colors.surface.default} />}
            iconPosition="trailing"
            onPress={step === 1 ? () => setStep(2) : completeOnboarding}
          />
          <Footnote>
            <AppText variant="caption" tone="secondary" style={{ textAlign: 'center' }}>
              {messages.footnote}
            </AppText>
          </Footnote>
        </OnboardingFooter>
      </OnboardingContent>
    </PageContainer>
  )
}
