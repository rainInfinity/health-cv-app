/** 保留 Demo 的正圆照片与双水纹，以静态分层避免 SVG 图片裁剪和离屏遮罩。 */

import { memo } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import Svg, { Circle, G, Path } from 'react-native-svg'
import { useTheme } from 'styled-components/native'

import type { MeasurementMethod } from '@/app/navigation/types'
import { OPERATION_PHOTOS } from '@/app/measurement/operationPhotos'
import { PhotoFrame, localStyles as styles } from './styles'

/** 水纹几何与端点透明度仅生成一次；短分段替代双 luminance mask。 */
function waterArc(radius: number, startAngle: number, sweep: number, phase: number) {
  const points = Array.from({ length: 97 }, (_, index) => {
    const progress = index / 96
    const angle = (startAngle + progress * sweep) * Math.PI / 180
    const wave = Math.sin(progress * Math.PI) * (
      1.6 * Math.sin(progress * Math.PI * 2.6 + phase)
      + 0.8 * Math.sin(progress * Math.PI * 5 + phase)
    )
    return {
      x: 180 + (radius + wave) * Math.cos(angle),
      y: 180 + (radius + wave) * Math.sin(angle),
    }
  })
  const start = points[0]!
  const end = points[points.length - 1]!
  const distanceToEnd = (point: { x: number; y: number }) => Math.min(
    Math.hypot(point.x - start.x, point.y - start.y),
    Math.hypot(point.x - end.x, point.y - end.y),
  )
  const coordinate = (point: { x: number; y: number }) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`
  const segments: { path: string; opacity: number }[] = []
  let solidPath = ''
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!
    const to = points[index]!
    if (Math.min(distanceToEnd(from), distanceToEnd(to)) >= 24) {
      solidPath += `${solidPath ? ' L' : 'M'}${solidPath ? '' : `${coordinate(from)} L`}${coordinate(to)}`
      continue
    }
    // 仅细分两端约 24 个坐标单位，主体仍是一条路径。
    const count = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 3)
    for (let part = 0; part < count; part += 1) {
      const pointAt = (progress: number) => ({
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
      })
      const opacity = Math.max(0, Math.min(1, (distanceToEnd(pointAt((part + 0.5) / count)) - 4.8) / 19.2))
      if (opacity > 0) {
        segments.push({ path: `M${coordinate(pointAt(part / count))} L${coordinate(pointAt((part + 1) / count))}`, opacity })
      }
    }
  }
  segments.push({ path: solidPath, opacity: 1 })
  return segments
}

const WATER_WAVES = [waterArc(149, -124, 286, 0), waterArc(156, -18, 248, 1.8)]

/** 照片解码尺寸固定；父布局变化只缩放整个画布，不重复调整图片尺寸。 */
const PhotoArtwork = memo(function PhotoArtwork({ method }: { method: MeasurementMethod }) {
  const theme = useTheme()
  return (
    <>
      <View style={[styles.backdrop, { backgroundColor: theme.colors.surface.default }]} />
      <View style={styles.photoClip}>
        <Image source={OPERATION_PHOTOS[method].guide} resizeMode="cover" fadeDuration={0} style={styles.photoImage} />
      </View>
      <Svg width={360} height={360} viewBox="0 0 360 360" style={StyleSheet.absoluteFill} accessible={false}>
        <Circle cx="180" cy="180" r="143" fill="none" stroke={theme.colors.brand.primary} strokeOpacity={0.5} strokeWidth="1" />
        <G fill="none" stroke={theme.colors.brand.primary} strokeLinecap="butt" strokeLinejoin="round">
          {WATER_WAVES.map((segments, waveIndex) => segments.map((segment, segmentIndex) => (
            <Path key={`${waveIndex}-${segmentIndex}`} d={segment.path} strokeWidth={waveIndex ? 1.2 : 1.6} strokeOpacity={segment.opacity * (waveIndex ? 0.18 : 0.32)} />
          )))}
        </G>
      </Svg>
    </>
  )
})

/** 圆裁、边框和水纹共享固定 360 坐标系，小屏仍保持正圆。 */
export const OperationPhoto = memo(function OperationPhoto({ method, size, label }: { method: MeasurementMethod; size: number; label: string }) {
  return (
    <PhotoFrame style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel={label}>
      <View
        pointerEvents="none"
        renderToHardwareTextureAndroid
        style={[styles.canvas, { transform: [{ scale: size / 360 }] }]}
      >
        <PhotoArtwork method={method} />
      </View>
    </PhotoFrame>
  )
})

