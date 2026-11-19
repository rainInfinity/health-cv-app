/** 报告波形独立组织标题、固定六秒画布及下方范围。 */

import styled from 'styled-components/native'

export const WaveCard = styled.View`
  margin-top: 20px;
  padding: 20px 16px 16px;
  border-radius: ${({ theme }) => theme.radius.lg}px;
  background-color: ${({ theme }) => theme.colors.surface.default};
`
export const WaveHeading = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`
export const WaveTitle = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
`
export const ProcessedTag = styled.View`
  padding: 4px 8px;
  border-radius: 6px;
  background-color: ${({ theme }) => theme.colors.brand.subtle};
`
export const WavePlot = styled.View`
  margin-top: 16px;
  height: 164px;
`
export const WaveNavigation = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
`
