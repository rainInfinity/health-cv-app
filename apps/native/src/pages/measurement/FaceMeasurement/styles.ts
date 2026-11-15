/** 还原面部检测取景区、稳定读数槽位及全宽顶部圆角面板。 */

import styled from 'styled-components/native'

/** 页面只在自身分配一次系统安全区。 */
export const Screen = styled.View`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.surface.default};
`

/** 顶栏采用至少 48 dp 返回触控区，不绘制模拟系统状态栏。 */
export const Header = styled.View`
  flex-direction: row;
  align-items: center;
  min-height: 48px;
  padding-horizontal: ${({ theme }) => theme.spacing.md}px;
`

/** 取景提示与面板间距按 Demo 保持独立。 */
export const Viewfinder = styled.View`
  align-items: center;
  padding-top: 12px;
  padding-bottom: 14px;
`

/** 保持原生预览的 5:4 比例，尺寸由可用高度决定。 */
export const CameraFrame = styled.View`
  aspect-ratio: 1.25;
  overflow: hidden;
  background-color: ${({ theme }) => theme.colors.surface.default};
`

/** 覆盖未开启相机的空态，不用照片冒充实时画面。 */
export const Placeholder = styled.View`
  position: absolute;
  inset: 0;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.colors.brand.subtle};
`

/** 前摄标签只标识构图区，不代表人脸识别质量。 */
export const PreviewLabel = styled.View`
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 4px 10px;
  border-radius: ${({ theme }) => theme.radius.pill}px;
  background-color: ${({ theme }) => theme.colors.surface.card};
`

/** 白色面板全宽延伸到底部，仅保留两个顶部圆角。 */
export const Panel = styled.View`
  flex-grow: 1;
  border-top-left-radius: ${({ theme }) => theme.radius.lg}px;
  border-top-right-radius: ${({ theme }) => theme.radius.lg}px;
  background-color: ${({ theme }) => theme.colors.surface.default};
`

/** 读数区适应字号放大，不以关闭字号缩放换取固定高度。 */
export const Readout = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`

/** 波形标题与曲线构成可延伸的下半区。 */
export const WavePanel = styled.View`
  flex-grow: 1;
  margin-top: 8px;
  padding-top: 8px;
`

/** 单一主操作保留 Demo 的百分之九十宽度。 */
export const Footer = styled.View`
  width: 90%;
  align-self: center;
  margin-top: 16px;
`
