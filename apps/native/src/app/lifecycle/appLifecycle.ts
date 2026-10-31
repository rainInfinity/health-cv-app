/** 将原生 AppState 与 NetInfo 连接到共享应用查询生命周期。 */

import NetInfo from '@react-native-community/netinfo'
import { AppState } from 'react-native'

import { subscribeToAppState } from './foreground'
import { installQueryLifecycle } from './queryLifecycle'

/** 在应用根 Provider 生命周期内安装并清理原生焦点与网络监听。 */
export function installAppLifecycle(): () => void {
  return installQueryLifecycle({
    currentAppState: AppState.currentState,
    subscribeToAppState: (listener) => subscribeToAppState((state) => listener(state)),
    subscribeToNetwork: (listener) => NetInfo.addEventListener(listener),
  })
}
