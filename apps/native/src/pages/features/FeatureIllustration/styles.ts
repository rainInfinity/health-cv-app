/** 定义 Demo 同尺寸插画画布及卡片对齐方式。 */

import styled from 'styled-components/native'

/** 让五幅本地 SVG 插画在功能卡片中保持统一的 96×84 dp 画布。 */
export const IllustrationFrame = styled.View`
  width: 96px;
  height: 84px;
  align-items: center;
  justify-content: center;
`
