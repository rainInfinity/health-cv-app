/** 定义原生 ECharts 波形画布与覆盖空态。 */

import { Animated } from 'react-native'
import styled from 'styled-components/native'

/** 将图表限定在实际测量的区域内，避免内容溢出影响分页。 */
export const ChartFrame = styled.View`
  width: 100%;
  overflow: hidden;
  border-radius: ${({ theme }) => theme.radius.md}px;
`

/** 扩展画布只在原生合成层平移，外层负责裁切六秒可见区域。 */
export const MovingChart = styled(Animated.View)`
  position: absolute;
  top: 0;
`

/** 将移动画布裁切在真实坐标区域，禁止新点进入左右布局留白。 */
export const ChartClip = styled.View`
  position: absolute;
  overflow: hidden;
`

/** 用浮点 transform 补偿采样坐标，避免 left 布局逐批取整产生亚像素反跳。 */
export const ChartOrigin = styled.View`
  position: absolute;
  left: 0;
  top: 0;
`

/** 空态覆盖在图表上方，不参与画布尺寸计算。 */
export const ChartPlaceholder = styled.View`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.md}px;
`
