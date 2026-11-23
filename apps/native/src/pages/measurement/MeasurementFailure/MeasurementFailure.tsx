/** 接触式失败只提供与真实失败分类对应的操作，不生成失败报告。 */
import type { ReactNode } from 'react'
import Svg, { Circle, Path } from 'react-native-svg'
import { useTheme } from 'styled-components/native'
import { AppText } from '@/shared/components/AppText'
import { ActionButton } from '@/shared/components/ActionButton'
import { Body, Heading, Title, Hint, Actions } from './styles'

/** 两种接触方式共用已确认的失败文案契约。 */
export interface MeasurementFailureMessages {
  detectionFailedTitle: string
  detectionFailedHint: string
  queryFailedTitle: string
  queryFailedHint: string
  creationFailedTitle: string
  creationFailedHint: string
  retryResults: string
  retest: string
}

/** 标题与40dp图标同行居中，说明独立居中，失败不显示健康声明。 */
export function MeasurementFailure({ kind, messages, onRetry, children }: { kind: 'detection' | 'query' | 'creation'; messages: MeasurementFailureMessages; onRetry(): void; children?: ReactNode }) {
  const theme = useTheme()
  return <Body>
    <Heading><Svg width={40} height={40} viewBox="0 0 24 24" accessible={false}><Circle cx={12} cy={12} r={11} fill={theme.colors.feedback.error} /><Path d="m8 8 8 8m0-8-8 8" fill="none" stroke={theme.colors.surface.default} strokeWidth={2} strokeLinecap="round" /></Svg><Title accessibilityRole="header">{messages[`${kind}FailedTitle`]}</Title></Heading>
    <Hint>{messages[`${kind}FailedHint`]}</Hint>
    {children}
    <Actions><ActionButton label={kind === 'query' ? messages.retryResults : messages.retest} onPress={onRetry} /></Actions>
  </Body>
}
