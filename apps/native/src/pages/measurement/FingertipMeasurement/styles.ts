/** 指尖展示沿用 Demo 的圆形取景、白面板及横向双页布局。 */

import { Animated, StyleSheet } from 'react-native'
import styled from 'styled-components/native'

export const Screen = styled.View`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.surface.default};
`

export const Toolbar = styled.View`
  min-height: 48px;
  flex-direction: row;
  align-items: center;
  padding-horizontal: 16px;
`

export const HeaderAction = styled.Pressable`
  width: 48px;
  height: 48px;
  border-radius: 24px;
  align-items: center;
  justify-content: center;
`

export const HeaderTitle = styled.View`
  flex: 1;
  align-items: center;
`

export const BrandSlot = styled.View`
  width: 48px;
  align-items: center;
`

export const Viewfinder = styled.View<{ $compact: boolean }>`
  align-items: center;
  padding-top: ${({ $compact }) => $compact ? 4 : 16}px;
  padding-horizontal: ${({ theme }) => theme.layout.pageGutter}px;
  padding-bottom: 24px;
`

export const DataPanel = styled.View<{ $compact: boolean }>`
  flex-grow: 1;
  padding: ${({ $compact }) => $compact ? 16 : 20}px;
  border-top-left-radius: ${({ theme }) => theme.radius.lg}px;
  border-top-right-radius: ${({ theme }) => theme.radius.lg}px;
  background-color: ${({ theme }) => theme.colors.surface.default};
`

export const Session = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`

export const StatusGroup = styled.View`
  flex: 1;
  align-items: flex-start;
  gap: 8px;
`

export const StatusBadge = styled.View<{ $started: boolean }>`
  max-width: 100%;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: ${({ theme }) => theme.radius.pill}px;
  background-color: ${({ theme, $started }) => $started ? theme.colors.brand.subtle : theme.colors.surface.subtle};
`

export const Countdown = styled.View`
  align-items: center;
  gap: 4px;
`

export const Carousel = styled.View<{ $compact: boolean }>`
  flex-grow: 1;
  margin-top: ${({ $compact }) => $compact ? 8 : 20}px;
`

export const Instructions = styled.View`
  flex-direction: row;
  gap: 12px;
`

export const Step = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
`

export const Pagination = styled.View`
  flex-direction: row;
  justify-content: center;
  gap: 8px;
  margin-top: 4px;
`

export const PageButton = styled.Pressable`
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
`

export const PageMark = styled(Animated.View)<{ $selected: boolean }>`
  height: 6px;
  border-radius: 3px;
  background-color: ${({ theme, $selected }) => $selected ? theme.colors.brand.action : theme.colors.text.muted};
`

export const localStyles = StyleSheet.create({
  scrollContent: { flexGrow: 1 },
  background: { ...StyleSheet.absoluteFill },
  carouselScroll: { flexGrow: 0 },
  page: { justifyContent: 'center' },
  wavePage: { justifyContent: 'flex-start' },
  heading: { fontWeight: '500' },
  centered: { textAlign: 'center' },
  stepCopy: { marginTop: 8 },
  stepHint: { marginTop: 4, textAlign: 'center' },
  countdown: { fontSize: 28, fontWeight: '600', fontVariant: ['tabular-nums'] },
  circle: { alignItems: 'center', justifyContent: 'center' },
  previewNoticeText: { fontSize: 14, lineHeight: 22 },
  coverage: { position: 'absolute', bottom: -10, width: 88, paddingVertical: 4, paddingHorizontal: 12, borderWidth: 1, borderRadius: 10, alignItems: 'center' },
  coverageText: { fontSize: 20, fontWeight: '600', fontVariant: ['tabular-nums'] },
  ripple: { position: 'absolute', borderWidth: 1 },
})
