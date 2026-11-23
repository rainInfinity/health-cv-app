/** 定义开发历史均值、逐搏序列表格和展开控件。 */
import styled from 'styled-components/native'
import { AppText } from '@/shared/components/AppText'

/** 保持历史摘要与序列之间的垂直间距。 */
export const HistoryGroup = styled.View`
  gap: ${({ theme }) => theme.spacing.sm}px;
`

/** 使用原生按压反馈，展开操作保留48dp触控高度。 */
export const SequenceToggle = styled.Pressable`
  min-height: 48px;
  justify-content: center;
`

/** 用等宽数值列对应同一次搏动的时间、心率和RR。 */
export const BeatRow = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.spacing.xs}px;
  padding-vertical: ${({ theme }) => theme.spacing.xs}px;
`

/** 数值保留相同列宽并右对齐，避免位数变化打乱对应关系。 */
export const BeatValue = styled(AppText)`
  flex: 1;
  text-align: right;
  font-variant: tabular-nums;
`
