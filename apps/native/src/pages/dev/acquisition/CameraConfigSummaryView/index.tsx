/** 汇总请求配置、实际采集参数和文件布局。 */

import type { CameraConfig, CameraConfigSummary } from '@health-cv-app/acquisition'
import { useStore } from '@nanostores/react'
import { acquisitionMessages } from '@/pages/dev/acquisition/acquisitionMessages'
import type { AcquisitionMessageValues } from '@/pages/dev/acquisition/acquisitionMessages'
import { AppCard } from '@/shared/components/AppCard'
import { AppText } from '@/shared/components/AppText'

import { SummaryDetails } from './styles'

/** 描述需要展示的配置摘要及其上下文标题。 */
export interface CameraConfigSummaryViewProps {
  /** 区分当前状态或产物的说明标题。 */
  title: string
  /** 原生侧冻结并返回的配置与帧摘要。 */
  summary: CameraConfigSummary
}

/** 展示请求、提交、调整原因、实际帧几何及完成布局。 */
export function CameraConfigSummaryView({ title, summary }: CameraConfigSummaryViewProps) {
  const messages = useStore(acquisitionMessages)
  const actualFrame = summary.actualFrame
  const details = [
    ...formatCameraConfig(messages.requestedConfig, summary.requestedConfig, messages),
    ...formatCameraConfig(messages.submittedConfig, summary.submittedConfig, messages),
    ...(summary.adjustments.length === 0
      ? [`${messages.adjustments}：${messages.noAdjustments}`]
      : summary.adjustments.map((adjustment) =>
          `${messages.adjusted} ${fieldLabel(adjustment.field, messages)}：${adjustment.requestedValue} → ${adjustment.submittedValue}；${messages.deviceDetailsUnavailable}`,
        )),
    `${messages.actualLayout}：[${summary.blockLayout.rows}, ${summary.blockLayout.columns}]`,
    actualFrame == null
      ? messages.frameGeometryPending
      : `${messages.actualFrame}：${actualFrame.width} × ${actualFrame.height} px；${messages.crop} (${actualFrame.crop.left}, ${actualFrame.crop.top}) ${actualFrame.crop.width} × ${actualFrame.crop.height} px；${messages.observedFps}：${summary.observedFps ?? messages.notMeasured}`,
  ]

  return (
    <AppCard variant="subtle">
      <AppText variant="section">{title}（{messages.cameraId} {summary.cameraId}）</AppText>
      <SummaryDetails>
        {details.map((detail, index) => (
          <AppText key={`${title}-${index}`} variant="caption">{detail}</AppText>
        ))}
      </SummaryDetails>
    </AppCard>
  )
}

/** 用当前语言展示冻结配置中的模式、参数及设备单位。 */
function formatCameraConfig(
  label: string,
  config: CameraConfig,
  messages: AcquisitionMessageValues,
): string[] {
  const exposure = config.exposure
  const frame = config.targetResolution
  return [
    `${label} ${messages.targetSize}：${frame.width} × ${frame.height} px；${messages.targetFpsLabel}：${config.targetFps}`,
    `${label} ${messages.exposureMode}：${modeLabel(exposure.mode, messages)}；${messages.exposureTimeLabel}：${exposure.timeNanos == null ? messages.notApplicable : `${exposure.timeNanos} ns`}；${messages.capabilityIso}：${exposure.iso ?? messages.notApplicable}；${messages.compensationLabel}：${exposure.compensationIndex ?? messages.notApplicable}（${messages.deviceEvStep}）；${messages.requestedAeLock}：${exposure.locked ? messages.yes : messages.no}`,
    `${label} ${messages.whiteBalanceLabel}：${modeLabel(config.whiteBalance.mode, messages)}；${messages.requestedAwbLock}：${config.whiteBalance.locked ? messages.yes : messages.no}`,
    `${label} ${messages.focusLabel}：${modeLabel(config.focus.mode, messages)}；${messages.manualDistanceLabel}：${config.focus.distanceDiopters == null ? messages.notApplicable : `${config.focus.distanceDiopters} D`}`,
    `${label} ${messages.torchLabel}：${config.torchEnabled ? messages.on : messages.off}；${messages.blocksLabel}：[${config.processing.blocks.join(', ')}]`,
  ]
}

/** 将已知配置字段路径映射为本地化标签。 */
function fieldLabel(field: string, messages: AcquisitionMessageValues): string {
  if (field.startsWith('targetResolution')) return messages.fieldTargetResolution
  if (field.startsWith('targetFps')) return messages.fieldTargetFps
  if (field.startsWith('exposure')) return messages.fieldExposure
  if (field.startsWith('whiteBalance')) return messages.fieldWhiteBalance
  if (field.startsWith('focus')) return messages.fieldFocus
  if (field.startsWith('torch')) return messages.fieldTorch
  if (field.startsWith('processing')) return messages.fieldProcessing
  return messages.unknownField
}

/** 将相机模式转换为本地化名称，未知扩展模式使用安全通用文案。 */
function modeLabel(mode: string, messages: AcquisitionMessageValues): string {
  const labels: Record<string, string> = {
    auto: messages.auto,
    off: messages.off,
    manual: messages.manual,
    incandescent: messages.incandescent,
    fluorescent: messages.fluorescent,
    'warm-fluorescent': messages.warmFluorescent,
    daylight: messages.daylight,
    'cloudy-daylight': messages.cloudyDaylight,
    twilight: messages.twilight,
    shade: messages.shade,
  }
  return labels[mode] ?? messages.capabilityUnknown
}
