/** 按 Demo 的竖屏层级组织准备页，小屏与大字号由滚动承接。 */

import styled from 'styled-components/native'
import { Animated } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export const GuideSurface = styled.View`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.surface.default};
`

export const GuideSafeArea = styled(SafeAreaView)`
  flex: 1;
`

export const GuideHeader = styled.View`
  min-height: 48px;
  padding: 0 16px;
  flex-direction: row;
  align-items: center;
`

export const GuideMain = styled.View`
  flex-grow: 1;
`

export const GuideVisual = styled.View`
  flex: 1;
  min-height: 184px;
  align-items: center;
  justify-content: center;
  padding-bottom: 24px;
`

export const GuidePreparation = styled.View`
  flex-direction: row;
  gap: 8px;
  padding: 20px 8px;
  background-color: ${({ theme }) => theme.colors.surface.card};
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radius.lg}px;
`

export const GuideStep = styled.View`
  flex: 1;
  align-items: center;
`

export const SkipControl = styled.Pressable`
  min-height: 48px;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 4px;
`

/** 弹层属于当前引导页，不使用可跨路由停留的原生窗口。 */
export const GuideDialogLayer = styled(Animated.View)`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
`
