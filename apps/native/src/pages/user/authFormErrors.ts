/** 将认证错误码映射到本地安全文案，不回显服务端正文。 */

import { AuthSessionError } from '@/app/auth/session'

/** 表单可显示的稳定错误文案键。 */
export type AuthFormErrorKey =
  | 'invalidCredentials'
  | 'usernameExists'
  | 'invalidInput'
  | 'networkError'
  | 'secureStorageError'
  | 'unknownError'

/** 从结构化认证错误中提取安全字段。 */
interface AuthErrorFacts {
  /** 云端请求类别。 */
  kind?: unknown
  /** 后端稳定业务错误码。 */
  code?: unknown
}

/** 将认证错误归类为受控本地提示键。 */
export function classifyAuthFormError(error: unknown): AuthFormErrorKey {
  if (error instanceof AuthSessionError && error.code === 'credential-storage-failed') {
    return 'secureStorageError'
  }
  if (typeof error !== 'object' || error == null) return 'unknownError'

  const facts = error as AuthErrorFacts
  if (facts.kind === 'network' || facts.kind === 'timeout') return 'networkError'
  if (facts.code === 'INVALID_CREDENTIALS') return 'invalidCredentials'
  if (facts.code === 'USERNAME_EXISTS') return 'usernameExists'
  if (facts.code === 'INVALID_INPUT') return 'invalidInput'
  return 'unknownError'
}
