/** 使用原图、原生 multiply 与真实透明蒙版融合操作照片。 */

import { useId } from 'react'
import { useWindowDimensions } from 'react-native'
import Svg, { Defs, G, Image, LinearGradient, Mask, Rect, Stop } from 'react-native-svg'
import type { MeasurementMethod } from '@/app/navigation/types'

import { OPERATION_PHOTOS } from '@/app/measurement/operationPhotos'
import { PhotoLayer } from './styles'

/** 卡片右侧 44% 区域同时横向、纵向渐隐，白底参与乘色而非遮盖。 */
export function CapturePhoto({ method }: { method: MeasurementMethod }) {
  const id = useId().replace(/:/g, '')
  // 数值蒙版边界覆盖窗口即可；实际渐隐范围由照片画布决定，不等待布局回传。
  const { width, height } = useWindowDimensions()
  return (
    <PhotoLayer pointerEvents="none" accessible={false}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={`${id}-horizontal`} x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0" stopColor="white" stopOpacity={0} />
            <Stop offset="0.32" stopColor="white" />
            <Stop offset="0.88" stopColor="white" />
            <Stop offset="1" stopColor="white" stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id={`${id}-vertical`} x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0" stopColor="white" stopOpacity={0} />
            <Stop offset="0.14" stopColor="white" />
            <Stop offset="0.86" stopColor="white" />
            <Stop offset="1" stopColor="white" stopOpacity={0} />
          </LinearGradient>
          <Mask id={`${id}-x`} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height} maskType="alpha">
            <Rect width="100%" height="100%" fill={`url(#${id}-horizontal)`} />
          </Mask>
          <Mask id={`${id}-y`} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height} maskType="alpha">
            <Rect width="100%" height="100%" fill={`url(#${id}-vertical)`} />
          </Mask>
        </Defs>
        <G mask={`url(#${id}-y)`}>
          <Image href={OPERATION_PHOTOS[method].card} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" mask={`url(#${id}-x)`} />
        </G>
      </Svg>
    </PhotoLayer>
  )
}
