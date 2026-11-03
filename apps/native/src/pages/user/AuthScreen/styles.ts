/** 定义认证页工具栏、品牌区域和表单布局。 */

import styled from 'styled-components/native'

/** 将返回操作与模式切换对齐到同一工具栏。 */
export const AuthToolbar = styled.View`
  min-height: ${({ theme }) => theme.icon.touchTarget}px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`

/** 为认证返回操作提供独立触控目标。 */
export const BackButton = styled.Pressable`
  width: ${({ theme }) => theme.icon.touchTarget}px;
  height: ${({ theme }) => theme.icon.touchTarget}px;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.radius.md}px;
  background-color: ${({ theme }) => theme.colors.surface.card};
`

/** 将登录与注册切换保持为轻量文字操作。 */
export const AuthSwitch = styled.Pressable`
  min-height: ${({ theme }) => theme.icon.touchTarget}px;
  justify-content: center;
  padding-horizontal: ${({ theme }) => theme.spacing.sm}px;
`

/** 将 64 dp 品牌标志与名称、口号横向居中。 */
export const AuthBrand = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.sm}px;
  margin-top: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`

/** 将品牌名称和口号左对齐排列。 */
export const AuthBrandCopy = styled.View`
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.xxs}px;
`

/** 纵向排列认证字段，注册提示与字段间距按 Demo 单独分组。 */
export const AuthFields = styled.View<{ $register: boolean }>`
  gap: ${({ theme, $register }) => ($register ? theme.spacing.sm : theme.spacing.lg)}px;
`

/** 将注册密码建议与密码输入保持紧邻。 */
export const AuthPasswordField = styled.View<{ $register: boolean }>`
  margin-top: ${({ theme, $register }) => ($register ? theme.spacing.xxs : 0)}px;
  gap: ${({ theme, $register }) => ($register ? theme.spacing.xs : 0)}px;
`
/** 将表单模式切换放在主操作下方，补足认证页的次级入口。 */
export const AuthAlternate = styled.View<{ $register: boolean }>`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.xxs}px;
  margin-top: ${({ theme, $register }) => ($register ? theme.spacing.xxs : theme.spacing.md)}px;
`

/** 为认证模式切换提供完整触控区域。 */
export const AuthAlternateAction = styled.Pressable`
  min-height: ${({ theme }) => theme.icon.touchTarget}px;
  justify-content: center;
  padding-horizontal: ${({ theme }) => theme.spacing.xxs}px;
`

/** 将主操作与表单间距按认证模式区分，并容纳注册说明。 */
export const AuthSubmit = styled.View<{ $register: boolean }>`
  gap: ${({ theme, $register }) => ($register ? theme.spacing.md : 0)}px;
  margin-top: ${({ theme, $register }) => ($register ? theme.spacing.xs : theme.spacing.xxs)}px;
`

/** 以中性正文和装饰盾牌排列认证隐私说明。 */
export const AuthFootnote = styled.View<{ $register: boolean }>`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.xs}px;
  margin-top: ${({ theme, $register }) => ($register ? theme.spacing.sm : theme.spacing.xl)}px;
  margin-horizontal: ${({ theme }) => theme.spacing.sm}px;
`


/** 将密码显隐图标叠放在输入框右侧并保留触控尺寸。 */
export const PasswordToggle = styled.Pressable`
  position: absolute;
  top: 28px;
  right: 0;
  width: ${({ theme }) => theme.icon.touchTarget}px;
  height: ${({ theme }) => theme.icon.touchTarget}px;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.radius.md}px;
`
