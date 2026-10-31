/** 在根组件外稳定提供安全区、主题、应用服务和查询客户端。 */

import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ThemeProvider } from 'styled-components/native'

import { appServices } from '@/app/bootstrap'
import type { AppServices } from '@/app/bootstrap'
import { installAppLifecycle } from '@/app/lifecycle/appLifecycle'
import { lightTheme } from '@/shared/theme/theme'

/** 描述根 Providers 的 React 子树。 */
export interface AppProvidersProps {
  /** 由同一应用服务和主题上下文包裹的根内容。 */
  children: ReactNode
}

const AppServicesContext = createContext<AppServices | null>(appServices)

/** 在进程级服务实例上提供全局 React 上下文，不创建第二套缓存或认证状态。 */
export function AppProviders({ children }: AppProvidersProps) {
  useEffect(() => installAppLifecycle(), [])
  const content = appServices ? (
    <QueryClientProvider client={appServices.queryClient}>{children}</QueryClientProvider>
  ) : children

  return (
    <SafeAreaProvider>
      <ThemeProvider theme={lightTheme}>
        <AppServicesContext.Provider value={appServices}>{content}</AppServicesContext.Provider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}

/** 读取可选云端依赖；本地采集页面在无服务配置时得到 null。 */
export function useAppServices(): AppServices | null {
  return useContext(AppServicesContext)
}
