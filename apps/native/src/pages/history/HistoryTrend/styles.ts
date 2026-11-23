/** 趋势区域直接绘制在页面背景上，不增加卡片表面。 */
import { Animated } from 'react-native'
import styled from 'styled-components/native'

export const ChartStage = styled(Animated.View)`
  height: 232px;
  margin-top: 10px;
`
export const LegendRow = styled.View`
  position: absolute;
  top: 0;
  right: 16px;
  flex-direction: row;
  gap: 16px;
`
export const LegendButton = styled.Pressable`
  min-height: ${({ theme }) => theme.icon.touchTarget}px;
  padding-horizontal: 0;
  align-items: center;
  flex-direction: row;
  gap: 6px;
`
export const LegendStroke = styled.View`
  width: 16px;
  border-top-width: 2px;
`
export const ReadingTooltip = styled.View`
  position: absolute;
  align-self: flex-start;
  padding: 12px;
  gap: 4px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  background-color: ${({ theme }) => theme.colors.surface.default};
`
