/** 定义主页健康指标插画的固定画布与卡片对齐方式。 */

import styled from 'styled-components/native'

/** 根据图形类别提供不收缩的插画区域。 */
export const ArtworkFrame = styled.View<{ $width: number; $height: number }>`
  width: ${({ $width }) => $width}px;
  height: ${({ $height }) => $height}px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
`
