/** 胶囊底色与模糊内阴影分层，阴影不被渐变子层遮挡。 */
import styled from 'styled-components/native'

/** 原生尺寸由调用方提供，表面不裁切自身阴影。 */
export const TrackSurface = styled.View`
  position: relative;
`

/** 覆盖在底色之上的原生内阴影，不参与布局和触控。 */
export const TrackShadow = styled.View`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
`
