/** 应用组装注入云端依赖；目录选择只在当前认证代次内有效。 */
import type { CloudClient, Rsp } from '@health-cv-app/cloud-client'
import type { AuthSessionManager } from '../auth/session'
import type { QueryClient } from '@tanstack/react-query'
import type { AppQueries } from '../query/resources'
import { findCloudMeasurementPlan } from './cloudPlan'
import type { ContactMethod } from './cloudPlan'
import type { CloudWorkflowOptions } from './cloudWorkflow'

export function createMeasurementServices(client: CloudClient, auth: AuthSessionManager, queries: AppQueries, queryClient: QueryClient) {
  const plans = new Map<ContactMethod, { generation: number; model: Rsp.Models.AvailableModel }>()
  return {
    async prepare(method: ContactMethod, signal?: AbortSignal) {
      const generation = auth.getSessionGeneration()
      const model = await findCloudMeasurementPlan(client, auth, method, generation, signal)
      if (!auth.isAuthenticatedAt(generation)) throw new Error('session-changed')
      plans.set(method, { generation, model })
    },
    getPlan(method: ContactMethod, generation: number) {
      const selected = plans.get(method)
      return selected?.generation === generation && auth.isAuthenticatedAt(generation) ? selected.model : null
    },
    workflowOptions: {
      client, auth,
      invalidateMeasurements: (generation: number) => queries.invalidateMeasurements(generation),
      async readTask(taskId: number, generation: number, signal: AbortSignal) {
        if (!auth.isAuthenticatedAt(generation)) throw new Error('session-changed')
        const resource = queries.task(taskId)
        return queryClient.fetchQuery({
          ...resource, staleTime: 0,
          queryFn: ({ signal: querySignal }) => {
            const controller = new AbortController()
            const abort = () => controller.abort()
            signal.addEventListener('abort', abort, { once: true })
            querySignal.addEventListener('abort', abort, { once: true })
            if (signal.aborted || querySignal.aborted) controller.abort()
            return auth.runProtected((options) => client.tasks.getById(taskId, options), { signal: controller.signal }, generation)
              .finally(() => { signal.removeEventListener('abort', abort); querySignal.removeEventListener('abort', abort) })
          },
        })
      },
    } satisfies Omit<CloudWorkflowOptions, 'onChange'>,
  }
}
export interface MeasurementServices {
  prepare(method: ContactMethod, signal?: AbortSignal): Promise<void>
  getPlan(method: ContactMethod, generation: number): Rsp.Models.AvailableModel | null
  workflowOptions: Omit<CloudWorkflowOptions, 'onChange'>
}
