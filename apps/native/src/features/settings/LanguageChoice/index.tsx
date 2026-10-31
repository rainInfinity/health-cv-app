/** 呈现具有单选无障碍语义的语言选项。 */

import type { LanguagePreference } from '@/app/preferences'
import { AppText } from '@/shared/components/AppText'

import { Option, RadioInner, RadioOuter } from './styles'

/** 描述已持久化的语言选项及选择行为。 */
export interface LanguageChoiceProps {
  /** 持久化的语言选择值。 */
  value: LanguagePreference
  /** 按当前 locale 显示的选项名称。 */
  label: string
  /** 是否为当前生效的选择。 */
  selected: boolean
  /** 当前选中或可切换时提供的辅助提示。 */
  hint: string
  /** 保存用户选择。 */
  onSelect(value: LanguagePreference): void
}

/** 绘制具备 radio 语义、触控面积和选中视觉状态的单个选项。 */
export function LanguageChoice({ value, label, selected, hint, onSelect }: LanguageChoiceProps) {
  return (
    <Option
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={() => onSelect(value)}
      $selected={selected}
    >
      <RadioOuter $selected={selected}>
        {selected && <RadioInner />}
      </RadioOuter>
      <AppText variant="label">{label}</AppText>
    </Option>
  )
}
