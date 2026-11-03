/** 按设计 Demo 展示品牌页两秒，并在内容布局后隐藏原生启动屏。 */

import { useEffect, useRef } from 'react'
import { AppState, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import * as SplashScreen from 'expo-splash-screen'
import { useStore } from '@nanostores/react'

import { onboardingCompleted } from '@/app/preferences'
import { StartupDelay, resolveStartupDestination } from '@/app/startup/startupFlow'
import type { RootStackParamList } from '@/app/navigation/types'
import { startupMessages } from '@/pages/home/startupMessages'
import { PageContainer } from '@/shared/components/PageContainer'
import { XinmuLogo } from '@/shared/components/XinmuLogo'

import {
  SplashArt,
  SplashBottom,
  SplashBrandName,
  SplashContent,
  SplashCopy,
  SplashSlogan,
} from './styles'

/** 按 Demo 的渐变、品牌排版与纵向层级展示静态开屏。 */
export function StartupScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const messages = useStore(startupMessages)
  const insets = useSafeAreaInsets()
  const pageLaidOut = useRef(false)
  const releaseNativeSplash = useRef<() => void>(() => undefined)

  const handlePageLayout = () => {
    pageLaidOut.current = true
    releaseNativeSplash.current()
  }

  useEffect(() => {
    // 关闭 Android 原生层默认淡出，避免与品牌页标志短暂叠影。
    SplashScreen.setOptions({ duration: 0 })
    let disposed = false
    let initialUrl: string | null = null
    let initialUrlResolved = false
    let delayCompleted = false
    let navigationCommitted = false
    let delayStarted = false
    let splashHideRequested = false

    /** 等待品牌页时长和唯一初始 URL 读取都完成后再导航。 */
    const continueOnceReady = () => {
      if (disposed || navigationCommitted || !delayCompleted || !initialUrlResolved) return
      navigationCommitted = true
      const destination = resolveStartupDestination(initialUrl, onboardingCompleted.get())
      if (destination === 'passive-capture') {
        navigation.replace('ProductTabs', {
          screen: 'Dev',
          initial: false,
          params: { screen: 'PassiveCapture', initial: false },
        })
      } else if (destination === 'onboarding') {
        navigation.replace('Onboarding')
      } else {
        navigation.replace('ProductTabs')
      }
    }

    const delay = new StartupDelay(() => {
      delayCompleted = true
      continueOnceReady()
    })

    /** 原生启动屏关闭后，才开始累计品牌页的前台可见时间。 */
    const startDelay = () => {
      if (disposed || delayStarted) return
      delayStarted = true
      delay.start(AppState.currentState === 'active')
    }

    /** 等品牌页完成布局后再关闭原生层，避免先露出空白页面。 */
    const hideNativeSplash = () => {
      if (disposed || splashHideRequested) return
      splashHideRequested = true
      void SplashScreen.hideAsync().then(startDelay, startDelay)
    }

    const foregroundSubscription = AppState.addEventListener('change', (state) => {
      delay.setForeground(state === 'active')
    })
    releaseNativeSplash.current = hideNativeSplash
    if (pageLaidOut.current) hideNativeSplash()

    void Linking.getInitialURL().catch(() => null).then((url) => {
      if (disposed) return
      initialUrl = url
      initialUrlResolved = true
      continueOnceReady()
    })

    return () => {
      disposed = true
      releaseNativeSplash.current = () => undefined
      foregroundSubscription.remove()
      delay.dispose()
    }
  }, [navigation])

  return (
    <PageContainer
      edges={['top', 'left', 'right']}
      backgroundVariant="startup"
      contentContainerStyle={{
        gap: 0,
        paddingHorizontal: 24,
        paddingTop: Math.max(0, 68 - insets.top),
        paddingBottom: 0,
      }}
    >
      <SplashContent onLayout={handlePageLayout}>
        <SplashArt>
          <XinmuLogo size={144} />
        </SplashArt>
        <SplashCopy>
          <SplashBrandName accessibilityRole="header">{messages.brand}</SplashBrandName>
          <SplashSlogan>{messages.slogan}</SplashSlogan>
        </SplashCopy>
        <SplashBottom>{messages.tagline}</SplashBottom>
      </SplashContent>
    </PageContainer>
  )
}
