/** 组装独立于认证和云端配置的被动采集客户端与页面状态。 */

import { atom, computed, type ReadableAtom } from 'nanostores'
import { createPassiveCaptureClient } from '@health-cv-app/acquisition'
import type { PassiveCaptureConfig, PassiveCaptureSnapshot } from '@health-cv-app/acquisition'
import { Linking } from 'react-native'

/** 应用进程唯一的被动采集 Nitro 控制对象。 */
export const passiveCaptureClient = createPassiveCaptureClient()

const snapshotAtom = atom<PassiveCaptureSnapshot>(passiveCaptureClient.getSnapshot())
const commandBusyAtom = atom(false)
const commandErrorAtom = atom<string | null>(null)

/** 多入口共享的瞬时命令状态，包含知情说明、授权及原生收尾。 */
export const passiveCaptureBusy = computed(
  [commandBusyAtom, snapshotAtom],
  (commandBusy, snapshot) => commandBusy || snapshot.state === 'starting' || snapshot.state === 'stopping',
)

/** 只映射稳定错误码，不把原生异常文字直接交给产品界面。 */
export const passiveCaptureError = computed(
  [commandErrorAtom, snapshotAtom],
  (commandError, snapshot) => commandError ?? snapshot.errorCode
    ?? (snapshot.errorMessage != null || snapshot.state === 'failed' ? 'UNKNOWN' : null),
)

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

/** 只有原生已确认的稳定运行阶段才表示开关开启。 */
export function isPassiveCaptureEnabled(snapshot: PassiveCaptureSnapshot): boolean {
  return snapshot.state === 'waiting' || snapshot.state === 'observing' || snapshot.state === 'measuring'
}

/** 从结构化异常提取稳定错误码，不保留底层异常说明。 */
export function readPassiveCaptureErrorCode(error: unknown): string {
  if (error != null && typeof error === 'object' && 'code' in error
    && typeof error.code === 'string' && error.code.length > 0) return error.code
  return 'UNKNOWN'
}

/** 串行执行显式用户命令；权限弹窗和知情交互期间同样防重。 */
async function runPassiveCaptureCommand(command: () => Promise<void>): Promise<boolean> {
  if (passiveCaptureBusy.get()) return false
  commandBusyAtom.set(true)
  commandErrorAtom.set(null)
  try {
    await command()
    refreshPassiveCaptureSnapshot()
    return true
  } catch (error) {
    commandErrorAtom.set(readPassiveCaptureErrorCode(error))
    refreshPassiveCaptureSnapshot()
    return false
  } finally {
    commandBusyAtom.set(false)
  }
}

/** 知情确认后才授权并启用；取消或仅打开设置绝不执行 enable。 */
export function enablePassiveCapture(
  showBackgroundActivity: (decide: (decision: 'enable' | 'settings' | 'cancel') => void) => void,
): void {
  if (passiveCaptureBusy.get()) return
  commandBusyAtom.set(true)
  commandErrorAtom.set(null)
  let decided = false
  showBackgroundActivity((decision) => {
    if (decided) return
    decided = true
    // 说明本身持有共享锁，用户选择后将锁交接给同一命令入口。
    commandBusyAtom.set(false)
    if (decision === 'enable') void runPassiveCaptureCommand(() => passiveCaptureClient.enable())
    else if (decision === 'settings') void openPassiveCaptureSettings()
  })
}

/** 关闭同一服务并等待原生文件及资源收尾，不乐观翻转服务状态。 */
export function disablePassiveCapture(): Promise<boolean> {
  return runPassiveCaptureCommand(() => passiveCaptureClient.disable())
}

/** 开发配置也使用同一命令锁，不与授权、启停并发。 */
export function setPassiveCaptureConfig(config: PassiveCaptureConfig): Promise<boolean> {
  return runPassiveCaptureCommand(() => passiveCaptureClient.setConfig(config))
}

/** 显式打开系统设置；返回应用后只刷新快照，不自动启用。 */
export function openPassiveCaptureSettings(): Promise<boolean> {
  return runPassiveCaptureCommand(() => Linking.openSettings())
}

