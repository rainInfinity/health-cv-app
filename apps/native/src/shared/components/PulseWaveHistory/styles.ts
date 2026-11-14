/** 历史波形的稳定标题、弹性绘图区及独立回到最新浮层。 */

import styled from 'styled-components/native'

/** 不改变页面给定的绘图区高度。 */
export const HistoryFrame = styled.View`
  flex: 1;
`

/** 当前窗口范围仅占既有标题行，不占绘图区。 */
export const HistoryHeading = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`

/** 手势只覆盖实际绘图区，标题仍可用于外层分页。 */
export const HistoryPlot = styled.View`
  position: relative;
  flex: 1;
`

/** 48 dp 原生触控目标的中心对齐绘图区中心。 */
export const LatestButton = styled.Pressable`
  position: absolute;
  right: 8px;
  width: 48px;
  height: 48px;
  border-radius: 24px;
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.border.default};
  background-color: ${({ theme }) => theme.colors.surface.card};
  align-items: center;
  justify-content: center;
`
