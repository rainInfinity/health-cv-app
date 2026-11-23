/** 报告仅观察鉴权任务，既不接管采集，也不重新创建或提交任务。 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useIsFocused } from '@react-navigation/native'
import { QueryObserver } from '@tanstack/react-query'
import type { QueryObserverResult } from '@tanstack/react-query'
import type { Rsp } from '@health-cv-app/cloud-client'
import { AppState } from 'react-native'
import { useAppServices } from '@/app/providers/AppProviders'
import { useAuthState } from '@/app/auth/useAuthState'
import { subscribeToAppState } from '@/app/lifecycle/foreground'
import { adaptMeasurementResult } from '@/app/measurement/resultAdapter'

/** 仅前台可见的处理中任务在上次查询完成后安排下一次；请求失败停到显式查询。 */
export function useMeasurementReport(taskId: number) {
  const services = useAppServices()
  const auth = useAuthState()
  const focused = useIsFocused()
  const [foreground, setForeground] = useState(AppState.currentState === 'active')
  const [refreshKey, setRefreshKey] = useState(0)
  const invalidated = useRef<{ generation: number; taskIds: Set<number> } | null>(null)
  useEffect(() => subscribeToAppState((state) => setForeground(state === 'active')), [])
  const generation = services?.auth.getSessionGeneration()
  const active = focused && foreground && auth.status === 'authenticated' && Number.isInteger(taskId) && taskId > 0
  const observer = useMemo(() => services ? new QueryObserver<Rsp.Tasks.TaskDetail>(services.queryClient, {
    ...services.queries.task(taskId),
    enabled: false,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  }) : null, [services, generation, taskId])
  const [snapshot, setSnapshot] = useState<{ observer: QueryObserver<Rsp.Tasks.TaskDetail>; result: QueryObserverResult<Rsp.Tasks.TaskDetail> } | null>(null)
  useEffect(() => {
    if (!observer) return
    return observer.subscribe((result) => setSnapshot({ observer, result }))
  }, [observer])
  useEffect(() => {
    if (!services || !observer || !active || generation == null) return
    let current = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const readTask = async () => {
      const result = await observer.refetch({ cancelRefetch: false })
      if (!current || !services.auth.isAuthenticatedAt(generation) || result.isError) return
      if (result.data?.status === 'SUBMITTED' || result.data?.status === 'RUNNING') timer = setTimeout(() => { void readTask() }, 2_000)
    }
    void readTask()
    return () => {
      current = false
      clearTimeout(timer)
      void services.queryClient.cancelQueries({ queryKey: observer.options.queryKey, exact: true })
    }
  }, [services, observer, active, generation, refreshKey])
  const result = snapshot?.observer === observer ? snapshot.result : observer?.getCurrentResult()
  const task = auth.status === 'authenticated' && generation != null && services?.auth.isAuthenticatedAt(generation) && !result?.isError && result?.data?.taskId === taskId ? result.data : undefined
  const report = useMemo(() => task ? adaptMeasurementResult(task) : null, [task])
  useEffect(() => {
    if (!active || !services || generation == null || task?.status !== 'SUCCEEDED' || !report?.hasValidMembers || !services.auth.isAuthenticatedAt(generation)) return
    if (invalidated.current?.generation !== generation) invalidated.current = { generation, taskIds: new Set() }
    if (invalidated.current.taskIds.has(task.taskId)) return
    invalidated.current.taskIds.add(task.taskId)
    void services.queries.invalidateMeasurements(generation)
  }, [active, services, generation, task, report])
  return {
    task, report,
    loading: active && (result?.isFetching === true || !task || report?.state === 'pending'),
    error: (!result?.isFetching && (result?.isError === true || report?.state === 'unavailable' || report?.taskStatus === 'DRAFT')) || !services || auth.status !== 'authenticated' || !Number.isInteger(taskId) || taskId <= 0,
    available: auth.status === 'authenticated' && services != null,
    refresh: () => { if (active) setRefreshKey((key) => key + 1) },
  }
}
