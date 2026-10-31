/** 将应用浅色语义令牌映射到 React Navigation。 */

import { DefaultTheme, type Theme as NavigationTheme } from '@react-navigation/native'

import { lightTheme } from './theme'

/** 与应用页面共用颜色来源的导航主题。 */
export const navigationTheme: NavigationTheme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary: lightTheme.colors.brand.action,
    background: lightTheme.colors.surface.canvas,
    card: lightTheme.colors.surface.default,
    text: lightTheme.colors.text.primary,
    border: lightTheme.colors.border.default,
    notification: lightTheme.colors.brand.action,
  },
}
