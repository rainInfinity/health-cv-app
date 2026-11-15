/** 将当前原生相机会话的预览 Surface 映射为 React Native 视图。 */

import { useMemo, useRef } from 'react'
import type { ViewProps } from 'react-native'
import { callback, getHostComponent } from 'react-native-nitro-modules'

import CameraPreviewViewConfig from '../../nitrogen/generated/shared/json/CameraPreviewConfig.json'
import type {
  CameraPreviewMethods,
  CameraPreviewProps as NativeCameraPreviewProps,
} from '../native/CameraPreview.nitro'
import { createRPPGPreviewReadiness } from './RPPGPreview/previewReadiness'

const NativeCameraPreview = getHostComponent<
  NativeCameraPreviewProps,
  CameraPreviewMethods
>('CameraPreview', () => CameraPreviewViewConfig)

/** 呈现当前相机会话的原生预览，不会因挂载而打开相机。 */
export function CameraPreview(props: ViewProps) {
  const onLayout = useRef(props.onLayout)
  onLayout.current = props.onLayout
  const readiness = useMemo(
    () => createRPPGPreviewReadiness((event) => onLayout.current?.(event)),
    [],
  )
  const hybridRef = useMemo(() => callback(() => readiness.onHybridReady()), [readiness])
  return <NativeCameraPreview {...props} hybridRef={hybridRef} onLayout={readiness.onLayout} />
}

/** 定义原生预览组件可接收的 React Native 布局属性。 */
export type CameraPreviewProps = ViewProps
