/** 将产品和开发入口的后台活动知情交互接入同一真实命令。 */

import { useCallback, useEffect, useRef } from 'react'
import { useStore } from '@nanostores/react'

import { feedbackMessages } from '@/app/i18n/feedbackMessages'
import { enablePassiveCapture } from '@/app/passive-capture'
import { passiveCaptureMessages } from '@/app/passive-capture-messages'
import { useFeedback } from '@/shared/components/FeedbackHost'

/** 说明弹窗只返回用户选择；系统设置不构成启用授权。 */
type BackgroundActivityDecision = 'enable' | 'settings' | 'cancel'

/** 提供两入口共用的显式启用动作；清理只撤销尚未确认的说明。 */
export function usePassiveCaptureEnable() {
  const messages = useStore(passiveCaptureMessages)
  const sharedMessages = useStore(feedbackMessages)
  const { showModal, dismissModal } = useFeedback()
  const pendingConfirmation = useRef<((decision: BackgroundActivityDecision) => void) | null>(null)

  useEffect(() => () => {
    if (pendingConfirmation.current == null) return
    pendingConfirmation.current('cancel')
    dismissModal()
  }, [dismissModal])

  return useCallback(() => enablePassiveCapture((decide) => {
    /** 仅消费当前说明一次，迟到按钮不能重复发起授权。 */
    const finish = (decision: BackgroundActivityDecision) => {
      if (pendingConfirmation.current !== finish) return
      pendingConfirmation.current = null
      decide(decision)
    }
    pendingConfirmation.current = finish
    showModal({
      title: messages.guidanceTitle,
      message: messages.guidanceMessage,
      closeLabel: sharedMessages.dismiss,
      onCancel: () => finish('cancel'),
      actions: [
        { label: messages.continueEnable, primary: true, onPress: () => finish('enable') },
        { label: messages.openSettings, onPress: () => finish('settings') },
        { label: messages.cancel, onPress: () => finish('cancel') },
      ],
    })
  }), [messages, sharedMessages.dismiss, showModal])
}
