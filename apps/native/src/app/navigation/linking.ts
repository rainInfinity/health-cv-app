/** 将现有被动采集 URL 映射到唯一的原生导航目标。 */
import { Linking } from 'react-native'
import type { LinkingOptions } from '@react-navigation/native'

import type { RootStackParamList } from './types'
import { requestAcquisitionLeave } from './acquisitionNavigationGuard'

/** 深链冷启动也保留验证入口作为返回栈首层。 */
export const appLinking: LinkingOptions<RootStackParamList> = {
  prefixes: ['healthcvapp://'],
  config: {
    initialRouteName: 'Entry',
    screens: {
      PassiveCapture: 'passive-capture',
    },
  },
  subscribe(listener) {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (
        /^healthcvapp:\/\/passive-capture(?:[/?#]|$)/i.test(url)
        && requestAcquisitionLeave(() => listener(url))
      ) return
      listener(url)
    })
    return () => subscription.remove()
  },
}
