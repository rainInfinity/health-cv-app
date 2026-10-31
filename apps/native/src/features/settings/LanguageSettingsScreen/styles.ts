/** 定义语言选项组的紧凑垂直布局。 */

import styled from 'styled-components/native'

/** 将语言单选操作按一致间距排列。 */
export const Options = styled.View`
  gap: ${({ theme }) => theme.spacing.sm}px;
`
