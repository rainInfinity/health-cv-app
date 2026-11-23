/** 血压主卡沿用原参考阶梯，以同一成功成员的原始双读数确定三级展示。 */
import { useStore } from '@nanostores/react'
import Svg, { Path } from 'react-native-svg'
import { useTheme } from 'styled-components/native'
import type { MeasurementReport } from '@/app/measurement/resultAdapter'
import { AppText } from '@/shared/components/AppText'
import { formatHealthNumber } from '@/shared/healthNumber'
import { bloodPressureResultsMessages } from '../bloodPressureResultsMessages'
import { classifyBloodPressure } from '../bloodPressureAssessment'
import { Assessment, Band, Bands, Boundary, BoundaryRow, Card, Heading, MarkerBubble, MarkerRow, MarkerSlot, Reading, ReadingName, Readings, Reference, Scale, ScaleGuide, ScaleLabel, ScaleLabels, ScaleReference } from './styles'

const LEVELS = ['low', 'normal', 'high'] as const

/** 弹窗与详情复用同一分级、指向标记及真实读数。 */
export function BloodPressureResultCard({ report }: { report?: MeasurementReport | null }) {
  const messages = useStore(bloodPressureResultsMessages)
  const theme = useTheme()
  const item = report?.metrics.bloodPressure
  const mint = theme.colors.brand.gradient.end
  const low = `${theme.colors.accent.blue}33`
  const high = `${theme.colors.accent.rose}33`
  const systolic = item?.status === 'succeeded' ? item.readings.find((reading) => reading.code === 'sbp')?.value : undefined
  const diastolic = item?.status === 'succeeded' ? item.readings.find((reading) => reading.code === 'dbp')?.value : undefined
  const level = systolic !== undefined && diastolic !== undefined ? classifyBloodPressure(systolic, diastolic) : null
  const assessmentColor = level === 'low' ? theme.colors.accent.blue : level === 'normal' ? mint : level === 'high' ? theme.colors.accent.roseMuted : theme.colors.text.primary
  return (
    <Card accessibilityLabel={messages.cardAccessibility}>
      <Scale accessibilityLabel={messages.scaleAccessibility}>
        <ScaleReference>
          <ScaleGuide $position={25} />
          <ScaleGuide $position={75} />
          <BoundaryRow>
            {[
              { value: '90/60', before: low, after: mint },
              { value: '140/90', before: mint, after: high },
            ].map((boundary) => (
              <Boundary key={boundary.value}>
                <Svg width={6} height={8} viewBox="0 0 6 8" accessible={false}><Path d="M6 0 0 4 6 8Z" fill={boundary.before} /></Svg>
                <AppText variant="caption" tone="secondary" style={{ fontWeight: '500' }}>{boundary.value}</AppText>
                <Svg width={6} height={8} viewBox="0 0 6 8" accessible={false}><Path d="m0 0 6 4-6 4Z" fill={boundary.after} /></Svg>
              </Boundary>
            ))}
          </BoundaryRow>
          <ScaleLabels>
            <ScaleLabel variant="caption" $portion={1} style={{ color: theme.colors.accent.blue }}>{messages.lowReference}</ScaleLabel>
            <ScaleLabel variant="caption" $portion={2} style={{ color: theme.colors.brand.action }}>{messages.normalReference}</ScaleLabel>
            <ScaleLabel variant="caption" $portion={1} style={{ color: theme.colors.accent.roseMuted }}>{messages.highReference}</ScaleLabel>
          </ScaleLabels>
        </ScaleReference>
        <Bands>
          <Band $portion={1} $color={low} />
          <Band $portion={2} $color={mint} />
          <Band $portion={1} $color={high} />
        </Bands>
        {level && <MarkerRow>{LEVELS.map((position) => (
          <MarkerSlot key={position} $portion={position === 'normal' ? 2 : 1}>
            {position === level && <MarkerBubble $color={assessmentColor}>
              <Svg width={12} height={6} viewBox="0 0 12 6" style={{ position: 'absolute', top: -6 }} accessible={false}><Path d="m0 6 6-6 6 6Z" fill={assessmentColor} /></Svg>
              <AppText style={{ fontSize: 14, lineHeight: 20, fontWeight: '600', color: theme.colors.surface.default }} numberOfLines={1}>{messages.currentResult}</AppText>
            </MarkerBubble>}
          </MarkerSlot>
        ))}</MarkerRow>}
      </Scale>
      <Assessment $color={assessmentColor}>{level ? messages[`${level}Assessment`] : '--'}</Assessment>
      <Heading>
        <AppText variant="caption" tone="muted">{messages.estimatedPressure}</AppText>
        <AppText variant="caption" tone="muted">{messages.qualityLabel({ score: item?.quality ? formatHealthNumber(item.quality.score) : '--' })}</AppText>
      </Heading>
      <Readings>
        {[
          { code: 'sbp', name: messages.systolic, reference: '90–139' },
          { code: 'dbp', name: messages.diastolic, reference: '60–89' },
        ].map((reading, index) => {
          const value = reading.code === 'sbp' ? systolic : diastolic
          return (
            <Reading key={reading.code} $divider={index === 1}>
              <ReadingName><AppText variant="label">{reading.name}</AppText><AppText variant="caption" tone="muted">mmHg</AppText></ReadingName>
              <AppText variant="display">{value === undefined ? '--' : formatHealthNumber(value)}</AppText>
              <Reference variant="caption" tone="muted">{messages.normalRange} {reading.reference}</Reference>
            </Reading>
          )
        })}
      </Readings>
    </Card>
  )
}
