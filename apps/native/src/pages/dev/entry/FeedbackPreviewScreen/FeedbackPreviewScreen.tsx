/** 提供统一单弹窗与四态 Toast 的原生实际交互预览。 */

import { useStore } from '@nanostores/react'

import { feedbackMessages } from '@/app/i18n/feedbackMessages'
import { devMessages } from '@/pages/dev/devMessages'
import { ActionButton } from '@/shared/components/ActionButton'
import { AppText } from '@/shared/components/AppText'
import { PageContainer } from '@/shared/components/PageContainer'
import { useFeedback } from '@/shared/components/FeedbackHost'

import { PreviewActions } from './styles'

/** 在开发页面实际触发弹窗、四态 Toast 和不可取消的加载过程。 */
export function FeedbackPreviewScreen() {
  const messages = useStore(devMessages)
  const sharedMessages = useStore(feedbackMessages)
  const { showModal, showToast, replaceToast } = useFeedback()

  /** 用长正文验证弹窗滚动、遮罩关闭与统一关闭按钮。 */
  const showModalPreview = () => {
    showModal({
      title: messages.modalPreview,
      message: messages.modalPreviewLongMessage,
      closeLabel: sharedMessages.dismiss,
      actions: [{ label: sharedMessages.dismiss, primary: true }],
    })
  }
  /** 模拟处理结束后替换加载提示，避免不可取消的预览永久遮挡页面。 */
  function showLoadingPreview(blockBack = false): void {
    const toastId = showToast({
      tone: 'loading',
      message: blockBack ? messages.authFlowLoading : messages.previewMessage,
      dismissOnBack: false,
    })
    setTimeout(() => {
      replaceToast(toastId, {
        tone: 'success',
        message: blockBack ? messages.authFlowResult : messages.previewMessage,
        dismissOnBack: !blockBack,
      })
    }, 1200)
  }

  return (
    <PageContainer edges={['left', 'right']}>
      <AppText accessibilityRole="header" variant="title">{messages.feedback}</AppText>
      <AppText tone="secondary">{messages.feedbackDescription}</AppText>
      <PreviewActions>
        <ActionButton label={messages.modalPreview} secondary onPress={showModalPreview} />
        <ActionButton
          label={messages.toastSuccess}
          onPress={() => showToast({ tone: 'success', message: messages.previewMessage })}
        />
        <ActionButton
          label={messages.toastError}
          secondary
          onPress={() => showToast({ tone: 'error', message: messages.previewMessage })}
        />
        <ActionButton
          label={messages.toastLoading}
          secondary
          onPress={() => showLoadingPreview()}
        />
        <ActionButton
          label={messages.authFlowPreview}
          secondary
          onPress={() => showLoadingPreview(true)}
        />
        <ActionButton
          label={messages.toastInformation}
          secondary
          onPress={() => showToast({ tone: 'information', message: messages.previewMessage })}
        />
      </PreviewActions>
    </PageContainer>
  )
}
