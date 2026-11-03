/** 定义主动采集页面的预览、操作和文件样式。 */

import { StyleSheet } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import styled from 'styled-components/native'

/** 为相机预览保留原生组件要求的绝对填充样式。 */
export const cameraPreviewStyle: StyleProp<ViewStyle> = StyleSheet.absoluteFill

/** 承载方形预览并裁切原生相机画面。 */
export const PreviewFrame = styled.View`
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: ${({ theme }) => theme.radius.md}px;
  background-color: ${({ theme }) => theme.colors.surface.subtle};
`

/** 相机未开启时覆盖预览的说明表面。 */
export const PreviewPlaceholder = styled.View`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.colors.surface.subtle};
`

/** 纵向排列主动相机操作。 */
export const ActionGroup = styled.View`
  gap: ${({ theme }) => theme.spacing.sm}px;
`

/** 以分隔线区分独立采集文件。 */
export const FileGroup = styled.View`
  gap: ${({ theme }) => theme.spacing.xs}px;
  padding-top: ${({ theme }) => theme.spacing.sm}px;
  border-top-width: ${StyleSheet.hairlineWidth}px;
  border-top-color: ${({ theme }) => theme.roles.divider};
`

/** 在一个文件条目内排列路径与文件大小。 */
export const ArtifactFile = styled.View`
  gap: ${({ theme }) => theme.spacing.xs}px;
  padding-top: ${({ theme }) => theme.spacing.xs}px;
`
