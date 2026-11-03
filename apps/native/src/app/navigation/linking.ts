/** 将运行时被动采集深链映射到嵌套开发栈；冷启动 URL 交由 Startup 单次读取。 */

import { Linking } from 'react-native'
import type { LinkingOptions, PathConfig, PathConfigMap } from '@react-navigation/native'

import type { DevStackParamList, ProductTabParamList, RootStackParamList } from './types'
import { requestAcquisitionLeave } from './acquisitionNavigationGuard'

const devLinkConfig = {
  initialRouteName: 'Entry',
  screens: {
    PassiveCapture: 'passive-capture',
  },
} satisfies PathConfig<DevStackParamList>

/** 仅处理进程运行期间的链接，冷启动目标由品牌页计时后决定。 */
export const appLinking: LinkingOptions<RootStackParamList> = {
  prefixes: ['healthcvapp://'],
  getInitialURL: async () => null,
  config: {
    screens: {
      ProductTabs: {
        initialRouteName: 'Home',
        screens: {
          /* PathConfigMap 在此嵌套泛型上退化为叶路由；上方对象已按开发子栈契约校验。 */
          Dev: devLinkConfig as unknown as NonNullable<PathConfigMap<ProductTabParamList>['Dev']>,
        },
      },
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
