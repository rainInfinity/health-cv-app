/** 为 styled-components 提供应用浅色主题的静态类型。 */

import 'styled-components'

import type { AppTheme } from './theme'

declare module 'styled-components' {
  export interface DefaultTheme extends AppTheme {}
}

declare module 'styled-components/native' {
  export interface DefaultTheme extends AppTheme {}
}
