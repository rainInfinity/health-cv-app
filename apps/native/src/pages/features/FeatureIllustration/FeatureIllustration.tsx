/** 按 Demo 原稿绘制五项健康功能的本地 SVG 插画。 */

import { useId } from 'react'
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop, Text, TSpan } from 'react-native-svg'
import { useTheme } from 'styled-components/native'

import { IllustrationFrame } from './styles'

/** 描述不包含测量结果含义的功能插画类别。 */
export type FeatureIllustrationKind = 'fingertip' | 'face' | 'pressure' | 'oxygen' | 'risk'

/** 描述插画类别、画布尺寸及可选的辅助技术说明。 */
export interface FeatureIllustrationProps {
  /** 当前功能的静态插画类别。 */
  kind: FeatureIllustrationKind
  /** 可选辅助技术说明；不传时整张插画隐藏。 */
  accessibilityLabel?: string
  /** 插画画布宽度，单位 dp。 */
  width?: number
  /** 插画画布高度，单位 dp。 */
  height?: number
}

/** 绘制与 Demo 同构的功能贴纸，不用插画表达测量值或评估结论。 */
export function FeatureIllustration({
  kind,
  accessibilityLabel,
  width = 96,
  height = 84,
}: FeatureIllustrationProps) {
  const theme = useTheme()
  const rawId = useId()
  const id = `feature-${kind}-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const brand = theme.colors.brand.primary
  const mint = theme.colors.brand.gradient.end
  const action = theme.colors.brand.action
  const surface = theme.colors.surface.default
  const subtle = theme.colors.brand.subtle
  const rose = theme.colors.accent.rose
  const blue = theme.colors.accent.blue
  const art = theme.colors.illustration

  return (
    <IllustrationFrame style={{ width, height }}>
      <Svg
        width={width}
        height={height}
        viewBox="0 0 100 84"
        fill="none"
        accessible={accessibilityLabel != null}
        accessibilityLabel={accessibilityLabel}
        accessibilityElementsHidden={accessibilityLabel == null}
        importantForAccessibility={accessibilityLabel == null ? 'no-hide-descendants' : 'auto'}
      >
        {kind === 'fingertip' && (
          <>
            <Defs>
              <LinearGradient id={`${id}-skin`} gradientUnits="userSpaceOnUse" x1="440" y1="400" x2="700" y2="1540">
                <Stop offset="0" stopColor={art.skinLight} />
                <Stop offset="1" stopColor={art.skin} />
              </LinearGradient>
              <LinearGradient id={`${id}-heart`} x2="1" y2="1">
                <Stop offset="0" stopColor={art.roseLight} />
                <Stop offset="1" stopColor={rose} />
              </LinearGradient>
              <LinearGradient id={`${id}-phone`} x2="1" y2="1">
                <Stop offset="0" stopColor={art.tealLight} />
                <Stop offset="1" stopColor={mint} />
              </LinearGradient>
            </Defs>
            <G transform="translate(12.381 4.342) scale(.9198)">
              <Ellipse cx="27" cy="79" rx="26" ry="3" fill={subtle} />
              <G transform="translate(-6 -15.6) scale(.06)">
                <Rect x="224" y="258" width="632" height="1200" rx="100" fill={surface} />
                <Rect x="235" y="270" width="610" height="1180" rx="90" fill={`url(#${id}-phone)`} stroke={art.cameraRim} strokeWidth="13" />
                <Rect x="350" y="350" width="390" height="390" rx="110" fill={art.cameraRim} />
                <G fill={art.camera} stroke={art.blueLight} strokeWidth="12">
                  <Circle cx="450" cy="450" r="55" />
                  <Circle cx="620" cy="480" r="55" />
                  <Circle cx="450" cy="620" r="55" />
                  <Circle cx="620" cy="620" r="55" />
                </G>
                <Circle cx="545" cy="425" r="31" fill={art.flash} fillOpacity=".35" />
                <Rect x="534" y="400" width="22" height="50" rx="11" fill={art.flash} stroke={surface} strokeWidth="7" />
                <Path
                  d="M110 1568c20-178 11-348 25-478 4-80 55-125 80-195 10-37 26-65 38-56 21 19 5 127 27 264 41-106 64-214 75-345l38-264c8-65 17-113 59-117 45-5 69 33 69 91l-8 387c-1 64 22 96 51 96 38-2 69-30 105-72l86-116c35-63 60-141 78-197 13-32 39-16 54 16 44 78 37 172-5 279 53 23 97 121 63 180 8 77-45 139-81 206-33 53-74 91-91 163l-42 158Z"
                  fill={`url(#${id}-skin)`}
                  stroke={surface}
                  strokeWidth="24"
                  strokeLinejoin="round"
                />
                <Rect x="431" y="394" width="70" height="95" rx="32" fill={art.skinLight} transform="rotate(-5 466 442)" />
              </G>
              <G transform="translate(-24 -6)">
                <G transform="rotate(-12 70 52) translate(55 37) scale(.15)">
                  <Path
                    d="M100 30C79 15 54 16 34 28 9 42 1 69 15 99 30 132 68 163 100 183 132 163 170 132 185 99 199 69 191 42 166 28 146 16 121 15 100 30Z"
                    fill={`url(#${id}-heart)`}
                    stroke={surface}
                    strokeWidth="12.5"
                    strokeLinejoin="round"
                  />
                  <Path d="M35 104h34l13-30 17 51 18-69 13 48h35" stroke={surface} strokeWidth="8.5" strokeLinecap="round" strokeLinejoin="round" />
                </G>
                <G transform="rotate(10 85.375 38) translate(68.5 23) scale(1.0546875 .9375)">
                  <Path d="M14 8C8 7 4 13 3 22c-1 6 2 8 6 6l5-4Zm4 0c6-1 10 5 11 14 1 6-2 8-6 6l-5-4Z" fill={art.blueLight} stroke={surface} strokeWidth="1.5" strokeLinejoin="round" />
                  <Path d="M16 3v11m0-2-6 8m6-8 6 8" stroke={blue} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </G>
              </G>
            </G>
          </>
        )}
        {kind === 'face' && (
          <>
            <Defs>
              <LinearGradient id={`${id}-skin`} gradientUnits="userSpaceOnUse" x1="36" y1="24" x2="63" y2="55">
                <Stop offset="0" stopColor={art.skinLight} />
                <Stop offset="1" stopColor={art.skin} />
              </LinearGradient>
              <LinearGradient id={`${id}-shirt`} x2="1" y2="1">
                <Stop offset="0" stopColor={art.tealLight} />
                <Stop offset="1" stopColor={mint} />
              </LinearGradient>
              <LinearGradient id={`${id}-heart`} x2="1" y2="1">
                <Stop offset="0" stopColor={art.roseLight} />
                <Stop offset="1" stopColor={rose} />
              </LinearGradient>
            </Defs>
            <G transform="translate(-9.582 -4.713) scale(1.0576)">
              <Ellipse cx="49" cy="74" rx="31" ry="4" fill={subtle} />
              <Path d="M25 70c0-12 10-18 18-19V42h15v9c11 2 19 8 19 19Z" fill={`url(#${id}-shirt)`} stroke={surface} strokeWidth="4" strokeLinejoin="round" />
              <Path d="M43 45v11q7 7 15 0V45" fill={`url(#${id}-skin)`} />
              <Path d="M29 36c-4-32 46-36 43-1v18c-8 7-35 7-43-1Z" fill={art.hair} stroke={surface} strokeWidth="3" />
              <Path d="M34 31c10 0 17-8 20-13 1 8 8 13 13 14v10c0 24-33 24-33 0Z" fill={`url(#${id}-skin)`} />
              <Path d="M41 39h2m14 0h2m-13 9q5 3 9 0" stroke={art.outline} strokeWidth="1.4" strokeLinecap="round" />
              <Path d="M23 27v-9h9m36 0h10v9M23 53v10h9m36 0h10V53" stroke={brand} strokeWidth="1.7" strokeLinecap="round" />
              <G transform="rotate(30 79 40) translate(65.95 26.95) scale(.1305)">
                <Path
                  d="M100 30C79 15 54 16 34 28 9 42 1 69 15 99 30 132 68 163 100 183 132 163 170 132 185 99 199 69 191 42 166 28 146 16 121 15 100 30Z"
                  fill={`url(#${id}-heart)`}
                  stroke={surface}
                  strokeWidth="12.5"
                  strokeLinejoin="round"
                />
                <Path d="M35 104h34l13-30 17 51 18-69 13 48h35" stroke={surface} strokeWidth="8.5" strokeLinecap="round" strokeLinejoin="round" />
              </G>
            </G>
          </>
        )}
        {kind === 'pressure' && (
          <>
            <Defs>
              <LinearGradient id={`${id}-heart`} x2="1" y2="1">
                <Stop offset="0" stopColor={art.roseLight} />
                <Stop offset="1" stopColor={rose} />
              </LinearGradient>
              <LinearGradient id={`${id}-dial`} x2="1" y2="1">
                <Stop offset="0" stopColor={surface} />
                <Stop offset="1" stopColor={art.tealLight} />
              </LinearGradient>
            </Defs>
            <G transform="translate(.406 -1.223) scale(.9392)">
              <Ellipse cx="50" cy="74" rx="34" ry="4" fill={subtle} />
              <G transform="translate(10 8) scale(.32)">
                <Path
                  d="M100 30C79 15 54 16 34 28 9 42 1 69 15 99 30 132 68 163 100 183 132 163 170 132 185 99 199 69 191 42 166 28 146 16 121 15 100 30Z"
                  fill={`url(#${id}-heart)`}
                  stroke={surface}
                  strokeWidth="9"
                  strokeLinejoin="round"
                />
                <Path d="M35 104h34l13-30 17 51 18-69 13 48h35" stroke={surface} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
                <Path d="M55 39c-19 3-30 16-32 31" stroke={surface} strokeWidth="10" strokeLinecap="round" opacity=".65" />
              </G>
              <Circle cx="73" cy="57" r="20" fill={`url(#${id}-dial)`} stroke={surface} strokeWidth="4" />
              <Path d="M59 59a14 14 0 0 1 28 0" stroke={mint} strokeWidth="3" strokeLinecap="round" />
              <Path d="m73 58 8-10M60 68h26" stroke={action} strokeWidth="1.6" strokeLinecap="round" />
              <Circle cx="73" cy="58" r="2.5" fill={brand} />
            </G>
          </>
        )}
        {kind === 'oxygen' && (
          <>
            <Defs>
              <RadialGradient id={`${id}-bubble`} cx=".32" cy=".25" r=".8">
                <Stop offset="0" stopColor={surface} />
                <Stop offset=".4" stopColor={art.blueLight} />
                <Stop offset="1" stopColor={brand} />
              </RadialGradient>
              <LinearGradient id={`${id}-tile`} x2="1" y2="1">
                <Stop offset="0" stopColor={surface} />
                <Stop offset="1" stopColor={art.tealLight} />
              </LinearGradient>
            </Defs>
            <G transform="translate(5.167 3.125) scale(.9017)">
              <Ellipse cx="50" cy="74" rx="34" ry="4" fill={subtle} />
              <Circle cx="47" cy="36" r="28" fill={`url(#${id}-bubble)`} stroke={surface} strokeWidth="3" />
              <Path d="M28 29q2-11 13-13" stroke={surface} strokeWidth="3" strokeLinecap="round" opacity=".9" />
              <Text x="31" y="45" fill={action} fontSize="25" fontWeight="500">
                <TSpan>O</TSpan>
                <TSpan fontSize="14" dy="4">2</TSpan>
              </Text>
              <Circle cx="79" cy="19" r="9" fill={`url(#${id}-bubble)`} stroke={surface} strokeWidth="2" />
              <Circle cx="16" cy="50" r="6" fill={`url(#${id}-bubble)`} stroke={surface} strokeWidth="2" />
              <Rect x="40" y="51" width="48" height="24" rx="9" fill={`url(#${id}-tile)`} stroke={surface} strokeWidth="3" transform="rotate(-8 64 63)" />
              <Path d="M48 64h7l4-6 5 12 5-9 4 3h7" stroke={brand} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </G>
          </>
        )}
        {kind === 'risk' && (
          <>
            <Defs>
              <LinearGradient id={`${id}-paper`} x2="1" y2="1">
                <Stop offset="0" stopColor={surface} />
                <Stop offset="1" stopColor={art.tealLight} />
              </LinearGradient>
              <LinearGradient id={`${id}-glass`} x2="1" y2="1">
                <Stop offset="0" stopColor={surface} />
                <Stop offset="1" stopColor={mint} stopOpacity=".65" />
              </LinearGradient>
            </Defs>
            <G transform="translate(3.717 1.298) scale(.9469)">
              <Ellipse cx="50" cy="75" rx="34" ry="4" fill={subtle} />
              <G transform="rotate(-8 40 42)">
                <Path d="M23 10h29l12 12v45a5 5 0 0 1-5 5H23a5 5 0 0 1-5-5V15a5 5 0 0 1 5-5Z" fill={`url(#${id}-paper)`} stroke={surface} strokeWidth="4" />
                <Path d="M52 10v12h12" fill={mint} fillOpacity=".7" />
                <Path d="M28 29h19m-19 8h24m-24 8h16m-16 9h11" stroke={brand} strokeOpacity=".75" strokeWidth="2" strokeLinecap="round" />
                <Path d="M30 14c-2 4-6 7-6 10a6 6 0 0 0 12 0c0-3-4-6-6-10Z" fill={rose} />
                <Text x="39" y="24" fill={action} fontSize="7" fontWeight="600">GLU</Text>
              </G>
              <Path d="m69 59 14 15" stroke={surface} strokeWidth="11" strokeLinecap="round" />
              <Path d="m69 59 14 15" stroke={brand} strokeWidth="7" strokeLinecap="round" />
              <Circle cx="61" cy="48" r="20" fill={`url(#${id}-glass)`} stroke={surface} strokeWidth="4" />
              <Circle cx="61" cy="48" r="17" stroke={brand} strokeWidth="1.5" />
              <Path d="m61 36 10 6v12l-10 6-10-6V42Z" fill={mint} fillOpacity=".8" stroke={action} strokeWidth="1" />
              <Text x="61" y="53" textAnchor="middle" fill={action} fontSize="16" fontWeight="600">G</Text>
            </G>
          </>
        )}
      </Svg>
    </IllustrationFrame>
  )
}
