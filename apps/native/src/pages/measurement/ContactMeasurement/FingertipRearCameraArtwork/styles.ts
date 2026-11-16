/** 固定后摄画布并叠放可由原生驱动的手指与镜头反馈层。 */

import { Animated } from 'react-native'
import styled from 'styled-components/native'

export const ArtworkFrame = styled.View`
  width: 100%;
  flex-shrink: 0;
  overflow: hidden;
`

export const ArtworkLayer = styled(Animated.View)`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
`
