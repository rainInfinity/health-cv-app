/** 提供单一根导航容器、产品 Tab、真实账号路由和静态启动流程。 */

import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useRef } from 'react'
import { useStore } from '@nanostores/react'

import { navigationMessages } from '@/app/i18n/navigationMessages'
import { appLinking } from '@/app/navigation/linking'
import type { RootStackParamList } from '@/app/navigation/types'
import { ProductTabs } from '@/app/navigation/ProductTabs'
import { MetricDetailScreen } from '@/pages/home/MetricDetailScreen'
import { OnboardingScreen } from '@/pages/home/OnboardingScreen'
import { StartupScreen } from '@/pages/home/StartupScreen'
import { MeasurementGuideScreen } from '@/pages/measurement/MeasurementGuide'
import { FaceMeasurementScreen } from '@/pages/measurement/FaceMeasurement'
import { FingertipMeasurementScreen } from '@/pages/measurement/FingertipMeasurement'
import { FingertipResultsScreen } from '@/pages/measurement/FingertipResults'
import { BloodPressureMeasurementScreen } from '@/pages/measurement/BloodPressureMeasurement'
import { AuthScreen } from '@/pages/user/AuthScreen'
import { LanguageInfoScreen } from '@/pages/user/LanguageInfoScreen'
import { PermissionSettingsScreen } from '@/pages/user/PermissionSettingsScreen'
import { navigationTheme } from '@/shared/theme/navigationTheme'
import { useFeedback } from '@/shared/components/FeedbackHost'

const Stack = createNativeStackNavigator<RootStackParamList>()

/** 将登录路由中可选用户名传给共享的真实登录表单。 */
function LoginRouteScreen({ route }: NativeStackScreenProps<RootStackParamList, 'Login'>) {
  return <AuthScreen mode="login" initialUsername={route.params?.username} />
}

/** 将注册路由中可选用户名传给共享的真实注册表单。 */
function RegisterRouteScreen({ route }: NativeStackScreenProps<RootStackParamList, 'Register'>) {
  return <AuthScreen mode="register" initialUsername={route.params?.username} />
}

/** 以 Startup 为进程内首屏，并保留产品、设置和开发导航层级。 */
export function RootNavigator() {
  const messages = useStore(navigationMessages)
  const navigationRef = useNavigationContainerRef<RootStackParamList>()
  const previousRouteKey = useRef<string | undefined>(undefined)
  const { dismissModal } = useFeedback()
  const handleNavigationStateChange = () => {
    const routeKey = navigationRef.getCurrentRoute()?.key
    if (previousRouteKey.current != null && routeKey != null && previousRouteKey.current !== routeKey) {
      dismissModal()
    }
    previousRouteKey.current = routeKey
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={appLinking}
      theme={navigationTheme}
      onReady={() => {
        previousRouteKey.current = navigationRef.getCurrentRoute()?.key
      }}
      onStateChange={handleNavigationStateChange}
    >
      <Stack.Navigator initialRouteName="Startup" screenOptions={{ headerShadowVisible: false, orientation: 'portrait' }}>
        <Stack.Screen
          name="Startup"
          component={StartupScreen}
          options={{ headerShown: false, animation: 'none' }}
        />
        <Stack.Screen
          name="Onboarding"
          component={OnboardingScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ProductTabs"
          component={ProductTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="MeasurementGuide"
          component={MeasurementGuideScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="FaceMeasurement"
          component={FaceMeasurementScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="FingertipMeasurement"
          component={FingertipMeasurementScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="FingertipResults"
          component={FingertipResultsScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="BloodPressureMeasurement"
          component={BloodPressureMeasurementScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="MetricDetail"
          component={MetricDetailScreen}
          options={{
            title: messages.metricDetail,
            headerShown: false,
            presentation: 'transparentModal',
            animation: 'fade',
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen
          name="Login"
          component={LoginRouteScreen}
          options={{ title: messages.login, headerShown: false }}
        />
        <Stack.Screen
          name="Register"
          component={RegisterRouteScreen}
          options={{ title: messages.register, headerShown: false }}
        />
        <Stack.Screen
          name="PermissionSettings"
          component={PermissionSettingsScreen}
          options={{ title: messages.permissions }}
        />
        <Stack.Screen
          name="LanguageInfo"
          component={LanguageInfoScreen}
          options={{ title: messages.settings }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
