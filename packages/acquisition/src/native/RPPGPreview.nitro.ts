/** 定义只挂接主动 RPPG 相机会话的原生预览视图。 */

import type {
  HybridView,
  HybridViewMethods,
  HybridViewProps,
} from 'react-native-nitro-modules'

/** 原生预览不接收图像、像素或控制参数。 */
export interface RPPGPreviewProps extends HybridViewProps {}

/** 预览显示由同一 RPPG runtime 的原生相机会话管理。 */
export interface RPPGPreviewMethods extends HybridViewMethods {}

/** 仅供主动 RPPG runtime 绑定的 Android 前摄预览视图。 */
export type RPPGPreview = HybridView<
  RPPGPreviewProps,
  RPPGPreviewMethods,
  { android: 'kotlin' }
>
