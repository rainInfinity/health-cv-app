/** 在复用应用 Providers 的根组件中挂载统一原生导航。 */

import { AppProviders } from '@/app/providers/AppProviders'
import { RootNavigator } from '@/app/navigation/RootNavigator'
import { StatusBar } from 'expo-status-bar'

/** 保持本地入口可用，并由原生导航栈管理页面与返回路径。 */
export default function App() {
  return (
    <AppProviders>
      <StatusBar style="dark" />
      <RootNavigator />
    </AppProviders>
  )
}
