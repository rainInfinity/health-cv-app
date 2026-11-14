/** 组装独立于认证和云端配置的被动采集客户端与页面状态。 */

import { atom, type ReadableAtom } from 'nanostores'
import {
  createPassiveCaptureClient,
} from '@health-cv-app/acquisition'
import type { PassiveCaptureSnapshot } from '@health-cv-app/acquisition'

/** 应用进程唯一的被动采集 Nitro 控制对象。 */
export const passiveCaptureClient = createPassiveCaptureClient()

const snapshotAtom = atom<PassiveCaptureSnapshot>(passiveCaptureClient.getSnapshot())

/** 页面只读订阅的原生被动服务真实状态。 */
export const passiveCaptureSnapshot: ReadableAtom<PassiveCaptureSnapshot> = snapshotAtom

/** 读取原生服务快照并核对运行条件，不会启用或恢复服务。 */
export function refreshPassiveCaptureSnapshot(): PassiveCaptureSnapshot {
  const snapshot = passiveCaptureClient.getSnapshot()
  snapshotAtom.set(snapshot)
  return snapshot
}

/** 页面连接低频状态通知；清理只解除订阅，不停止后台服务。 */
export function connectPassiveCaptureScreen(): () => void {
  refreshPassiveCaptureSnapshot()
  return passiveCaptureClient.subscribe((snapshot) => snapshotAtom.set(snapshot))
}

