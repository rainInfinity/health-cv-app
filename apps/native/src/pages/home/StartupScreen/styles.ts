/** 定义与设计 Demo 对齐的静态品牌开屏布局。 */

import styled from 'styled-components/native'

/** 将标志推入主视觉区，并把辅助说明锚定在屏幕下方。 */
export const SplashContent = styled.View`
  flex: 1;
  align-items: center;
  padding-bottom: 32px;
`

/** 保留 Demo 中标志上方留白，并由上方自适应空间定位。 */
export const SplashArt = styled.View`
  align-items: center;
  margin-top: auto;
  padding-top: 36px;
`

/** 让字标与 Slogan 保持居中并列。 */
export const SplashCopy = styled.View`
  width: 100%;
  align-items: center;
  margin-top: 20px;
`

/** 使用 Demo 的品牌字标字号、行高与字距。 */
export const SplashBrandName = styled.Text`
  margin-bottom: 12px;
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 36px;
  line-height: 48px;
  letter-spacing: 6px;
  font-weight: 600;
`

/** 使用 Demo 的 Slogan 字号、行高与字距。 */
export const SplashSlogan = styled.Text`
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 16px;
  line-height: 24px;
  letter-spacing: 1px;
`

/** 将补充说明固定在 Demo 对应的屏幕下方。 */
export const SplashBottom = styled.Text`
  margin-top: auto;
  padding-top: 36px;
  color: ${({ theme }) => theme.colors.text.muted};
  font-size: 12px;
  line-height: 20px;
  text-align: center;
`
