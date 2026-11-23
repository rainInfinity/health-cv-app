/** 血压主卡沿用结果卡白底细边框，不使用外部阴影或质量角标。 */
import styled from 'styled-components/native'
import { AppText } from '@/shared/components/AppText'

export const Card = styled.View`
  padding: 20px 16px;
  border-radius: ${({ theme }) => theme.radius.lg}px;
  border: 1px solid ${({ theme }) => `${theme.colors.border.default}A6`};
  background-color: ${({ theme }) => theme.colors.surface.default};
`
export const Scale = styled.View`
  position: relative;
  margin: 0 4px 12px;
`
export const ScaleReference = styled.View`
  position: relative;
  padding-bottom: 4px;
`
export const ScaleGuide = styled.View<{ $position: number }>`
  position: absolute;
  top: 20px;
  bottom: 0;
  left: ${({ $position }) => $position}%;
  border-left-width: 1px;
  border-style: dashed;
  border-left-color: ${({ theme }) => theme.colors.border.default};
`
export const BoundaryRow = styled.View`
  flex-direction: row;
  padding-bottom: 12px;
`
export const Boundary = styled.View`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 4px;
`
export const ScaleLabels = styled.View`
  flex-direction: row;
`
export const ScaleLabel = styled(AppText)<{ $portion: number }>`
  flex: ${({ $portion }) => $portion};
  text-align: center;
  line-height: 18px;
`
export const Bands = styled.View`
  flex-direction: row;
  height: 16px;
`
export const Band = styled.View<{ $portion: number; $color: string }>`
  flex: ${({ $portion }) => $portion};
  background-color: ${({ $color }) => $color};
  border-bottom-left-radius: 16px;
  border-bottom-right-radius: 16px;
`
export const MarkerRow = styled.View`
  flex-direction: row;
  height: 30px;
  margin-top: 10px;
`
export const MarkerSlot = styled.View<{ $portion: number }>`
  flex: ${({ $portion }) => $portion};
  align-items: center;
`
export const MarkerBubble = styled.View<{ $color: string }>`
  min-width: 84px;
  padding: 5px 14px;
  border-radius: 10px;
  background-color: ${({ $color }) => $color};
  align-items: center;
`
export const Assessment = styled(AppText)<{ $color: string }>`
  color: ${({ $color }) => $color};
  margin-bottom: 12px;
  font-size: 36px;
  line-height: 44px;
  font-weight: ${({ theme }) => theme.typography.weight.semibold};
  text-align: center;
`
export const Heading = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 8px;
  margin-bottom: 12px;
`
export const Readings = styled.View`
  flex-direction: row;
`
export const Reading = styled.View<{ $divider: boolean }>`
  flex: 1;
  align-items: center;
  border-left-width: ${({ $divider }) => $divider ? 1 : 0}px;
  border-left-color: ${({ theme }) => theme.colors.border.default};
`
export const ReadingName = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
  margin-bottom: 4px;
`
export const Reference = styled(AppText)`
  margin-top: 6px;
  text-align: center;
`
