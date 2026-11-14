/** 将主动 RPPG 会话的 Android 原生预览映射为 React Native 视图。 */

import { useMemo, useRef } from 'react'
import type { LayoutChangeEvent, ViewProps } from 'react-native'
import { callback, getHostComponent } from 'react-native-nitro-modules'

import RPPGPreviewViewConfig from '../../../nitrogen/generated/shared/json/RPPGPreviewConfig.json'
import type {
  RPPGPreviewMethods,
  RPPGPreviewProps as NativeRPPGPreviewProps,
} from '../../native/RPPGPreview.nitro'
import { createRPPGPreviewReadiness } from './previewReadiness'

const NativeRPPGPreview = getHostComponent<
  NativeRPPGPreviewProps,
  RPPGPreviewMethods
>('RPPGPreview', () => RPPGPreviewViewConfig)

/** 呈现仅供 RPPG runtime 使用的原生预览，不会因挂载而打开相机。 */
export function RPPGPreview(props: ViewProps) {
  const onLayout = useRef(props.onLayout)
  onLayout.current = props.onLayout
  const readiness = useMemo(
    () => createRPPGPreviewReadiness((event: LayoutChangeEvent) => onLayout.current?.(event)),
    [],
  )
  const hybridRef = useMemo(() => callback(() => readiness.onHybridReady()), [readiness])

  return <NativeRPPGPreview {...props} hybridRef={hybridRef} onLayout={readiness.onLayout} />
}

/** 定义原生 RPPG 预览可接收的 React Native 布局属性。 */
export type RPPGPreviewProps = ViewProps
