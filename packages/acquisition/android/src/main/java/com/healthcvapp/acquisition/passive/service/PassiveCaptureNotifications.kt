/** 创建被动服务的安静通知，并检查用户要求的可见通知条件。 */

package com.healthcvapp.acquisition.passive.service

import android.Manifest
import android.net.Uri
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.margelo.nitro.acquisition.PassiveCaptureState

/** 维护同一条等待／录像通知及其原生关闭操作。 */
internal object PassiveCaptureNotifications {
  const val CHANNEL_ID = "passive_capture"
  const val NOTIFICATION_ID = 7312
  private const val REQUEST_STATUS = 7313
  private const val REQUEST_STOP = 7314
  const val STATUS_URI = "healthcvapp://passive-capture"

  /** 创建首次使用的低重要性渠道；不覆盖用户已做的渠道选择。 */
  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return

    val channel = NotificationChannel(
      CHANNEL_ID,
      "无扰式采集状态",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "显示被动采集正在等待解锁或正在录像。"
      setSound(null, null)
      enableVibration(false)
      setShowBadge(false)
      lockscreenVisibility = Notification.VISIBILITY_PRIVATE
    }
    manager.createNotificationChannel(channel)
  }

  /** 返回权限、应用通知或安静渠道不可用的具体原因。 */
  fun availabilityFailure(context: Context): Pair<String, String>? {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      return "CAMERA_PERMISSION_DENIED" to "需要相机权限才能启用被动采集。"
    }
    if (
      Build.VERSION.SDK_INT >= 33 &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      return "NOTIFICATION_PERMISSION_DENIED" to "需要通知权限才能显示被动采集运行状态。"
    }
    if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
      return "APP_NOTIFICATIONS_DISABLED" to "应用通知已关闭，请先在系统设置中重新允许通知。"
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = context.getSystemService(NotificationManager::class.java).getNotificationChannel(CHANNEL_ID)
        ?: return "NOTIFICATION_CHANNEL_MISSING" to "被动采集通知渠道不可用，请重新启用功能。"
      if (channel.importance == NotificationManager.IMPORTANCE_NONE) {
        return "NOTIFICATION_CHANNEL_DISABLED" to "被动采集通知渠道已关闭，请在系统设置中重新允许。"
      }
      if (channel.shouldVibrate() || channel.sound != null || channel.importance >= NotificationManager.IMPORTANCE_HIGH) {
        return "NOTIFICATION_CHANNEL_NOT_QUIET" to "通知渠道已被设为提醒或振动，请在系统设置中恢复安静通知。"
      }
    }
    return null
  }

  /** 构建同 ID、无声且无振动的真实服务状态通知。 */
  fun build(context: Context, state: PassiveCaptureState): Notification {
    val (title, text) = when (state) {
      PassiveCaptureState.RECORDING ->
        "无扰式采集进行中" to "前置摄像头正在无声录像。"
      PassiveCaptureState.STARTING ->
        "无扰式采集正在启动" to "正在准备前置摄像头，启动完成后等待新的解锁事件。"
      PassiveCaptureState.STOPPING, PassiveCaptureState.FAILED ->
        "无扰式采集正在收尾" to "正在停止当前会话并释放摄像头。"
      else ->
        "无扰式采集已启用" to "等待符合周期的设备解锁；等待时相机关闭。"
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val statusIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
      action = Intent.ACTION_VIEW
      data = Uri.parse(STATUS_URI)
      addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_menu_camera)
      .setContentTitle(title)
      .setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setShowWhen(false)
      .addAction(
        0,
        "关闭无扰采集",
        PendingIntent.getService(
          context,
          REQUEST_STOP,
          Intent(context, PassiveCaptureService::class.java).setAction(PassiveCaptureService.ACTION_DISABLE),
          flags,
        ),
      )

    if (statusIntent != null) {
      builder.setContentIntent(PendingIntent.getActivity(context, REQUEST_STATUS, statusIntent, flags))
    }
    return builder.build()
  }
}
