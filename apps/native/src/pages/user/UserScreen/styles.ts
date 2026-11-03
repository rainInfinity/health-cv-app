/** 定义用户中心身份、账户操作和分组入口布局。 */

import styled from 'styled-components/native'

/** 纵向排列用户身份、认证操作与状态提示。 */
export const AccountPanel = styled.View`
  gap: ${({ theme }) => theme.spacing.md}px;
`

/** 将头像、真实账号状态和认证入口排列在同一行。 */
export const AccountIdentity = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md}px;
`

/** 为账号身份提供明亮、中性的圆形头像底。 */
export const AccountAvatar = styled.View`
  width: 64px;
  height: 64px;
  align-items: center;
  justify-content: center;
  border-radius: 32px;
  background-color: ${({ theme }) => theme.colors.surface.card};
`

/** 纵向排列名称与辅助状态，不挤压头像。 */
export const AccountCopy = styled.View`
  flex: 1;
  gap: ${({ theme }) => theme.spacing.xxs}px;
`

/** 将账户主操作保持为内容区的九成宽，并对应 Demo 的 24 dp 上间距。 */
export const AccountAction = styled.View`
  width: 90%;
  align-self: center;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`

/** 以轻量文字行保留账号状态重试入口。 */
export const RetryButton = styled.Pressable`
  min-height: ${({ theme }) => theme.icon.touchTarget}px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-horizontal: ${({ theme }) => theme.spacing.xs}px;
`


/** 以独立卡片间距划分个人信息与设置入口。 */
export const MenuGroups = styled.View`
  gap: ${({ theme }) => theme.spacing.md}px;
`

/** 以 52 dp 触控高度展示账户设置入口。 */
export const MenuRow = styled.Pressable`
  min-height: 52px;
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm}px;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.border.default};
`


/** 将数据隐私说明与设置卡片保持轻量分隔。 */
export const PrivacyFootnote = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.xs}px;
  padding-horizontal: ${({ theme }) => theme.spacing.xs}px;
  padding-bottom: ${({ theme }) => theme.spacing.xs}px;
`
