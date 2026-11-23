/** 创建并公开普通渠道云端客户端及其单次请求选项。 */

import { createAuthApi } from './apis/auth';
import type { AuthApi } from './apis/auth';
import { createHttpClient } from './http/client';
import { createModelsApi } from './apis/model';
import type { ModelsApi } from './apis/model';
import { createMeasurementsApi } from './apis/measurement';
import type { MeasurementsApi } from './apis/measurement';
import { createTasksApi } from './apis/task';
import type { TasksApi } from './apis/task';
import { createUsersApi } from './apis/user';
import type { UsersApi } from './apis/user';

/** 调用方显式选择的普通用户渠道标识，不使用管理端渠道。 */
export type CloudChannel = string;

/** 描述文件传输运行时报告的字节数。 */
export interface CloudProgress {
  /** 已传输字节数。 */
  loadedBytes: number;
  /** 文件传输总字节数；运行时无法可靠取得时缺席。 */
  totalBytes?: number;
}

/** 定义单次请求的取消、超时和文件传输控制项。 */
export interface CloudRequestOptions {
  /** 调用方提供的取消信号。 */
  signal?: AbortSignal;
  /** 覆盖客户端默认请求超时时间，单位为毫秒。 */
  timeoutMs?: number;
  /** 接收运行时报告的实际文件传输字节数。 */
  onProgress?: (progress: CloudProgress) => void;
}

/** 创建云端客户端所需的服务作用域与外部凭据读取方式。 */
export interface CloudClientOptions {
  /** 不含 `/api/v1` 的 HTTP(S) 服务根地址；客户端会追加 API 版本和渠道路径。 */
  baseUrl: string;
  /** 普通用户渠道标识。 */
  channel: CloudChannel;
  /** 从应用认证状态读取当前 Access Token；无会话时返回 `null`。 */
  getAccessToken: () => string | null;
  /** 客户端默认请求超时时间，单位为毫秒。 */
  timeoutMs?: number;
}

/** 公开的云端资源接口集合。 */
export interface CloudClient {
  /** 普通渠道账号认证接口。 */
  auth: AuthApi;
  /** 当前账号与资料接口。 */
  users: UsersApi;
  /** 当前渠道可用模型目录。 */
  models: ModelsApi;
  /** 当前账号任务接口。 */
  tasks: TasksApi;
  /** 当前账号最新健康结果与单页指标历史。 */
  measurements: MeasurementsApi;
}

/** 创建服务地址和渠道显式隔离的云端客户端。 */
export function createCloudClient(options: CloudClientOptions): CloudClient {
  const http = createHttpClient(options);

  return {
    auth: createAuthApi(http),
    users: createUsersApi(http),
    models: createModelsApi(http),
    tasks: createTasksApi(http),
    measurements: createMeasurementsApi(http),
  };
}

export { CloudClientError } from './errors';
export type { CloudClientErrorKind, CloudClientErrorOptions } from './errors';
export type { AuthApi } from './apis/auth';
export type { ModelsApi } from './apis/model';
export type { MeasurementsApi } from './apis/measurement';
export type { TasksApi } from './apis/task';
export type { UsersApi } from './apis/user';
export type { Req, Rsp } from './types';
