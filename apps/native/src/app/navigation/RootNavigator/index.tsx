/** 提供本地验证路由、语言化标题和统一深链处理。 */

import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useStore } from '@nanostores/react'

import { navigationMessages } from '@/app/i18n/navigationMessages'
import { appLinking } from '@/app/navigation/linking'
import type { RootStackParamList } from '@/app/navigation/types'
import { AcquisitionScreen } from '@/features/acquisition/AcquisitionScreen'
import { PassiveCaptureScreen } from '@/features/acquisition/PassiveCaptureScreen'
import { SensorCaptureScreen } from '@/features/sensors/SensorCaptureScreen'
import { LanguageSettingsScreen } from '@/features/settings/LanguageSettingsScreen'
import { VerificationEntryScreen } from '@/features/entry/VerificationEntryScreen'
import { navigationTheme } from '@/shared/theme/navigationTheme'

const Stack = createNativeStackNavigator<RootStackParamList>()

/** 将本地验证入口、原生页面和深链统一交由一个导航容器管理。 */
export function RootNavigator() {
  const messages = useStore(navigationMessages)

  return (
    <NavigationContainer linking={appLinking} theme={navigationTheme}>
      <Stack.Navigator
        initialRouteName="Entry"
        screenOptions={{ headerShadowVisible: false }}
      >
        <Stack.Screen
          name="Entry"
          component={VerificationEntryScreen}
          options={{ title: messages.entry }}
        />
        <Stack.Screen
          name="Acquisition"
          component={AcquisitionScreen}
          options={{ title: messages.active }}
        />
        <Stack.Screen
          name="PassiveCapture"
          component={PassiveCaptureScreen}
          options={{ title: messages.passive }}
        />
        <Stack.Screen
          name="Sensors"
          component={SensorCaptureScreen}
          options={{ title: messages.sensors }}
        />
        <Stack.Screen
          name="LanguageSettings"
          component={LanguageSettingsScreen}
          options={{ title: messages.settings }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
