/** 历史页局部布局；统计与记录保持无阴影表面。 */
import styled from 'styled-components/native'
import { Animated } from 'react-native'

export const MetricHeader = styled.View`
  flex-direction: row;
  align-items: center;
  min-height: 48px;
  margin-bottom: 16px;
`
export const Neighbour = styled.Pressable`
  flex: 1;
  min-height: ${({ theme }) => theme.icon.touchTarget}px;
  justify-content: center;
`
export const MetricChoice = styled.Pressable`
  width: 144px;
  padding-left: 12px;
  padding-right: 32px;
  min-height: ${({ theme }) => theme.icon.touchTarget}px;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  position: relative;
`
export const PeriodTrack = styled.View`
  height: 52px;
  border-radius: ${({ theme }) => theme.radius.pill}px;
  flex-direction: row;
  padding: 4px;
  gap: 4px;
`
export const Slider = styled(Animated.View)`
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  border-radius: ${({ theme }) => theme.radius.pill}px;
  background-color: ${({ theme }) => theme.colors.brand.primary};
`
export const PeriodButton = styled.Pressable`
  flex: 1;
  align-items: center;
  justify-content: center;
`
/** 灰色正文确定自然尺寸，白色副本仅改变透明度，不推移布局。 */
export const PeriodLabel = styled.View`
  position: relative;
`
/** 与滑块同组驱动原生透明度，不在切换时重建颜色插值节点。 */
export const PeriodHighlight = styled(Animated.View)`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  align-items: center;
  justify-content: center;
`
export const Row = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.xs}px;
`
export const TextButton = styled.Pressable`
  min-height: ${({ theme }) => theme.icon.touchTarget}px;
  align-items: center;
  justify-content: center;
  padding-horizontal: ${({ theme }) => theme.spacing.xs}px;
`
export const StatisticsRow = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.spacing.sm}px;
`
export const StatisticCard = styled.View`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.md}px;
  background-color: ${({ theme }) => theme.colors.surface.default};
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radius.lg}px;
  gap: 0;
`
export const StatisticExtremes = styled.View`
  gap: 6px;
  margin-top: 12px;
`
export const RecordsSurface = styled.View`
  padding-horizontal: ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.radius.lg}px;
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.border.default};
  background-color: ${({ theme }) => theme.colors.surface.default};
`
export const RecordButton = styled.Pressable<{ $divider: boolean }>`
  min-height: 68px;
  padding-vertical: ${({ theme }) => theme.spacing.sm}px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.xs}px;
  border-bottom-width: ${({ $divider }) => $divider ? 1 : 0}px;
  border-bottom-color: ${({ theme }) => theme.colors.border.default};
`
export const Empty = styled.View`
  min-height: 156px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: ${({ theme }) => theme.spacing.md}px;
`
export const Scrim = styled.Pressable`
  flex: 1;
  background-color: ${({ theme }) => `${theme.colors.text.primary}66`};
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.md}px;
`
export const Sheet = styled.View`
  max-height: 92%;
  border-radius: ${({ theme }) => theme.radius.lg}px;
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.border.default};
  background-color: ${({ theme }) => theme.colors.surface.default};
  overflow: hidden;
`
export const SheetHeader = styled.View<{ $calendar?: boolean }>`
  padding-horizontal: ${({ theme }) => theme.spacing.md}px;
  flex-direction: row;
  align-items: center;
  justify-content: ${({ $calendar }) => $calendar ? 'center' : 'space-between'};
  min-height: ${({ $calendar }) => $calendar ? 52 : 64}px;
  gap: ${({ theme }) => theme.spacing.xs}px;
`
export const CalendarGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
`
export const CalendarCell = styled.Pressable`
  width: 14.285714%;
  min-height: ${({ theme }) => theme.icon.touchTarget}px;
  padding: 4px;
  align-items: center;
  justify-content: center;
`
/** 日期背景按可用宽度居中成正方形；年月选项仍保持四边内缩。 */
export const CalendarHighlight = styled.View<{ $selected: boolean; $inside: boolean; $day?: boolean }>`
  ${({ theme, $day }) => $day ? `
    width: 100%;
    max-width: ${theme.icon.touchTarget - 8}px;
    aspect-ratio: 1;
    align-items: center;
    justify-content: center;
  ` : `
    position: absolute;
    top: 4px;
    right: 4px;
    bottom: 4px;
    left: 4px;
  `}
  border-radius: ${({ theme }) => theme.radius.md}px;
  background-color: ${({ theme, $selected, $inside }) => $selected ? theme.colors.brand.action : $inside ? theme.colors.brand.subtle : 'transparent'};
`
/** 年月选项保持独立触控区域，沿用日期的内缩高亮。 */
export const CalendarOption = styled.Pressable`
  width: 33.333333%;
  min-height: ${({ theme }) => theme.icon.touchTarget}px;
  align-items: center;
  justify-content: center;
`
