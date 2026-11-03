/** 定义语言支持说明列表和当前选择状态布局。 */

import styled from 'styled-components/native'

/** 以稳定间距组织已发布语言与兼容性说明。 */
export const LanguageOptionList = styled.View`
  gap: ${({ theme }) => theme.spacing.sm}px;
`
