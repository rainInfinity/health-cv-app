/** 创建应用端不自动重试且不持久化的服务端数据缓存。 */

import { QueryClient } from '@tanstack/react-query';

/** 显式关闭通用查询和变更重试的应用 QueryClient。 */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { gcTime: 600_000, retry: false },
      mutations: { networkMode: 'always', retry: false },
    },
  });
}
