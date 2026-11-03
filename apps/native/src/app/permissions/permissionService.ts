/** 将 React Native Android 权限 API 接到应用权限状态服务。 */

import { Linking, PermissionsAndroid, Platform } from 'react-native'

import { passiveCaptureClient } from '@/app/passive-capture'
import { createPermissionService } from './permissionServiceCore'

/** 解析 Android API 版本，未知或非数值版本不伪装为受支持系统。 */
function readApiLevel(): number | null {
  const version = Platform.Version
  const level = typeof version === 'number' ? version : Number.parseInt(version, 10)
  return Number.isFinite(level) ? level : null
}

/** 应用唯一的 Android 权限适配器；读取不触发权限框或服务启用。 */
export const permissionService = createPermissionService({
  platform: Platform.OS,
  apiLevel: readApiLevel(),
  checkCamera: () => PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA),
  requestCamera: async () => {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA)
    return result === PermissionsAndroid.RESULTS.GRANTED
      ? 'granted'
      : result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
        ? 'blocked'
        : 'denied'
  },
  checkNotificationRuntime: () =>
    PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS),
  requestNotificationRuntime: async () => {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
    return result === PermissionsAndroid.RESULTS.GRANTED
      ? 'granted'
      : result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
        ? 'blocked'
        : 'denied'
  },
  queryNotificationSettings: async () => passiveCaptureClient.getNotificationSettings(),
  openAppSettings: () => Linking.openSettings(),
})
