/** 定义首次引导的品牌工具栏、插画和权限说明布局。 */

import styled from 'styled-components/native'

/** 纵向排列两步引导的品牌及主体内容。 */
export const OnboardingContent = styled.View`
  flex: 1;
  gap: 0;
`

/** 将品牌或返回操作与跳过入口对齐。 */
export const OnboardingToolbar = styled.View`
  min-height: ${({ theme }) => theme.icon.touchTarget}px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`

/** 紧凑展示品牌图形和名称。 */
export const BrandMini = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs}px;
`

/** 提供带图标的引导返回触控区域。 */
export const HeaderAction = styled.Pressable`
  min-height: ${({ theme }) => theme.icon.touchTarget}px;
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xxs}px;
  padding-horizontal: ${({ theme }) => theme.spacing.xs}px;
`

/** 将跳过操作保持为轻量文字按钮。 */
export const SkipButton = styled.Pressable`
  min-height: ${({ theme }) => theme.icon.touchTarget}px;
  justify-content: center;
  padding-horizontal: ${({ theme }) => theme.spacing.sm}px;
`

/** 将标题与说明按设计稿留出稳定阅读间距。 */
export const OnboardingCopy = styled.View`
  gap: ${({ theme }) => theme.spacing.sm}px;
  margin-top: ${({ theme }) => theme.spacing.lg}px;
`

/** 按设计稿留出插画舞台并与顶部说明分层。 */
export const HeroArtwork = styled.View`
  align-items: center;
  margin-top: ${({ theme }) => theme.spacing.md}px;
`

/** 固定主插画的最小舞台高度，避免横向尺寸变化挤压插画。 */
export const HeroStage = styled.View`
  width: 100%;
  min-height: ${({ theme }) => theme.layout.onboardingHeroStageHeight}px;
  align-items: center;
  justify-content: center;
`

/** 将三项次级健康功能紧凑平铺。 */
export const FeatureTiles = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.xs}px;
  margin-top: ${({ theme }) => theme.spacing.lg}px;
`

/** 让插画与标签在各自等宽单元中居中。 */
export const FeatureTile = styled.View`
  flex: 1;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs}px;
`

/** 将进度、主操作和说明统一锚定在页面底部。 */
export const OnboardingFooter = styled.View`
  margin-top: auto;
  padding-top: ${({ theme }) => theme.spacing.sm}px;
`

/** 使用两个面点呈现当前引导步骤。 */
export const StepProgress = styled.View`
  height: 6px;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.layout.onboardingProgressGap}px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`

/** 以长短面点区分当前引导步骤。 */
export const ProgressDot = styled.View<{ $active: boolean }>`
  width: ${({ $active }) => $active ? 22 : 6}px;
  height: 6px;
  border-radius: 3px;
  background-color: ${({ theme, $active }) =>
    $active ? theme.colors.brand.action : theme.colors.border.default};
`

/** 在单一卡片内排列不主动申请权限的用途说明。 */
export const PermissionRows = styled.View`
  gap: 0;
`

/** 将权限图标与多行说明按首行对齐，末行不绘制分隔线。 */
export const PermissionRow = styled.View<{ $last?: boolean }>`
  flex-direction: row;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.sm}px;
  padding-vertical: ${({ theme }) => theme.layout.permissionRowPadding}px;
  border-bottom-width: ${({ $last }) => ($last ? 0 : 1)}px;
  border-bottom-color: ${({ theme }) => theme.colors.border.default};
`

/** 为权限文字保留可换行宽度。 */
export const PermissionCopy = styled.View`
  flex: 1;
  gap: ${({ theme }) => theme.layout.permissionDescriptionGap}px;
`

/** 为权限说明图标提供柔和品牌底。 */
export const PermissionIcon = styled.View`
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background-color: ${({ theme }) => theme.colors.brand.subtle};
`

/** 将说明文字放在页面底部并保持居中。 */
export const Footnote = styled.View`
  align-items: center;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
`
