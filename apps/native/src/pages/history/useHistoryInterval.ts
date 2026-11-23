/** 仅订阅当前筛选和认证代次的区间查询，不在页面自行拼页。 */
import { useEffect, useState } from 'react'
import { QueryObserver, type QueryObserverResult } from '@tanstack/react-query'
import { useAppServices } from '@/app/providers/AppProviders'
import { useAuthState } from '@/app/auth/useAuthState'
import type { HistoryFilter } from './historyModel'
import type { MeasurementHistoryData } from '@/app/query/resources'

/** 页面重新聚焦或筛选变化时从第一页读取完整区间，不拼接旧轮页面。 */
export function useHistoryInterval(filter: HistoryFilter, focused: boolean) {
  const services = useAppServices()
  const auth = useAuthState()
  const options = services?.queries.measurementHistory({ metric: filter.metric, from: filter.from, to: filter.to })
  const key = JSON.stringify(options?.queryKey)
  const [snapshot, setSnapshot] = useState<{ key: string | undefined; result: QueryObserverResult<MeasurementHistoryData> } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    if (!services) return
    const observer = new QueryObserver<MeasurementHistoryData>(services.queryClient, { ...services.queries.measurementHistory({ metric: filter.metric, from: filter.from, to: filter.to }), enabled: options!.enabled && focused, refetchOnMount: 'always' })
    const publish = () => setSnapshot({ key, result: observer.getCurrentResult() })
    const unsubscribe = observer.subscribe(publish)
    publish()
    return () => { unsubscribe(); observer.destroy() }
  }, [services, key, focused, options?.enabled, filter.metric, filter.from, filter.to, refreshKey])
  const result = snapshot && snapshot.key === key && auth.status === 'authenticated' ? snapshot.result : undefined
  return {
    // 缓存可保留上次完整区间，但加载、离线暂停与失败统一使用页面状态，不继续展示旧记录。
    data: result?.isFetching || result?.isPaused || result?.isError || result?.data?.error != null ? undefined : result?.data,
    error: result?.error ?? result?.data?.error ?? (services ? null : new Error('云端服务未配置')),
    fetching: result ? result.isFetching || result.isPaused : auth.status === 'authenticated' && services !== null,
    refresh: () => setRefreshKey((value) => value + 1),
  }
}
