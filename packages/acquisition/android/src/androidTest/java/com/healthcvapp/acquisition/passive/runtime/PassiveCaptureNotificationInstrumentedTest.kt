/** 验证持续通知准确区分被动采集阶段并显示正式测量目标。 */
package com.healthcvapp.acquisition.passive.runtime

import android.app.Notification
import androidx.test.platform.app.InstrumentationRegistry
import com.healthcvapp.acquisition.passive.service.PassiveCaptureNotifications
import com.margelo.nitro.acquisition.PassiveCaptureState
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PassiveCaptureNotificationInstrumentedTest {
  private val context
    get() = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext

  @Test
  fun waitingAndObservationExplainCameraAndMeasurementBoundary() {
    val waiting = notificationContent(PassiveCaptureState.WAITING)
    assertTrue(waiting.second.contains("等待新的设备解锁机会"))
    assertTrue(waiting.second.contains("相机关闭"))
    assertTrue(waiting.second.contains("30 秒"))

    val observing = notificationContent(PassiveCaptureState.OBSERVING)
    assertTrue(observing.first.contains("观察人脸"))
    assertTrue(observing.second.contains("尚未开始正式测量"))
    assertTrue(observing.second.contains("30 秒"))
  }

  @Test
  fun measurementNotificationShowsConfiguredFormalDuration() {
    val notification = buildNotification(PassiveCaptureState.MEASURING, 30.0)

    assertTrue(notification.first.contains("心率估计进行中"))
    assertTrue(notification.second.contains("正式测量计时已开始"))
    assertTrue(notification.second.contains("30 秒"))
    assertFalse(notification.second.contains("录像"))
  }

  @Test
  fun disabledStoppingAndFailureHaveDistinctMessages() {
    val disabled = notificationContent(PassiveCaptureState.DISABLED)
    assertTrue(disabled.first.contains("未启用"))

    val stopping = notificationContent(PassiveCaptureState.STOPPING)
    assertTrue(stopping.first.contains("正在收尾"))
    assertTrue(stopping.second.contains("释放相机"))

    val failed = notificationContent(PassiveCaptureState.FAILED)
    assertTrue(failed.first.contains("失败"))
    assertTrue(failed.second.contains("服务遇到运行错误"))
    assertFalse(failed.first.contains("正在收尾"))
  }

  private fun notificationContent(state: PassiveCaptureState): Pair<String, String> =
    buildNotification(state, 30.0)

  private fun buildNotification(state: PassiveCaptureState, durationSeconds: Double): Pair<String, String> {
    val notification = PassiveCaptureNotifications.build(context, state, durationSeconds)
    return notification.title() to notification.text()
  }

  private fun Notification.title(): String =
    checkNotNull(extras.getCharSequence(Notification.EXTRA_TITLE)).toString()

  private fun Notification.text(): String =
    checkNotNull(extras.getCharSequence(Notification.EXTRA_TEXT)).toString()
}
