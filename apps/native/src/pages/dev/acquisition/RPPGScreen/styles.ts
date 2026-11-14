/** 定义主动 RPPG 预览、进度和产物列表样式。 */

import { StyleSheet } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import styled from 'styled-components/native'

/** 让独立 Nitro 预览视图填满裁切容器。 */
export const rppgPreviewStyle: StyleProp<ViewStyle> = StyleSheet.absoluteFill

/** 保持相机四比三画面比例并用主题圆角裁切。 */
export const PreviewFrame = styled.View`
  position: relative;
  width: 100%;
  aspect-ratio: 1.3333;
  overflow: hidden;
  border-radius: ${({ theme }) => theme.radius.lg}px;
  background-color: ${({ theme }) => theme.colors.surface.subtle};
`

/** 未打开相机时显示静态说明，不代替原生预览内容。 */
export const PreviewPlaceholder = styled.View`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.lg}px;
  background-color: ${({ theme }) => theme.colors.surface.subtle};
`

/** 以中性表面显示有限测量进度。 */
export const ProgressTrack = styled.View`
  height: 8px;
  overflow: hidden;
  border-radius: 4px;
  background-color: ${({ theme }) => theme.colors.surface.subtle};
`

/** 按测量比例填充品牌进度色。 */
export const ProgressFill = styled.View<{ $progress: number }>`
  width: ${({ $progress }) => `${$progress * 100}%`};
  height: 100%;
  border-radius: 4px;
  background-color: ${({ theme }) => theme.colors.brand.primary};
`

/** 分隔独立完成会话的文件引用。 */
export const ArtifactGroup = styled.View`
  gap: ${({ theme }) => theme.spacing.sm}px;
  padding-top: ${({ theme }) => theme.spacing.md}px;
  border-top-width: ${StyleSheet.hairlineWidth}px;
  border-top-color: ${({ theme }) => theme.roles.divider};
`

/** 在一个文件引用中显示用途、路径和大小。 */
export const ArtifactFile = styled.View`
  gap: ${({ theme }) => theme.spacing.xs}px;
`
