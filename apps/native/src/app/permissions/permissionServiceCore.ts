/** 将系统权限读取、明确请求与通知开关快照统一为安全状态。 */

/** 应用可展示的系统授权状态；未创建渠道不等同于用户拒绝。 */
export type PermissionValue = 'granted' | 'denied' | 'unknown' | 'not-required' | 'not-created'

/** 明确请求权限后由操作系统返回的结果。 */
export type PermissionRequestResult = 'granted' | 'denied' | 'blocked' | 'not-required' | 'unknown'

/** 被动通知相关渠道的系统侧查询结果。 */
export type NotificationChannelState = 'enabled' | 'disabled' | 'missing'

/** 描述原生查询返回的通知应用总开关及相关渠道状态。 */
export interface NativeNotificationSettings {
  /** 用户是否允许本应用显示通知。 */
  appNotificationsEnabled: boolean
  /** 被动采集通知渠道是否存在及可用；查询不会创建渠道。 */
  channelState: NotificationChannelState
}

/** 描述权限页展示的单次真实快照。 */
export interface PermissionSettingsSnapshot {
  /** 当前 Android API；非 Android 平台或未知版本为 null。 */
  apiLevel: number | null
  /** 相机运行时授权。 */
  camera: PermissionValue
  /** Android 13 及以上通知运行时授权。 */
  notificationRuntime: PermissionValue
  /** 应用级通知总开关。 */
  notificationApp: PermissionValue
  /** 被动采集通知渠道当前状态。 */
  notificationChannel: PermissionValue
}

/** 注入系统边界，确保未知读取和请求状态可确定性测试。 */
export interface PermissionServiceDependencies {
  /** 原生平台标识。 */
  platform: string
  /** 当前平台版本号。 */
  apiLevel: number | null
  /** 查询相机授权，不会申请权限。 */
  checkCamera(): Promise<boolean>
  /** 在用户明确操作后请求相机授权。 */
  requestCamera(): Promise<PermissionRequestResult>
  /** 查询 Android 13 及以上通知运行时授权。 */
  checkNotificationRuntime(): Promise<boolean>
  /** 在用户明确操作后请求通知运行时授权。 */
  requestNotificationRuntime(): Promise<PermissionRequestResult>
  /** 查询应用通知总开关和已存在的被动渠道。 */
  queryNotificationSettings(): Promise<NativeNotificationSettings>
  /** 打开当前应用的系统设置页面。 */
  openAppSettings(): Promise<void>
}

/** 暴露查询、单项授权及系统设置跳转能力。 */
export interface PermissionService {
  /** 并行读取权限，不在任何异常路径自动发起请求。 */
  getSnapshot(): Promise<PermissionSettingsSnapshot>
  /** 仅在调用方确认后请求相机权限。 */
  requestCamera(): Promise<PermissionRequestResult>
  /** 仅在 Android 13 及以上明确操作后请求通知权限。 */
  requestNotifications(): Promise<PermissionRequestResult>
  /** 打开应用系统设置，由用户自行更改权限。 */
  openAppSettings(): Promise<void>
}

/** 将单个可能失败的系统读取转为可显示的 unknown 状态。 */
async function readSafely<TValue>(read: () => Promise<TValue>): Promise<TValue | null> {
  try {
    return await read()
  } catch {
    return null
  }
}

/** 将平台权限查询与显式操作组装为独立适配器。 */
export function createPermissionService(
  dependencies: PermissionServiceDependencies,
): PermissionService {
  const isAndroid = dependencies.platform === 'android'
  const apiLevel = isAndroid && dependencies.apiLevel != null && Number.isFinite(dependencies.apiLevel)
    ? Math.floor(dependencies.apiLevel)
    : null

  /** 将读取结果映射为状态，保留系统未创建通知渠道的语义。 */
  async function getSnapshot(): Promise<PermissionSettingsSnapshot> {
    if (!isAndroid || apiLevel == null) {
      return {
        apiLevel,
        camera: 'unknown',
        notificationRuntime: 'unknown',
        notificationApp: 'unknown',
        notificationChannel: 'unknown',
      }
    }

    const [camera, notificationRuntime, nativeSettings] = await Promise.all([
      readSafely(dependencies.checkCamera),
      apiLevel < 33 ? Promise.resolve(null) : readSafely(dependencies.checkNotificationRuntime),
      readSafely(dependencies.queryNotificationSettings),
    ])

    return {
      apiLevel,
      camera: camera == null ? 'unknown' : camera ? 'granted' : 'denied',
      notificationRuntime: apiLevel < 33
        ? 'not-required'
        : notificationRuntime == null
          ? 'unknown'
          : notificationRuntime
            ? 'granted'
            : 'denied',
      notificationApp: nativeSettings == null
        ? 'unknown'
        : nativeSettings.appNotificationsEnabled
          ? 'granted'
          : 'denied',
      notificationChannel: apiLevel < 26
        ? 'not-required'
        : nativeSettings == null
          ? 'unknown'
          : nativeSettings.channelState === 'missing'
            ? 'not-created'
            : nativeSettings.channelState === 'enabled'
              ? 'granted'
              : 'denied',
    }
  }

  /** 请求相机权限；非 Android 平台不调用 Android API。 */
  async function requestCamera(): Promise<PermissionRequestResult> {
    return isAndroid ? dependencies.requestCamera() : 'unknown'
  }

  /** Android 13 以下通知不需要运行时授权，也不会启动任何服务。 */
  async function requestNotifications(): Promise<PermissionRequestResult> {
    if (!isAndroid) return 'unknown'
    if (apiLevel != null && apiLevel < 33) return 'not-required'
    return dependencies.requestNotificationRuntime()
  }

  return {
    getSnapshot,
    requestCamera,
    requestNotifications,
    openAppSettings: dependencies.openAppSettings,
  }
}
