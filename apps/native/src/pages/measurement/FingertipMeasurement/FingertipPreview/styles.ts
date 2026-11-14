/** 覆盖环和装饰水纹共享正圆中心。 */

import styled from 'styled-components/native'

export const PreviewFrame = styled.View`
  align-items: center;
  justify-content: center;
`

/** 提示相对镜头区域居中，不改变取景或下方面板布局。 */
export const NoticeCenter = styled.View`
  position: absolute;
  top: 17px;
  right: 17px;
  bottom: 17px;
  left: 17px;
  align-items: center;
  justify-content: center;
`

/** 最大宽度包含内边距和边框，短提示仍按文字自然收缩。 */
export const Notice = styled.View`
  max-width: 80%;
  flex-shrink: 1;
  padding: 12px 16px;
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: 14px;
  background-color: ${({ theme }) => theme.colors.surface.default};
`
