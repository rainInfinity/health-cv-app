/** 所有产品入口共享身份与目录门控；登录完成不隐式启动设备。 */
import { useCallback, useRef } from 'react'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { appServices } from '../bootstrap'
import type { MeasurementMethod, RootStackParamList } from '../navigation/types'
import { useFeedback } from '@/shared/components/FeedbackHost'

/** 核对当前登录与统一模型，不添加独立的上传用途确认。 */
export function useMeasurementAccess(): (method: MeasurementMethod) => Promise<boolean> {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { showToast } = useFeedback()
  const focused = useRef(false)
  const pending = useRef<Promise<boolean> | null>(null)
  const cancel = useRef<(() => void) | null>(null)
  useFocusEffect(useCallback(() => {
    focused.current = true
    return () => { focused.current = false; cancel.current?.(); cancel.current = null }
  }, []))
  return useCallback((method: MeasurementMethod) => {
    if (method === 'face') return Promise.resolve(true)
    if (pending.current) return pending.current
    const operation = (async () => {
      if (!focused.current) return false
      if (!appServices) { showToast({ tone: 'error', message: '云端检测服务暂不可用，请稍后再试。' }); return false }
      const { auth, measurements } = appServices
      const identity = auth.state.get()
      if (identity.status !== 'authenticated') {
        if (identity.status === 'anonymous') navigation.navigate('Login')
        else showToast({ tone: 'information', message: identity.status === 'restoring' ? '正在恢复账号，请稍后再次开始。' : '暂时无法确认账号，请恢复登录后再次开始。' })
        return false
      }
      const generation = auth.getSessionGeneration()
      const valid = () => focused.current && auth.isAuthenticatedAt(generation)
      const controller = new AbortController()
      cancel.current = () => controller.abort()
      try { await measurements.prepare(method, controller.signal) }
      catch {
        if (valid()) showToast({ tone: 'error', message: '当前渠道的统一检测场景不可用，未启动设备。请稍后再试。' })
        return false
      } finally { cancel.current = null }
      return valid()
    })().catch(() => {
      if (focused.current) showToast({ tone: 'error', message: '云端检测准备未完成，未启动设备。请再次明确开始。' })
      return false
    })
    pending.current = operation
    void operation.finally(() => { if (pending.current === operation) pending.current = null })
    return operation
  }, [navigation, showToast])
}
