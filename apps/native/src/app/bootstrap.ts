/** 组装云端 SDK、认证、安全存储与会话查询缓存。 */

import * as SecureStore from 'expo-secure-store';
import { createCloudClient } from '@health-cv-app/cloud-client';
import type { CloudClient } from '@health-cv-app/cloud-client';
import type { QueryClient } from '@tanstack/react-query';

import { createSecureCredentialStore } from './auth/credentials';
import { createAuthScope } from './auth/scope';
import { createAuthSessionManager } from './auth/session';
import type { AuthSessionManager } from './auth/session';
import type { AuthScope } from './auth/scope';
import { createAppQueryClient } from './query/client';
import { createAppQueries } from './query/resources';
import type { AppQueries } from './query/resources';
import { readRuntimeConfig } from './runtime-config';
import type { RuntimeConfig } from './runtime-config';
import { createMeasurementServices } from './measurement/service';
import type { MeasurementServices } from './measurement/service';

/** 应用进程内唯一的会话依赖集合。 */
export interface AppServices {
  /** 固定服务地址和渠道的普通用户 SDK。 */
  client: CloudClient;
  /** 认证命令与只读认证状态。 */
  auth: AuthSessionManager;
  /** 不持久化的服务端查询缓存。 */
  queryClient: QueryClient;
  /** 当前会话的资源查询和资料变更配置。 */
  queries: AppQueries;
  /** 当前作用域，用于后续查询键和缓存清理。 */
  scope: AuthScope;
  /** 当前代次的显式场景目录选择与云端流程依赖。 */
  measurements: MeasurementServices;
}

/** 使用显式运行配置创建应用真实依赖，不初始化页面或业务流程。 */
export function createAppServices(config: RuntimeConfig): AppServices {
  const scope = createAuthScope(config.baseUrl, config.channel);
  const queryClient = createAppQueryClient();
  const accessTokenSource = { current: null as string | null };
  const client = createCloudClient({
    baseUrl: scope.serviceRoot,
    channel: scope.channel,
    getAccessToken: () => accessTokenSource.current,
  });
  const credentials = createSecureCredentialStore(scope, SecureStore);
  const auth = createAuthSessionManager({
    client,
    scope,
    credentials,
    queryClient,
    accessTokenSource,
  });
  const queries = createAppQueries(client, auth, queryClient, scope);

  const measurements = createMeasurementServices(client, auth, queries, queryClient);
  return { client, auth, queryClient, queries, scope, measurements };
}

const runtimeConfig = readRuntimeConfig();

/** 云端配置缺失时接触式产品门控反馈不可用，独立开发及面部本地路径不变。 */
export const appServices = runtimeConfig ? createAppServices(runtimeConfig) : null;

if (appServices) {
  void appServices.auth.restore();
}
