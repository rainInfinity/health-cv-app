/** 六帧仅切换原生合成透明度，不移动正文或修改人体路径。 */
import { Animated } from 'react-native'
import styled from 'styled-components/native'
export const Artwork = styled.View`
  width: 100%;
  margin-bottom: 8px;
  overflow: hidden;
`
export const Frame = styled(Animated.View)`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
`
