/** 实现普通渠道认证资源的单次请求方法。 */

import type { CloudRequestOptions } from '../index';
import type { HttpClient } from '../http/client';
import type { Req, Rsp } from '../types';

/** 普通渠道认证接口。 */
export interface AuthApi {
  /** 注册普通渠道账号，不触发登录或状态改变。 */
  register(
    credentials: Req.Auth.AccountCredentialsRequest,
    options?: CloudRequestOptions,
  ): Promise<Rsp.Users.UserAccount>;
  /** 使用凭据登录；该调用不读取或附带 Access Token。 */
  login(
    credentials: Req.Auth.AccountCredentialsRequest,
    options?: CloudRequestOptions,
  ): Promise<Rsp.Auth.TokenPair>;
  /** 显式轮换当前渠道令牌，不执行自动重发。 */
  refresh(refreshToken: string, options?: CloudRequestOptions): Promise<Rsp.Auth.TokenPair>;
  /** 远端尽力撤销 Refresh Token；成功数据允许为 `null`。 */
  logout(refreshToken: string, options?: CloudRequestOptions): Promise<null>;
}

/** 创建认证资源接口。 */
export function createAuthApi(http: HttpClient): AuthApi {
  return {
    register: (credentials, options) =>
      http.request<Rsp.Users.UserAccount>({
        method: 'POST',
        path: 'auth/register',
        data: credentials,
        requiresAccessToken: false,
        options,
      }),
    login: (credentials, options) =>
      http.request<Rsp.Auth.TokenPair>({
        method: 'POST',
        path: 'auth/login',
        data: credentials,
        requiresAccessToken: false,
        options,
      }),
    refresh: (refreshToken, options) =>
      http.request<Rsp.Auth.TokenPair>({
        method: 'POST',
        path: 'auth/refresh',
        data: { refreshToken } satisfies Req.Auth.RefreshTokenRequest,
        requiresAccessToken: false,
        options,
      }),
    logout: (refreshToken, options) =>
      http.request<null>({
        method: 'POST',
        path: 'auth/logout',
        data: { refreshToken } satisfies Req.Auth.RefreshTokenRequest,
        requiresAccessToken: false,
        options,
      }),
  };
}
