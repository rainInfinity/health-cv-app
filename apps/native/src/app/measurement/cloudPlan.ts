/** 只按已约定编码选择当前渠道正式场景，不按名称或输入猜算法。 */
import type { CloudClient, Rsp } from '@health-cv-app/cloud-client'
import type { AuthSessionManager } from '../auth/session'
import type { MeasurementMethod } from '../navigation/types'

export type ContactMethod = Exclude<MeasurementMethod, 'face'>
export const CLOUD_PLANS = {
  fingertip: { modelCode: 'ppg.active.offline.all', inputs: ['ppg'] },
  chest: { modelCode: 'ppg_acc.active.offline.all', inputs: ['ppg', 'acc'] },
} as const

export async function findCloudMeasurementPlan(client: CloudClient, auth: AuthSessionManager, method: ContactMethod, generation: number, signal?: AbortSignal): Promise<Rsp.Models.AvailableModel> {
  const plan = CLOUD_PLANS[method]
  let offset = 0
  for (;;) {
    const page = await auth.runProtected((options) => client.models.list({ offset, limit: 100 }, options), { signal }, generation)
    const model = page.items.find((item) => item.modelCode === plan.modelCode)
    if (model) {
      if (model.isExample !== false || model.requiredInputs.length !== plan.inputs.length || !plan.inputs.every((input) => model.requiredInputs.includes(input))) throw new Error('measurement-model-unavailable')
      return model
    }
    const next = page.offset + page.limit
    if (page.items.length === 0 || next >= page.total) throw new Error('measurement-model-unavailable')
    if (next <= offset) throw new Error('measurement-model-unavailable')
    offset = next
  }
}
