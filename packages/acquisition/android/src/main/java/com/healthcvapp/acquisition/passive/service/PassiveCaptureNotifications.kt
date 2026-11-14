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
import com.margelo.nitro.acquisition.PassiveCaptureNotificationChannelState
import com.margelo.nitro.acquisition.PassiveCaptureNotificationSettings
import com.margelo.nitro.acquisition.PassiveCaptureState

/** 维护同一条无扰采集状态通知及其原生关闭操作。 */
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
      description = "显示被动采集等待解锁、人脸就绪观察及正式心率测量状态。"
      setSound(null, null)
      enableVibration(false)
      setShowBadge(false)
      lockscreenVisibility = Notification.VISIBILITY_PRIVATE
    }
    manager.createNotificationChannel(channel)
  }

  /** 读取通知总开关及既有渠道，不创建通知渠道或启动被动服务。 */
  fun settingsSnapshot(context: Context): PassiveCaptureNotificationSettings {
    val channelState = if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      PassiveCaptureNotificationChannelState.MISSING
    } else {
      val channel = context.getSystemService(NotificationManager::class.java).getNotificationChannel(CHANNEL_ID)
      when {
        channel == null -> PassiveCaptureNotificationChannelState.MISSING
        channel.importance == NotificationManager.IMPORTANCE_NONE -> PassiveCaptureNotificationChannelState.DISABLED
        else -> PassiveCaptureNotificationChannelState.ENABLED
      }
    }
    return PassiveCaptureNotificationSettings(
      appNotificationsEnabled = NotificationManagerCompat.from(context).areNotificationsEnabled(),
      channelState = channelState,
    )
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
  fun build(
    context: Context,
    state: PassiveCaptureState,
    measurementDurationSeconds: Double,
  ): Notification {
    val duration = if (measurementDurationSeconds % 1.0 == 0.0) {
      measurementDurationSeconds.toLong().toString()
    } else {
      measurementDurationSeconds.toString()
    }
    val targetDuration = "$duration 秒"
    val (title, text) = when (state) {
      PassiveCaptureState.DISABLED ->
        "无扰式采集未启用" to "只有你主动启用后服务才会等待解锁；服务未运行时相机关闭。"
      PassiveCaptureState.STARTING ->
        "无扰式采集正在启动" to "正在准备无预览相机分析会话；正式测量目标 $targetDuration。"
      PassiveCaptureState.WAITING ->
        "无扰式采集已启用，等待解锁" to "等待新的设备解锁机会；等待期间相机关闭。正式测量目标 $targetDuration。"
      PassiveCaptureState.OBSERVING ->
        "无扰式采集正在观察人脸" to "正在限时观察画面；此阶段尚未开始正式测量，目标 $targetDuration。"
      PassiveCaptureState.MEASURING ->
        "无扰式心率估计进行中" to "正式测量计时已开始；目标 $targetDuration 到达后自动收尾。"
      PassiveCaptureState.STOPPING ->
        "无扰式采集正在收尾" to "正在结束当前会话并释放相机；测量不会延长。"
      PassiveCaptureState.FAILED ->
        "无扰式采集失败" to "服务遇到运行错误；请打开应用查看失败原因。"
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
