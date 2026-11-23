/** 通过认证会话门控本人账号、资料、模型和任务服务端查询。 */

import { focusManager, onlineManager, type QueryClient, type QueryObserverOptions } from '@tanstack/react-query';
import type { CloudClient, Req, Rsp } from '@health-cv-app/cloud-client';

import { AuthSessionError, type AuthSessionManager } from '../auth/session';
import type { AuthScope } from '../auth/scope';
import { createServerQueryKeys } from './keys';

/** 描述认证代次门控的 React Query 资源查询。 */
export interface ProtectedQueryOptions<TData> {
  /** 包含服务、渠道、会话代次和资源参数的查询键。 */
  queryKey: readonly unknown[];
  /** 仅在指定代次已确认认证时允许查询。 */
  enabled: boolean;
  /** 新鲜期（毫秒）；任务详情可基于最新缓存响应动态计算。 */
  staleTime?: NonNullable<QueryObserverOptions<TData>['staleTime']>;
  /** 通过认证保护入口执行一次资源请求。 */
  queryFn: (context: { signal: AbortSignal }) => Promise<TData>;
  /** 区间错误后只允许用户显式重取，避免集合持续变化导致自动循环。 */
  refetchOnWindowFocus?: QueryObserverOptions<TData>['refetchOnWindowFocus'];
  refetchOnReconnect?: QueryObserverOptions<TData>['refetchOnReconnect'];
  refetchOnMount?: QueryObserverOptions<TData>['refetchOnMount'];
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

/** 一个完整筛选区间的唯一缓存；未完成数据不能用于最终趋势或统计。 */
export interface MeasurementHistoryData {
  items: Rsp.Measurements.MeasurementRecord[];
  total: number;
  complete: boolean;
  error: unknown | null;
}

/** 历史页的筛选身份不包含分页；分页属于同一整段读取。 */
export type MeasurementHistoryParams = Pick<Req.Measurements.MeasurementListParams, 'metric' | 'from' | 'to'>;

/** 表示 offset 分页期间已发现集合变化，而不是已取得完整快照。 */
class MeasurementCollectionChangedError extends Error {
  constructor() {
    super('健康记录已变化，请刷新后重试');
    this.name = 'MeasurementCollectionChangedError';
  }
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
  /** 读取五项最新有效结果；刷新失败由查询状态保留旧值与错误。 */
  latestMeasurements(): ProtectedQueryOptions<Rsp.Measurements.LatestMeasurements>;
  /** 连续取得完整区间；显式重新读取始终从 offset=0 开始。 */
  measurementHistory(query: MeasurementHistoryParams): ProtectedQueryOptions<MeasurementHistoryData>;
  /** 已知新有效任务后丢弃旧区间，读取服务端权威结果而不追加本地读数。 */
  invalidateMeasurements(generation?: number): Promise<void>;
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
        staleTime: 60_000,
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
        staleTime: 1_800_000,
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
        staleTime: 30_000,
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
        staleTime: (query) => {
          const status = query.state.data?.status;
          return status === 'SUCCEEDED' || status === 'FAILED' ? 300_000 : 0;
        },
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          auth.runProtected((options) => client.tasks.getById(taskId, options), { signal }, generation),
      };
    },
    latestMeasurements() {
      const generation = auth.getSessionGeneration();
      const keys = createServerQueryKeys(scope, generation);
      return {
        queryKey: keys.latestMeasurements,
        enabled: auth.isAuthenticatedAt(generation),
        staleTime: 30_000,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          auth.runProtected((options) => client.measurements.latest(options), { signal }, generation),
      };
    },
    measurementHistory(query: MeasurementHistoryParams) {
      const generation = auth.getSessionGeneration();
      // 复制请求筛选，避免调用方修改对象后出现 key 与实际请求不一致。
      const filter = { metric: query.metric, from: query.from, to: query.to };
      const queryKey = createServerQueryKeys(scope, generation).measurementHistory(filter.metric, filter.from, filter.to);
      const canAutoRefetch: NonNullable<QueryObserverOptions<MeasurementHistoryData>['refetchOnWindowFocus']> =
        (cached) => !cached.state.data?.error;
      return {
        queryKey,
        enabled: auth.isAuthenticatedAt(generation),
        staleTime: 30_000,
        refetchOnWindowFocus: canAutoRefetch,
        refetchOnReconnect: canAutoRefetch,
        refetchOnMount: canAutoRefetch,
        async queryFn({ signal }: { signal: AbortSignal }): Promise<MeasurementHistoryData> {
          const previous = queryClient.getQueryData<MeasurementHistoryData>(queryKey);
          const assertCurrent = () => {
            if (!auth.isAuthenticatedAt(generation)) throw new AuthSessionError('session-changed');
            if (signal.aborted) throw new AuthSessionError('operation-cancelled');
          };
          // 只允许发现集合变化后整段自动重读一次；通信失败从不自动重试。
          for (let attempt = 0; attempt < 2; attempt += 1) {
            const items: Rsp.Measurements.MeasurementRecord[] = [];
            const ids = new Set<string>();
            let total = 0;
            let offset = 0;
            try {
              assertCurrent();
              while (true) {
                const page = await auth.runProtected(
                  (options) => client.measurements.list({ ...filter, offset, limit: 100 }, options),
                  { signal },
                  generation,
                );
                assertCurrent();
                if (offset > 0 && page.total !== total) throw new MeasurementCollectionChangedError();
                if (!Number.isInteger(page.total) || page.total < 0 ||
                    page.offset !== offset || !Number.isInteger(page.limit) || page.limit < 1 || page.limit > 100 ||
                    page.items.length > page.limit || offset + page.items.length > page.total) {
                  throw new Error('健康记录分页响应无效，请重新查询');
                }
                total = page.total;
                for (const record of page.items) {
                  if (ids.has(record.recordId)) throw new MeasurementCollectionChangedError();
                  ids.add(record.recordId);
                  items.push(record);
                }
                if (items.length === total) return { items, total, complete: true, error: null };
                if (page.items.length !== page.limit) throw new Error('健康记录区间尚未完整，请重新查询');
                offset = page.offset + page.limit;
              }
            } catch (error) {
              assertCurrent();
              if (error instanceof MeasurementCollectionChangedError) {
                const incomplete = previous?.complete ? { ...previous, error } : { items: [], total: 0, complete: false, error };
                const active = queryClient.getQueryCache().find({ queryKey, exact: true })?.isActive();
                if (attempt === 0 && active && focusManager.isFocused() && onlineManager.isOnline()) continue;
                return incomplete;
              }
              // 旧完整结果仍属于同一区间和代次，可以明确标记未刷新，而不是变成空记录。
              return previous?.complete
                ? { ...previous, error }
                : { items: [], total, complete: false, error };
            }
          }
          // 循环的第二轮必定返回或抛出；不会以占位数据伪装完整区间。
          throw new MeasurementCollectionChangedError();
        },
      };
    },
    async invalidateMeasurements(generation = auth.getSessionGeneration()) {
      if (!auth.isAuthenticatedAt(generation)) return;
      const keys = createServerQueryKeys(scope, generation);
      const root = [...keys.root, 'measurements'] as const;
      await queryClient.cancelQueries({ queryKey: root });
      if (!auth.isAuthenticatedAt(generation)) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.latestMeasurements, exact: true, refetchType: 'all' }),
        // 取消旧轮后整段重读；刷新期间仍保留同区间上次完整展示。
        queryClient.invalidateQueries({ queryKey: [...root, 'history'] }),
      ]);
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
