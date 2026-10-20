/** 将当前原生相机会话的预览 Surface 映射为 React Native 视图。 */

import type { ViewProps } from 'react-native'
import { getHostComponent } from 'react-native-nitro-modules'

import CameraPreviewViewConfig from '../../nitrogen/generated/shared/json/CameraPreviewConfig.json'
import type {
  CameraPreviewMethods,
  CameraPreviewProps as NativeCameraPreviewProps,
} from '../native/CameraPreview.nitro'

const NativeCameraPreview = getHostComponent<
  NativeCameraPreviewProps,
  CameraPreviewMethods
>('CameraPreview', () => CameraPreviewViewConfig)

/** 呈现当前相机会话的原生预览，不会因挂载而打开相机。 */
export function CameraPreview(props: ViewProps) {
  return <NativeCameraPreview {...props} />
}

/** 定义原生预览组件可接收的 React Native 布局属性。 */
export type CameraPreviewProps = ViewProps
