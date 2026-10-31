/** 注册进程级 MMKV 实例作为 Nano Stores persistent 的唯一原生存储。 */

import { setPersistentEngine } from '@nanostores/persistent'
import type { PersistentEvents } from '@nanostores/persistent'
import { createMMKV } from 'react-native-mmkv'

import { createPersistentStorageEngine } from './persistentEngine'

let initialized = false

const nativePersistentEvents: PersistentEvents = {
  /** 原生偏好 Store 禁用跨窗口监听，避免引入无效事件通道。 */
  addEventListener() {
    throw new Error('原生偏好 Store 必须关闭跨窗口监听。')
  },
  /** 原生偏好 Store 不注册跨窗口监听。 */
  removeEventListener() {},
}

/** 在创建任何持久化 Store 前注册 MMKV 引擎；原生初始化失败时直接中止启动。 */
export function initializePersistentStorage(): void {
  if (initialized) return

  const storage = createMMKV({ id: 'health-cv-app-preferences' })
  setPersistentEngine(createPersistentStorageEngine(storage), nativePersistentEvents)
  initialized = true
}
