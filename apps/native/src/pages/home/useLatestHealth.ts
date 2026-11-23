/** 首页订阅当前会话最新记录，错误事实和空展示与缓存旧值分离。 */
import { useEffect, useRef, useState } from 'react'
import { QueryObserver, type QueryObserverResult } from '@tanstack/react-query'
import type { Rsp } from '@health-cv-app/cloud-client'
import { useAuthState } from '@/app/auth/useAuthState'
import { useAppServices } from '@/app/providers/AppProviders'

/** 首次无缓存时读取，后续由手动刷新或有效记录的查询键失效更新。 */
export function useLatestHealth() {
  const services = useAppServices()
  const auth = useAuthState()
  const options = services?.queries.latestMeasurements()
  const key = JSON.stringify(options?.queryKey)
  const [snapshot, setSnapshot] = useState<{ key: string | undefined; result: QueryObserverResult<Rsp.Measurements.LatestMeasurements> } | null>(null)
  const observer = useRef<QueryObserver<Rsp.Measurements.LatestMeasurements> | null>(null)
  useEffect(() => {
    if (!services) return
    const subscription = new QueryObserver<Rsp.Measurements.LatestMeasurements>(services.queryClient, {
      ...services.queries.latestMeasurements(),
      enabled: options!.enabled,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retryOnMount: false,
    })
    observer.current = subscription
    const publish = () => setSnapshot({ key, result: subscription.getCurrentResult() })
    const unsubscribe = subscription.subscribe(publish)
    publish()
    return () => { unsubscribe(); subscription.destroy(); observer.current = null }
  }, [services, key, options?.enabled])
  const result = snapshot && snapshot.key === key && auth.status === 'authenticated' ? snapshot.result : undefined
  return {
    data: result?.isError ? undefined : result?.data,
    error: result?.error ?? (services ? null : new Error('云端服务未配置')),
    fetching: result?.isFetching ?? (auth.status === 'authenticated' && services !== null),
    mode: auth.status !== 'authenticated' ? 'ready' as const
      : result?.isFetching || !result ? (result?.dataUpdatedAt || result?.errorUpdatedAt ? 'refreshing' as const : 'loading' as const) : 'ready' as const,
    errorUpdatedAt: result?.errorUpdatedAt ?? 0,
    hasPrevious: (result?.dataUpdatedAt ?? 0) > 0,
    refresh: () => {
      if (auth.status !== 'authenticated' || !options?.enabled) return
      return observer.current?.refetch({ cancelRefetch: false })
    },
  }
}
