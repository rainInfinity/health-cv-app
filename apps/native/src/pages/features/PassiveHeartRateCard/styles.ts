/** 定义无扰心率卡片的文字、48dp触控区及原生滑块画布。 */

import { Animated } from 'react-native'
import styled from 'styled-components/native'

/** 标题和说明可自然换行，不能侵占右侧开关触控目标。 */
export const PassiveCopy = styled.View`
  flex: 1;
  gap: ${({ theme }) => theme.spacing.xxs}px;
`

/** 只有该区域可以请求服务启停，视觉轨道保持76×42。 */
export const SwitchTarget = styled.Pressable`
  width: 76px;
  height: ${({ theme }) => theme.icon.touchTarget}px;
  flex-shrink: 0;
  justify-content: center;
`

/** 原生内阴影由轨道表面叠加，外壳只负责稳定位置。 */
export const SwitchTrack = styled.View`
  position: absolute;
  top: 3px;
  left: 0;
  width: 76px;
  height: 42px;
  border-radius: ${({ theme }) => theme.radius.pill}px;
`

/** 仅通过原生transform平移，不逐帧修改React状态或布局。 */
export const SwitchThumb = styled(Animated.View)`
  position: absolute;
  top: 5px;
  left: 2px;
  width: 38px;
  height: 38px;
  border-radius: 19px;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.colors.surface.default};
`

/** 双波纹随前台可见和真实开启状态启停，不承载实时心率。 */
export const SwitchRipple = styled(Animated.View)`
  position: absolute;
  top: 0;
  left: 0;
  width: 38px;
  height: 38px;
  border-radius: 19px;
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.brand.primary};
`

/** 命令未完成时覆盖滑块图案，避免把忙碌误作启停成功。 */
export const PendingOverlay = styled.View`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  border-radius: 19px;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.colors.surface.default};
`
