/** 定义不拦截交互的全屏主题背景层。 */

import styled from 'styled-components/native'

/** 将渐变底图限制在页面画布内并放置于内容之后。 */
export const GradientSurface = styled.View`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
`
