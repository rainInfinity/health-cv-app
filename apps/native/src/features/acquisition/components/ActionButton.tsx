/** 提供主动采集与被动服务页面共用的状态按钮。 */

import { Pressable, StyleSheet, Text } from 'react-native'

/** 描述采集控制页面中的单个按钮。 */
interface ActionButtonProps {
  /** 按钮上展示的操作名称。 */
  label: string
  /** 当前命令进行中时禁用操作。 */
  disabled: boolean
  /** 是否采用次要按钮样式。 */
  secondary?: boolean
  /** 用户手动触发的同步界面操作。 */
  onPress: () => void
}

/** 呈现应用采集页面统一样式的操作按钮。 */
export function ActionButton({ label, disabled, secondary = false, onPress }: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressedButton,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: { minHeight: 48, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#155eef' },
  secondaryButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#c7d0d9' },
  disabledButton: { opacity: 0.5 },
  pressedButton: { opacity: 0.8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButtonText: { color: '#344054' },
})
