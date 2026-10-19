/** 通过认证会话门控本人账号、资料、模型和任务服务端查询。 */

import type { QueryClient } from '@tanstack/react-query';
import type { CloudClient, Req, Rsp } from '@health-cv-app/cloud-client';

import type { AuthSessionManager } from '../auth/session';
import type { AuthScope } from '../auth/scope';
import { createServerQueryKeys } from './keys';

/** 描述认证代次门控的 React Query 资源查询。 */
export interface ProtectedQueryOptions<TData> {
  /** 包含服务、渠道、会话代次和资源参数的查询键。 */
  queryKey: readonly unknown[];
  /** 仅在指定代次已确认认证时允许查询。 */
  enabled: boolean;
  /** 通过认证保护入口执行一次资源请求。 */
  queryFn: (context: { signal: AbortSignal }) => Promise<TData>;
}

/** 描述资料 PATCH 的 Query Mutation 变量。 */
export interface ProfileMutationVariables {
  /** 只包含本次明确提交的资料字段。 */
  profile: Req.Users.ProfilePatchRequest;
  /** 可取消的单次更新信号。 */
  signal?: AbortSignal;
}

/** 描述资料 PATCH 使用的受保护变更配置。 */
export interface ProfileMutationOptions {
  /** 按作用域和会话代次隔离的变更键。 */
  mutationKey: readonly unknown[];
  /** 显式关闭该变更的通用自动重试。 */
  retry: false;
  /** 返回后端更新后的完整资料。 */
  mutationFn: (variables: ProfileMutationVariables) => Promise<Rsp.Users.MyProfile>;
  /** 以完整服务端响应更新当前会话资料缓存。 */
  onSuccess: (profile: Rsp.Users.MyProfile) => void;
}

/** 公开本人账号、资料、模型和任务的认证门控查询配置。 */
export interface AppQueries {
  /** 本人账号身份查询。 */
  me(): ProtectedQueryOptions<Rsp.Users.UserAccount>;
  /** 本人健康资料查询。 */
  profile(): ProtectedQueryOptions<Rsp.Users.MyProfile>;
  /** 普通渠道模型目录查询。 */
  models(query?: Req.Models.ModelListParams): ProtectedQueryOptions<Rsp.Models.AvailableModelPage>;
  /** 任务摘要分页查询。 */
  tasks(query?: Req.Tasks.TaskListParams): ProtectedQueryOptions<Rsp.Tasks.TaskPage>;
  /** 单个任务详情查询。 */
  task(taskId: number): ProtectedQueryOptions<Rsp.Tasks.TaskDetail>;
  /** 更新本人资料并写回完整服务端响应。 */
  updateProfile(): ProfileMutationOptions;
}

/** 组装按当前认证代次隔离的资源查询和资料更新配置。 */
export function createAppQueries(
  client: CloudClient,
  auth: AuthSessionManager,
  queryClient: QueryClient,
  scope: AuthScope,
): AppQueries {
  return {
    /** 读取当前账号公开身份。 */
    me() {
      const generation = auth.getSessionGeneration();
      const keys = createServerQueryKeys(scope, generation);
      return {
        queryKey: keys.me,
        enabled: auth.isAuthenticatedAt(generation),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          auth.runProtected((options) => client.users.getMe(options), { signal }, generation),
      };
    },
    /** 读取本人健康资料；资料只保留在当前服务端查询缓存。 */
    profile() {
      const generation = auth.getSessionGeneration();
      const keys = createServerQueryKeys(scope, generation);
      return {
        queryKey: keys.profile,
        enabled: auth.isAuthenticatedAt(generation),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          auth.runProtected((options) => client.users.getProfile(options), { signal }, generation),
      };
    },
    /** 读取当前普通渠道的模型目录。 */
    models(query?: Req.Models.ModelListParams) {
      const generation = auth.getSessionGeneration();
      const keys = createServerQueryKeys(scope, generation);
      return {
        queryKey: keys.models(query?.offset, query?.limit),
        enabled: auth.isAuthenticatedAt(generation),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          auth.runProtected((options) => client.models.list(query, options), { signal }, generation),
      };
    },
    /** 读取当前账号任务摘要分页。 */
    tasks(query?: Req.Tasks.TaskListParams) {
      const generation = auth.getSessionGeneration();
      const keys = createServerQueryKeys(scope, generation);
      return {
        queryKey: keys.tasks(query?.offset, query?.limit),
        enabled: auth.isAuthenticatedAt(generation),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          auth.runProtected((options) => client.tasks.list(query, options), { signal }, generation),
      };
    },
    /** 读取单个任务详情，不把任务失败状态改写为通信错误。 */
    task(taskId: number) {
      const generation = auth.getSessionGeneration();
      const keys = createServerQueryKeys(scope, generation);
      return {
        queryKey: keys.task(taskId),
        enabled: auth.isAuthenticatedAt(generation),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          auth.runProtected((options) => client.tasks.getById(taskId, options), { signal }, generation),
      };
    },
    /** 局部 PATCH 成功后用服务端完整资料替换当前会话缓存。 */
    updateProfile() {
      const generation = auth.getSessionGeneration();
      const keys = createServerQueryKeys(scope, generation);
      return {
        mutationKey: keys.updateProfile,
        retry: false,
        mutationFn: ({ profile, signal }: ProfileMutationVariables): Promise<Rsp.Users.MyProfile> =>
          auth.runProtected(
            (options) => client.users.updateProfile(profile, options),
            { signal },
            generation,
          ),
        onSuccess: (profile: Rsp.Users.MyProfile) => {
          if (auth.isAuthenticatedAt(generation)) {
            queryClient.setQueryData(keys.profile, profile);
          }
        },
      };
    },
  };
}
