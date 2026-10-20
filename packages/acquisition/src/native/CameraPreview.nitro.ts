/** 定义不启动相机、仅挂接当前会话预览的 Nitro 原生视图。 */

import type {
  HybridView,
  HybridViewMethods,
  HybridViewProps,
} from 'react-native-nitro-modules'

/** 预览视图没有高频图像或样本属性。 */
export interface CameraPreviewProps extends HybridViewProps {}

/** 预览显示由同一相机会话的原生 Surface 管理。 */
export interface CameraPreviewMethods extends HybridViewMethods {}

/** Android 原生 Surface 预览视图。 */
export type CameraPreview = HybridView<
  CameraPreviewProps,
  CameraPreviewMethods,
  { android: 'kotlin' }
>
