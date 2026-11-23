/** 复用 Demo 的圆角对称倒梯形及仅向左渐隐的细边。 */

import { useId } from 'react'
import Svg, { Defs, LinearGradient, Path, Rect, Stop, Text } from 'react-native-svg'
import { useTheme } from 'styled-components/native'
import { formatHealthNumber } from '@/shared/healthNumber'
import { BadgeFrame } from './styles'

export interface SignalQualityBadgeProps {
  /** 服务端实际信号质量分数，不转换为医学准确率。 */
  score: number
  /** 含指标和实际信号质量分数的完整说明。 */
  accessibilityLabel: string
}

/** 仅按设计稿的质量分段着色，不表示医学评估。 */
export function SignalQualityBadge({ score, accessibilityLabel }: SignalQualityBadgeProps) {
  const theme = useTheme()
  const id = `quality-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const color = score >= 90 ? theme.colors.brand.gradient.end : score >= 80 ? theme.colors.illustration.flash : theme.colors.illustration.roseLight
  if (!Number.isFinite(score) || score < 70) return null
  return (
    <BadgeFrame pointerEvents="none" accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Svg width={64} height={16} viewBox="0 0 64 16" accessible={false}>
        <Defs>
          <LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0" stopColor={color} stopOpacity={0} />
            <Stop offset={10 / 18} stopColor={color} stopOpacity={1} />
            <Stop offset="1" stopColor={color} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width={18} height={2} fill={`url(#${id})`} />
        <Path d="M13 0 H51 Q54 0 52.41 2.544 L45.59 13.456 Q44 16 41 16 H23 Q20 16 18.41 13.456 L11.59 2.544 Q10 0 13 0 Z" fill={color} />
        <Text x={32} y={11} textAnchor="middle" fontSize={10} fontWeight="600" fill={theme.colors.surface.default}>{formatHealthNumber(score)}</Text>
      </Svg>
    </BadgeFrame>
  )
}
