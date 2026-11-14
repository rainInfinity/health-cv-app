/** 按 Demo 原路径绘制四项准备中的线性图标。 */

import type { ReactNode } from 'react'
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg'
import { useTheme } from 'styled-components/native'

import { IconFrame } from './styles'

/** 静态准备动作，只表达放置方式而不表示设备已启动。 */
export type PreparationIconKind = 'sound' | 'light' | 'face' | 'still' | 'cover' | 'gentle' | 'stable' | 'chest'

const ART = {
  sound: <><Path d="m11 4-5 4H3v8h3l5 4V4Z" /><Path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></>,
  light: <><Circle cx="12" cy="12" r="4" /><Path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
  face: <><Path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5" /><Ellipse cx="12" cy="11" rx="4" ry="5" /><Path d="M7 19q5-4 10 0" /></>,
  still: <Path d="M8 4v4m8-4v4M5 11h14M7 15q5 5 10 0M3 3v18m18-18v18" />,
  cover: <><Rect x="5" y="2" width="14" height="20" rx="3" /><Circle cx="9" cy="6" r="1.5" /><Path d="M10 16V9a2 2 0 0 1 4 0v5m0-2 3 1" /></>,
  gentle: <Path d="M8 13V6a2 2 0 0 1 4 0v6m0-2 5 2a3 3 0 0 1 2 3v3a3 3 0 0 1-3 3h-5l-6-6a2 2 0 0 1 3-3l2 2M3 4l2 2m12-2-2 2" />,
  stable: <Path d="M4 8V4h4m8 0h4v4M4 16v4h4m8 0h4v-4M8 12h8m-4-4v8" />,
  chest: <><Circle cx="12" cy="5" r="3" /><Path d="M4 21v-6a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v6" /><Rect x="10" y="12" width="6" height="8" rx="1" /></>,
} satisfies Record<PreparationIconKind, ReactNode>

/** 将准备动作绘制在统一的装饰图标槽位。 */
export function PreparationIcon({ kind }: { kind: PreparationIconKind }) {
  const theme = useTheme()
  return (
    <IconFrame accessible={false}>
      <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={theme.colors.brand.action} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        {ART[kind]}
      </Svg>
    </IconFrame>
  )
}
