/** 构造并识别按服务、渠道和会话代次隔离的查询键。 */

import type { AuthScope } from '../auth/scope';

/** 生成当前会话使用的服务端资源查询键。 */
export function createServerQueryKeys(scope: AuthScope, generation: number) {
  const root = ['server', scope.serviceRoot, scope.channel, generation] as const;

  return {
    root,
    me: [...root, 'me'] as const,
    profile: [...root, 'profile'] as const,
    models: (offset?: number, limit?: number) =>
      [...root, 'models', offset ?? null, limit ?? null] as const,
    tasks: (offset?: number, limit?: number) =>
      [...root, 'tasks', offset ?? null, limit ?? null] as const,
    task: (taskId: number) => [...root, 'task', taskId] as const,
    latestMeasurements: [...root, 'measurements', 'latest'] as const,
    measurementHistory: (metric: string, from: string, to: string) =>
      [...root, 'measurements', 'history', metric, from, to] as const,
    updateProfile: [...root, 'mutation', 'profile'] as const,
  };
}

/** 判断查询或变更键是否属于即将关闭的会话作用域。 */
export function isScopedServerKey(
  key: readonly unknown[] | undefined,
  scope: AuthScope,
  generation: number,
): boolean {
  return Boolean(
    key &&
    key[0] === 'server' &&
    key[1] === scope.serviceRoot &&
    key[2] === scope.channel &&
    key[3] === generation,
  );
}
