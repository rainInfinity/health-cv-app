/** 定义认证会话、安全凭据与公开状态的数据契约。 */

/** 一个会话中必须整体保存和轮换的令牌对。 */
export interface CredentialPair {
  /** 当前会话访问受保护接口的令牌。 */
  accessToken: string;
  /** 轮换访问令牌时使用的令牌。 */
  refreshToken: string;
}

/** 可安全发布给界面的当前账号最小身份。 */
export interface AuthIdentity {
  /** 后端公开的账号标识。 */
  userId: number;
  /** 后端公开的用户名。 */
  username: string;
}

/** 暂时无法确认认证状态时可公开的非敏感原因码。 */
export type AuthUnavailableReason =
  | 'credential-storage'
  | 'network'
  | 'refresh-indeterminate'
  | 'identity-unconfirmed';

/** 应用可订阅的认证事实；不包含令牌、密码或完整资料。 */
export type AuthState =
  | { status: 'restoring' }
  | { status: 'anonymous' }
  | ({ status: 'authenticated' } & AuthIdentity)
  | { status: 'unavailable'; reason: AuthUnavailableReason };

/** 单个作用域令牌对的安全存储边界。 */
export interface CredentialStorage {
  /** 读取当前服务与渠道的令牌对；没有记录时返回 null。 */
  read(): Promise<CredentialPair | null>;
  /** 原子替换当前作用域的令牌对记录。 */
  write(tokens: CredentialPair): Promise<void>;
  /** 删除当前作用域的令牌对记录。 */
  delete(): Promise<void>;
}

/** 为云客户端同步提供当前 Access Token 的私有引用。 */
export interface AccessTokenSource {
  /** 当前 Access Token；没有可用会话时为 null。 */
  current: string | null;
}

/** 认证命令可返回的远端撤销与本地凭据删除事实。 */
export interface LogoutResult {
  /** 远端 Refresh 撤销是否收到成功响应。 */
  remoteRevocation: 'confirmed' | 'unconfirmed' | 'not-attempted';
  /** 本地安全存储删除是否成功。 */
  credentialDeletion: 'succeeded' | 'failed';
}
