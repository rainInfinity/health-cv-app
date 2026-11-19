/** 指尖页内结果面板与嵌入原面板顶边的入口，不参与采集区域排版。 */
import { Animated } from 'react-native'
import styled from 'styled-components/native'

export const Overlay = styled.View`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10;
`

export const Backdrop = styled(Animated.View)`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
`

export const Sheet = styled(Animated.View)`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  border-top-left-radius: ${({ theme }) => theme.radius.lg}px;
  border-top-right-radius: ${({ theme }) => theme.radius.lg}px;
  background-color: ${({ theme }) => theme.colors.surface.default};
`

export const SheetScroll = styled.ScrollView`
  flex-grow: 0;
  border-top-left-radius: ${({ theme }) => theme.radius.lg}px;
  border-top-right-radius: ${({ theme }) => theme.radius.lg}px;
`

export const Collapse = styled.Pressable`
  position: absolute;
  top: -24px;
  left: 50%;
  margin-left: -32px;
  width: 64px;
  height: 48px;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.radius.pill}px;
  background-color: ${({ theme }) => theme.colors.surface.default};
`

export const EntrySlot = styled.View`
  position: absolute;
  top: -12px;
  left: 0;
  right: 0;
  align-items: center;
  z-index: 1;
`

export const Entry = styled.Pressable`
  min-height: 48px;
  padding: 8px 16px;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: ${({ theme }) => theme.radius.pill}px;
  background-color: ${({ theme }) => theme.colors.surface.default};
`
