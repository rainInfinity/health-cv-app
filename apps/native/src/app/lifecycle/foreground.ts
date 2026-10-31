/** 通过共享应用状态事件源支持前台刷新与查询焦点更新。 */

import { AppState } from 'react-native'
import type { AppStateStatus } from 'react-native'
import { createAppStateEvents } from './appStateEvents'

const appStateEvents = createAppStateEvents<AppStateStatus>(AppState)

/** 订阅所有原生应用状态变化。 */
export function subscribeToAppState(listener: (state: AppStateStatus) => void): () => void {
  return appStateEvents.subscribeToAppState(listener)
}

/** 订阅应用进入前台事件。 */
export function subscribeToAppForeground(listener: () => void): () => void {
  return appStateEvents.subscribeToAppForeground(listener)
}
