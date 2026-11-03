/** 以本地矢量路径展示心沐双水意环品牌标志。 */

import { useId } from 'react'
import Svg, { Defs, LinearGradient, Mask, Path, Rect, Stop, G } from 'react-native-svg'

/** 描述品牌标志尺寸及辅助技术替代文本。 */
export interface XinmuLogoProps {
  /** 图标宽高，单位 dp。 */
  size?: number
  /** 留空时作为装饰图形隐藏于辅助技术。 */
  accessibilityLabel?: string
}

/** 按原始比例绘制本地心沐标志，不使用远程资源。 */
export function XinmuLogo({ size = 40, accessibilityLabel }: XinmuLogoProps) {
  const instanceId = useId().replace(/:/g, '')
  const gradientId = `xinmu-brand-${instanceId}`
  const maskId = `xinmu-heart-${instanceId}`
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      accessible={accessibilityLabel != null}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel != null ? 'image' : undefined}
    >
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <Stop stopColor="#0AB6C0" />
          <Stop offset="1" stopColor="#2BC7A0" />
        </LinearGradient>
        <Mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="160" height="160">
          <Path fill="white" d="M72 134C56 122 20 98 17 65C15 43 29 28 47 28C61 28 67 36 75 43Q80 48 85 43C93 36 99 28 113 28C131 28 145 43 143 65C140 98 104 122 88 134Q80 142 72 134Z" />
          <Path d="M39 79C52 65 62 65 75 79S99 93 121 70" fill="none" stroke="black" strokeWidth="11" strokeLinecap="round" />
        </Mask>
      </Defs>
      <G fill={`url(#${gradientId})`}>
        <Rect x="0" y="0" width="160" height="160" mask={`url(#${maskId})`} />
        <G opacity="0.62">
          <Path d="M65 145C40 145 17 139 17 131C17 125 28 122 39 122C24 126 25 131 37 135C45 139 56 143 65 145Z" />
          <Path d="M95 145C120 145 143 139 143 131C143 125 132 122 121 122C136 126 135 131 123 135C115 139 104 143 95 145Z" />
        </G>
        <G opacity="0.44">
          <Path d="M44 124C35 126 39 130 60 136C45 134 33 130 35 127C36 125 40 124 44 124Z" />
          <Path d="M116 124C125 126 121 130 100 136C115 134 127 130 125 127C124 125 120 124 116 124Z" />
        </G>
      </G>
    </Svg>
  )
}
