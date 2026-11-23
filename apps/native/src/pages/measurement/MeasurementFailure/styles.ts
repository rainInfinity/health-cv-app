/** 失败状态保持自然高度，页面级使用方在剩余空间居中。 */
import styled from 'styled-components/native'
import { AppText } from '@/shared/components/AppText'

export const Body = styled.View`
  padding: 32px 24px 24px;
`
export const Heading = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 10px;
`
export const Title = styled(AppText)`
  font-size: 26px;
  line-height: 36px;
  font-weight: 600;
`
export const Hint = styled(AppText)`
  text-align: center;
  margin-top: 12px;
  margin-bottom: 20px;
`
export const Actions = styled.View`
  padding-top: 12px;
`
