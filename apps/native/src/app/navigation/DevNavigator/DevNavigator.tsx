/** 在开发 Tab 内保留原生验证功能及现有返回路径。 */

import { useStore } from '@nanostores/react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import { navigationMessages } from '@/app/i18n/navigationMessages'
import type { DevStackParamList } from '@/app/navigation/types'
import { AcquisitionScreen } from '@/pages/dev/acquisition/AcquisitionScreen'
import { RPPGScreen } from '@/pages/dev/acquisition/RPPGScreen'
import { PassiveCaptureScreen } from '@/pages/dev/acquisition/PassiveCaptureScreen'
import { SensorCaptureScreen } from '@/pages/dev/sensors/SensorCaptureScreen'
import { LanguageSettingsScreen } from '@/pages/dev/settings/LanguageSettingsScreen'
import { VerificationEntryScreen } from '@/pages/dev/entry/VerificationEntryScreen'
import { FeedbackPreviewScreen } from '@/pages/dev/entry/FeedbackPreviewScreen'
import { devMessages } from '@/pages/dev/devMessages'

const Stack = createNativeStackNavigator<DevStackParamList>()

/** 将验证入口设为开发子栈首页，供深链返回和手动选择。 */
export function DevNavigator() {
  const messages = useStore(navigationMessages)
  const dev = useStore(devMessages)

  return (
    <Stack.Navigator initialRouteName="Entry" screenOptions={{ headerShadowVisible: false }}>
      <Stack.Screen name="Entry" component={VerificationEntryScreen} options={{ title: messages.entry }} />
      <Stack.Screen name="Acquisition" component={AcquisitionScreen} options={{ title: messages.active }} />
      <Stack.Screen name="RPPG" component={RPPGScreen} options={{ title: messages.rppg }} />
      <Stack.Screen name="PassiveCapture" component={PassiveCaptureScreen} options={{ title: messages.passive }} />
      <Stack.Screen name="Sensors" component={SensorCaptureScreen} options={{ title: messages.sensors }} />
      <Stack.Screen name="LanguageSettings" component={LanguageSettingsScreen} options={{ title: messages.settings }} />
      <Stack.Screen name="FeedbackPreview" component={FeedbackPreviewScreen} options={{ title: dev.feedback }} />
    </Stack.Navigator>
  )
}
