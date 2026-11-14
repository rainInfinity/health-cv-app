/** 固定照片裁剪区域；透明像素由 SVG 蒙版而非白色遮罩生成。 */

import styled from 'styled-components/native'

export const PhotoLayer = styled.View`
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 44%;
  mix-blend-mode: multiply;
`
