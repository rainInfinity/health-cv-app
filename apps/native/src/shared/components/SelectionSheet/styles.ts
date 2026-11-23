/** 底部选择菜单的遮罩、固定操作栏和滚动单选项。 */
import { Animated } from 'react-native'
import styled from 'styled-components/native'

export const Root = styled.View`
  flex: 1;
  justify-content: flex-end;
`
export const Backdrop = styled(Animated.View)`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background-color: ${({ theme }) => `${theme.colors.text.primary}66`};
`
export const BackdropButton = styled.Pressable`
  flex: 1;
`
export const Surface = styled(Animated.View)`
  width: 100%;
  background-color: ${({ theme }) => theme.colors.surface.default};
  border-top-left-radius: ${({ theme }) => theme.radius.lg}px;
  border-top-right-radius: ${({ theme }) => theme.radius.lg}px;
  overflow: hidden;
`
export const Header = styled.View`
  flex-direction: row;
  align-items: center;
  padding-horizontal: ${({ theme }) => theme.spacing.xs}px;
  min-height: 64px;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.border.default};
`
export const HeaderAction = styled.Pressable`
  width: 72px;
  min-height: ${({ theme }) => theme.icon.touchTarget}px;
  align-items: center;
  justify-content: center;
`
export const OptionButton = styled.Pressable<{ $selected: boolean }>`
  min-height: 56px;
  padding: ${({ theme }) => theme.spacing.sm}px ${({ theme }) => theme.spacing.md}px;
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  background-color: ${({ theme, $selected }) => $selected ? theme.colors.brand.subtle : 'transparent'};
`
