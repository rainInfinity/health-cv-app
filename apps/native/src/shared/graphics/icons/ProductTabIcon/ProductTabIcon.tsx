/** 按设计稿轮廓绘制四个产品 Tab 的描边与实心图标。 */

import { useId } from 'react'
import Svg, { Circle, Defs, Mask, Path, Rect } from 'react-native-svg'

/** 产品底栏的健康、功能、历史和我的四类图形。 */
export type ProductTabIconKind = 'home' | 'features' | 'history' | 'user'

/** 定义产品图标类别、选中状态与稳定的绘制尺寸。 */
export interface ProductTabIconProps {
  /** 产品入口对应的图形类别。 */
  kind: ProductTabIconKind
  /** 选中时填充同一轮廓，未选中时只描边。 */
  selected: boolean
  /** 由导航主题提供的前景色。 */
  color: string
  /** 图标边长，单位 dp，选中前后保持一致。 */
  size: number
}

/** 绘制装饰图标；历史选中态通过实例独立蒙版镂空时针。 */
export function ProductTabIcon({ kind, selected, color, size }: ProductTabIconProps) {
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const historyMaskId = `product-tab-history-hands-${instanceId}`

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={selected ? color : 'none'}
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
    >
      {kind === 'home' && (
        <Path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
      )}
      {kind === 'features' && (
        <>
          <Rect x={3} y={3} width={7} height={7} rx={2} />
          <Rect x={14} y={3} width={7} height={7} rx={2} />
          <Rect x={3} y={14} width={7} height={7} rx={2} />
          <Rect x={14} y={14} width={7} height={7} rx={2} />
        </>
      )}
      {kind === 'history' && (
        <>
          {selected && (
            <Defs>
              <Mask
                id={historyMaskId}
                x={0}
                y={0}
                width={24}
                height={24}
                maskUnits="userSpaceOnUse"
                maskContentUnits="userSpaceOnUse"
              >
                <Rect width={24} height={24} fill="white" stroke="none" />
                <Path d="M12 7v5l3 2" fill="none" stroke="black" />
              </Mask>
            </Defs>
          )}
          <Path
            d="M12 3a9 9 0 1 1-9 9H1V5l2.9 2.9A9 9 0 0 1 12 3Z"
            mask={selected ? `url(#${historyMaskId})` : undefined}
          />
          {!selected && <Path d="M12 7v5l3 2" />}
        </>
      )}
      {kind === 'user' && (
        <>
          <Circle cx={12} cy={7} r={4} />
          <Path d="M4 21v-2a8 6 0 0 1 16 0v2Z" />
        </>
      )}
    </Svg>
  )
}
