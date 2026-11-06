/** 绘制底部导航使用的历史记录线性图标。 */

import Svg, { Path } from 'react-native-svg'

/** 描述历史图标的原生颜色与尺寸。 */
export interface HistoryIconProps {
  /** 图标描边颜色。 */
  color: string
  /** 图标边长，单位 dp。 */
  size: number
}

/** 按导航栏尺寸绘制装饰性的历史记录图标。 */
export function HistoryIcon({ color, size }: HistoryIconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
    >
      <Path d="M3 11a9 9 0 1 1 2.7 7M3 4v7h7M12 7v5l3 2" />
    </Svg>
  )
}
