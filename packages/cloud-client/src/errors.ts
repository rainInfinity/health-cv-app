/** 定义调用方可安全判别的云端请求错误。 */

/** 云端请求失败类别。 */
export type CloudClientErrorKind = 'api' | 'network' | 'timeout' | 'cancelled' | 'protocol';

/** 构造结构化错误所需的安全字段。 */
export interface CloudClientErrorOptions {
  /** 请求失败的稳定类别。 */
  kind: CloudClientErrorKind;
  /** 可供调用方展示或映射的安全提示。 */
  message: string;
  /** 服务端 HTTP 状态；无响应时缺席。 */
  status?: number;
  /** 后端业务错误码，不表示 HTTP 客户端内部错误。 */
  code?: string;
  /** 后端或响应头提供的请求标识。 */
  requestId?: string;
  /** 后端提供的等待提示原始值。 */
  retryAfter?: string;
}

/** 不保留 Axios 请求配置、原始响应或敏感异常的请求错误。 */
export class CloudClientError extends Error {
  /** 请求失败类别。 */
  readonly kind: CloudClientErrorKind;
  /** 服务端 HTTP 状态；无响应时缺席。 */
  readonly status?: number;
  /** 后端业务错误码。 */
  readonly code?: string;
  /** 后端或响应头提供的请求标识。 */
  readonly requestId?: string;
  /** 后端提供的等待提示原始值。 */
  readonly retryAfter?: string;

  /** 创建不携带原始异常和请求载荷的安全错误。 */
  constructor(options: CloudClientErrorOptions) {
    super(options.message);
    this.name = 'CloudClientError';
    this.kind = options.kind;
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.retryAfter = options.retryAfter;
  }
}
