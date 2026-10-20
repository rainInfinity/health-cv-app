/** 提供默认的 Android 原生采集验证界面。 */

import { AcquisitionScreen } from './src/features/acquisition/AcquisitionScreen'

/** 挂载手动采集界面；云端服务配置不会阻止启动。 */
export default function App() {
  return <AcquisitionScreen />
}
