/** 将本地退出结果映射到不误报远端成功的安全文案。 */

import type { LogoutResult } from '@/app/auth/types'

/** 退出流程可展示的结果文案键。 */
export type SignOutFeedbackKey =
  | 'logoutStorageFailed'
  | 'logoutRemoteUnconfirmed'
  | 'logoutSuccess'

/** 按本地凭据优先、远端确认其次的顺序选择退出结果。 */
export function classifySignOutResult(result: LogoutResult): SignOutFeedbackKey {
  if (result.credentialDeletion === 'failed') return 'logoutStorageFailed'
  if (result.remoteRevocation !== 'confirmed') return 'logoutRemoteUnconfirmed'
  return 'logoutSuccess'
}
