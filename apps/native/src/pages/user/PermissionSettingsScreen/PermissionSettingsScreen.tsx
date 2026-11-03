/** 查询 Android 权限真实状态，只在明确操作时申请或打开设置。 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'
import { AppState, View } from 'react-native'
import { useFocusEffect, useIsFocused, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import { useTheme } from 'styled-components/native'

import { permissionService } from '@/app/permissions'
import type { PermissionRequestResult, PermissionSettingsSnapshot, PermissionValue } from '@/app/permissions'
import type { RootStackParamList } from '@/app/navigation/types'
import { permissionMessages } from '@/pages/user/permissionMessages'
import { useFeedback } from '@/shared/components/FeedbackHost'
import { ActionButton } from '@/shared/components/ActionButton'
import { AppCard } from '@/shared/components/AppCard'
import { AppText } from '@/shared/components/AppText'
import { PageContainer } from '@/shared/components/PageContainer'
import { StatusFeedback } from '@/shared/components/StatusFeedback'

import { PermissionGroup, PermissionRow } from './styles'

/** 权限页消息与版本说明的类型。 */
type PermissionMessages = ReturnType<typeof permissionMessages.get>
/** 将权限状态映射为不会推断的本地说明文案。 */

function permissionLabel(value: PermissionValue, messages: PermissionMessages): string {
  if (value === 'granted') return messages.granted
  if (value === 'denied') return messages.denied
  if (value === 'not-required') return messages.notRequired
  if (value === 'not-created') return messages.notCreated
  return messages.unknown
}

/** 渲染通知与隐私授权入口；读取不申请权限或启动采集。 */
export function PermissionSettingsScreen() {
  const theme = useTheme()
  const route = useRoute<RouteProp<RootStackParamList, 'PermissionSettings'>>()
  const isFocused = useIsFocused()
  const messages = useStore(permissionMessages)
  const { showToast } = useFeedback()
  const [snapshot, setSnapshot] = useState<PermissionSettingsSnapshot | null>(null)
  const [requestError, setRequestError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [cameraBlocked, setCameraBlocked] = useState(false)
  const [notificationsBlocked, setNotificationsBlocked] = useState(false)
  const [requesting, setRequesting] = useState<'camera' | 'notifications' | null>(null)
  const refreshSequence = useRef(0)

  /** 刷新单次真实系统快照；较早的异步结果不能覆盖最新读取。 */
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current
    setRefreshing(true)
    setRequestError(false)
    try {
      const next = await permissionService.getSnapshot()
      if (sequence === refreshSequence.current) setSnapshot(next)
    } catch {
      if (sequence === refreshSequence.current) setSnapshot(null)
    } finally {
      if (sequence === refreshSequence.current) setRefreshing(false)
    }
  }, [])

  useFocusEffect(useCallback(() => {
    void refresh()
    return undefined
  }, [refresh]))

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isFocused) void refresh()
    })
    return () => subscription.remove()
  }, [isFocused, refresh])

  /** 执行一项明确的系统权限请求并重新读取实际结果。 */
  const runRequest = useCallback(async (
    kind: 'camera' | 'notifications',
    request: () => Promise<PermissionRequestResult>,
  ) => {
    setRequesting(kind)
    setRequestError(false)
    if (kind === 'camera') setCameraBlocked(false)
    else setNotificationsBlocked(false)
    try {
      const result = await request()
      if (result === 'blocked' && kind === 'camera') setCameraBlocked(true)
      if (result === 'blocked' && kind === 'notifications') setNotificationsBlocked(true)
      await refresh()
    } catch {
      setRequestError(true)
    } finally {
      setRequesting(null)
    }
  }, [refresh])

  /** 打开当前应用系统设置，权限状态只在返回后重新读取。 */
  const openSettings = useCallback(async () => {
    try {
      await permissionService.openAppSettings()
      showToast({ tone: 'information', message: messages.settingsOpened })
    } catch {
      setRequestError(true)
    }
  }, [messages.settingsOpened, showToast])

  /** 根据当前状态选择安全的展示文案，未读取时一律显示未知。 */
  function getLabel(value: PermissionValue | null): string {
    return permissionLabel(value ?? 'unknown', messages)
  }

  const heading = route.params.section === 'notifications'
    ? messages.notificationsTitle
    : messages.privacyTitle
  const apiLevel = snapshot?.apiLevel ?? null
  const settingsNeeded = cameraBlocked
    || notificationsBlocked
    || snapshot?.camera === 'denied'
    || snapshot?.notificationRuntime === 'denied'
    || snapshot?.notificationApp === 'denied'
    || snapshot?.notificationChannel === 'denied'

  return (
    <PageContainer edges={['left', 'right', 'bottom']}>
      <AppText variant="title">{heading}</AppText>
      <AppText tone="secondary">{messages.description}</AppText>
      {requestError && <StatusFeedback title={messages.requestError} tone="error" />}
      {refreshing && snapshot == null && (
        <StatusFeedback title={messages.unknown} tone="pending" />
      )}
      <AppCard>
        <PermissionGroup>
          <AppText variant="section">{messages.cameraPurpose}</AppText>
          <PermissionRow>
            <AppText>{messages.camera}</AppText>
            <AppText tone="secondary">{getLabel(snapshot?.camera ?? null)}</AppText>
          </PermissionRow>
          {snapshot?.camera !== 'granted' && (
            <ActionButton
              label={messages.requestCamera}
              disabled={requesting != null}
              loading={requesting === 'camera'}
              onPress={() => void runRequest('camera', permissionService.requestCamera)}
            />
          )}
        </PermissionGroup>
      </AppCard>

      <AppCard>
        <PermissionGroup>
          <AppText variant="section">{messages.notificationPurpose}</AppText>
          <PermissionRow>
            <AppText>{messages.notificationRuntime}</AppText>
            <AppText tone="secondary">{getLabel(snapshot?.notificationRuntime ?? null)}</AppText>
          </PermissionRow>
          {apiLevel != null && apiLevel >= 33 && snapshot?.notificationRuntime !== 'granted' && (
            <ActionButton
              label={messages.requestNotifications}
              disabled={requesting != null}
              loading={requesting === 'notifications'}
              onPress={() => void runRequest('notifications', permissionService.requestNotifications)}
            />
          )}
          <PermissionRow>
            <AppText>{messages.notificationApp}</AppText>
            <AppText tone="secondary">{getLabel(snapshot?.notificationApp ?? null)}</AppText>
          </PermissionRow>
          <PermissionRow>
            <AppText>{messages.notificationChannel}</AppText>
            <AppText tone="secondary">{getLabel(snapshot?.notificationChannel ?? null)}</AppText>
          </PermissionRow>
          {apiLevel != null && apiLevel >= 26 && snapshot?.notificationChannel === 'not-created' && (
            <AppText variant="caption" tone="secondary">{messages.channelNotCreated}</AppText>
          )}
        </PermissionGroup>
      </AppCard>

      {cameraBlocked || notificationsBlocked ? (
        <StatusFeedback title={messages.permanentDenial} tone="error" />
      ) : null}
      {settingsNeeded && (
        <ActionButton
          label={messages.openAppSettings}
          secondary
          disabled={requesting != null}
          onPress={() => void openSettings()}
        />
      )}
      <View style={{ gap: theme.spacing.sm }}>
        <ActionButton label={messages.refresh} secondary disabled={refreshing} onPress={() => void refresh()} />
        {snapshot?.apiLevel != null && (
          <AppText variant="caption" tone="secondary">{messages.androidApi({ value: snapshot.apiLevel })}</AppText>
        )}
      </View>
    </PageContainer>
  )
}
