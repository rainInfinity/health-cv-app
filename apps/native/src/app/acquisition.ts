/** 独立于云端与认证配置组装采集客户端和只读 Nano Stores 状态。 */

import { atom, type ReadableAtom } from 'nanostores'
import {
  AcquisitionError,
  createAcquisitionClient,
} from '@health-cv-app/acquisition'
import type { AcquisitionSnapshot } from '@health-cv-app/acquisition'

/** 应用进程唯一的 Android 采集控制对象。 */
export const acquisitionClient = createAcquisitionClient()

const snapshotAtom = atom<AcquisitionSnapshot>(acquisitionClient.getSnapshot())

/** 页面只读订阅的原生采集状态。 */
export const acquisitionSnapshot: ReadableAtom<AcquisitionSnapshot> = snapshotAtom

/** 连接当前采集界面的低频原生状态通知。 */
export function connectAcquisitionScreen(): () => void {
  snapshotAtom.set(acquisitionClient.getSnapshot())
  return acquisitionClient.subscribe((snapshot) => snapshotAtom.set(snapshot))
}

/** 解除页面通知并等待相机会话完成关闭。 */
export async function closeAcquisitionScreen(unsubscribe: () => void): Promise<void> {
  unsubscribe()
  try {
    await acquisitionClient.closeCamera()
  } finally {
    snapshotAtom.set(acquisitionClient.getSnapshot())
  }
}

/** 将卸载期间的关闭错误保留到下次页面进入时显示。 */
export function preserveAcquisitionCleanupError(error: unknown): void {
  const snapshot = acquisitionClient.getSnapshot()
  const details = error instanceof AcquisitionError
    ? { code: error.code, message: error.message }
    : {
        code: 'CAMERA_CLOSE_FAILED',
        message: error instanceof Error ? error.message : '关闭相机时发生未知错误。',
      }

  snapshotAtom.set({
    ...snapshot,
    state: 'failed',
    errorCode: details.code,
    errorMessage: details.message,
  })
}
