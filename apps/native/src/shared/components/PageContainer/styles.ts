/** 定义浅色安全区表面和可滚动页面内容节点。 */

import { SafeAreaView } from 'react-native-safe-area-context'
import styled from 'styled-components/native'

/** 页面画布；顶部安全区由原生导航头处理。 */
export const PageSurface = styled(SafeAreaView)`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.surface.canvas};
`

/** 占据页面余下空间并承载可滚动内容。 */
export const PageScrollView = styled.ScrollView`
  flex: 1;
`
