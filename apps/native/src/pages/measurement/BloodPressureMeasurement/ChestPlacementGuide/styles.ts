/** 贴胸指导沿用共用弹窗外观，图解自然排布，确认与偏好控件保持可触达。 */
import styled from 'styled-components/native'
import { AppText } from '@/shared/components/AppText'

export const GuideTitle = styled(AppText)`
  text-align: center;
`

export const GuideContent = styled.View`
  gap: ${({ theme }) => theme.spacing.lg}px;
`

export const SkipControl = styled.Pressable`
  min-height: 48px;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.xs}px;
`

export const SkipMark = styled.View<{ $checked: boolean }>`
  width: 16px;
  height: 16px;
  border-radius: 8px;
  border-width: 1.5px;
  border-color: ${({ theme }) => theme.colors.brand.primary};
  background-color: ${({ theme, $checked }) => $checked ? theme.colors.brand.primary : theme.colors.surface.default};
`

export const StorageError = styled(AppText)`
  color: ${({ theme }) => theme.colors.feedback.error};
  text-align: center;
`
