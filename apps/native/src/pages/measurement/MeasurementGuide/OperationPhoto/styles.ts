/** 正圆照片的等比画布，不受准备项高度影响。 */

import { StyleSheet } from 'react-native'
import styled from 'styled-components/native'

export const PhotoFrame = styled.View`
  align-self: center;
  flex-shrink: 0;
`

export const localStyles = StyleSheet.create({
  canvas: {
    position: 'absolute',
    width: 360,
    height: 360,
    left: '50%',
    top: '50%',
    marginLeft: -180,
    marginTop: -180,
  },
  backdrop: {
    position: 'absolute',
    left: 37,
    top: 37,
    width: 286,
    height: 286,
    borderRadius: 143,
  },
  photoClip: {
    position: 'absolute',
    left: 42,
    top: 42,
    width: 276,
    height: 276,
    borderRadius: 138,
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
})
