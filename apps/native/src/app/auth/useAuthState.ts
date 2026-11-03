/** 提供页面对唯一应用认证状态的订阅，不创建会话管理器。 */

import { useStore } from '@nanostores/react'
import { atom } from 'nanostores'

import { useAppServices } from '@/app/providers/AppProviders'
import type { AuthState } from './types'

/** 未配置云端服务时仅用于维持稳定 Hook 输入的不可变状态源。 */
const missingServiceState = atom<AuthState>({ status: 'unavailable', reason: 'identity-unconfirmed' })

/** 订阅应用唯一认证状态；缺少云端配置时返回暂不可用状态。 */
export function useAuthState(): AuthState {
  const services = useAppServices()
  return useStore(services?.auth.state ?? missingServiceState)
}
