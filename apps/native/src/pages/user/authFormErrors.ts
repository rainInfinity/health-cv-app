/** 将认证错误码映射到本地安全文案，不回显服务端正文。 */

/** 认证请求可以使用的安全消息键，未知错误按操作分别兜底。 */
export type AuthFormErrorKey =
  | 'invalidCredentials'
  | 'usernameExists'
  | 'invalidInput'
  | 'networkError'
  | 'secureStorageError'
  | 'loginFailed'
  | 'registerFailed'

/** 从结构化认证错误中提取安全字段。 */
interface AuthErrorFacts {
  /** 云端请求类别。 */
  kind?: unknown
  /** 可识别的认证操作错误类别或稳定错误码。 */
  code?: unknown
}

/** 将认证错误归类为安全文案键；不回显服务端正文或异常消息。 */
export function classifyAuthFormError(
  error: unknown,
  operation: 'login' | 'register',
): AuthFormErrorKey {
  const fallbackKey = operation === 'login' ? 'loginFailed' : 'registerFailed'
  if (typeof error !== 'object' || error == null) return fallbackKey
  const facts = error as AuthErrorFacts
  if (facts.code === 'credential-storage-failed') return 'secureStorageError'
  if (facts.kind === 'network' || facts.kind === 'timeout') return 'networkError'
  if (facts.code === 'INVALID_CREDENTIALS') return 'invalidCredentials'
  if (facts.code === 'USERNAME_EXISTS') return 'usernameExists'
  if (facts.code === 'INVALID_INPUT') return 'invalidInput'
  return fallbackKey
}
