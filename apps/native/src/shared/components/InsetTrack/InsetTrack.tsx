/** 胶囊底色与原生模糊阴影分层，不使用 SVG 描边模拟凹槽。 */
import { useId } from 'react'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { useTheme } from 'styled-components/native'
import { TrackShadow, TrackSurface } from './styles'

/** 凹槽或选中滑块的展示尺寸，不处理触控与动画。 */
interface InsetTrackProps {
  /** 画布宽度，单位 dp。 */
  width: number
  /** 画布高度，单位 dp。 */
  height: number
  /** 是否使用品牌渐变，默认中性表面。 */
  highlighted?: boolean
  /** 是否绘制柔和内阴影；历史选中滑块关闭并由外层提供投影。 */
  recessed?: boolean
}

/** 为无扰开关和历史周期选择绘制同源胶囊表面。 */
export function InsetTrack({ width, height, highlighted = false, recessed = true }: InsetTrackProps) {
  const theme = useTheme()
  const id = `inset-track-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <TrackSurface accessible={false} pointerEvents="none" style={{ width, height, borderRadius: height / 2, backgroundColor: highlighted ? theme.colors.brand.primary : theme.colors.surface.subtle }}>
      {highlighted && <Svg width={width} height={height} accessible={false}>
        <Defs>
          <LinearGradient id={`${id}-base`} x1="0%" y1="0%" x2="100%" y2="27%">
            <Stop stopColor={theme.colors.brand.gradient.start} /><Stop offset="1" stopColor={theme.colors.brand.gradient.end} />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={height} rx={height / 2} fill={`url(#${id}-base)`} />
      </Svg>}
      {recessed && <TrackShadow pointerEvents="none" style={{
        borderRadius: height / 2,
        boxShadow: highlighted
          ? `inset 0px 1px 2px ${theme.colors.surface.default}A6, inset 0px -2px 3px ${theme.colors.brand.action}47`
          : `inset 2px 3px 6px ${theme.colors.text.primary}24, inset -2px -2px 5px ${theme.colors.surface.default}E6`,
      }} />}
    </TrackSurface>
  )
}
