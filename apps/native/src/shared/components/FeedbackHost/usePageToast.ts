/** 页面只持有自己的反馈序号，失焦或后台立即清理，不影响后来提示。 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useFeedback } from './FeedbackHost'
import type { FeedbackToastOptions } from './FeedbackHost'

/** 将页面反馈绑定到前台和导航可见性，不取消对应服务端操作。 */
export function usePageToast() {
  const focused = useIsFocused()
  const [foreground, setForeground] = useState(AppState.currentState === 'active')
  const { showToast, dismissToast, replaceToast } = useFeedback()
  const owned = useRef<number | null>(null)
  const visible = focused && foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setForeground(state === 'active')
      if (state !== 'active' && owned.current != null) { dismissToast(owned.current); owned.current = null }
    })
    return () => subscription.remove()
  }, [dismissToast])
  const dismiss = useCallback(() => {
    if (owned.current != null) dismissToast(owned.current)
    owned.current = null
  }, [dismissToast])
  useEffect(() => { if (!visible) dismiss(); return dismiss }, [visible, dismiss])
  const show = useCallback((options: FeedbackToastOptions) => {
    if (!visible) return
    owned.current = showToast(options)
  }, [visible, showToast])
  const replace = useCallback((options: FeedbackToastOptions) => {
    if (!visible) return
    owned.current = owned.current == null ? showToast(options) : replaceToast(owned.current, options)
  }, [visible, showToast, replaceToast])
  return { visible, show, replace, dismiss }
}
