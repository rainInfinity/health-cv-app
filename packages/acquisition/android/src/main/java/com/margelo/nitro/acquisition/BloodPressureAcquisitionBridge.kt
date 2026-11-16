/** 将血压低频订阅和结构化结果与设备控制及算法隔离。 */
package com.margelo.nitro.acquisition

import android.os.Handler
import android.os.Looper
import com.healthcvapp.acquisition.ppg.bloodpressure.BloodPressureController
import com.healthcvapp.acquisition.ppg.model.PPGArtifact
import com.healthcvapp.acquisition.ppg.session.PPGCaptureFailure
import com.margelo.nitro.core.NullType
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

/** 构造、查询及订阅不打开相机、不注册 IMU，也不创建正式文件。 */
internal class BloodPressureAcquisitionBridge(
  private val ownerId: String,
  private val bloodPressure: BloodPressureController,
  private val artifactMapper: (PPGArtifact) -> AcquisitionArtifact,
) {
  private val handler = Handler(Looper.getMainLooper())
  private val listenerTokens = ConcurrentHashMap<Long, AtomicBoolean>()

  /** 只建立本所有者观测轮次，正式开窗由原生联合准入控制。 */
  suspend fun start(durationMillis: Double): BloodPressureStartResult {
    if (!durationMillis.isFinite() || durationMillis % 1.0 != 0.0 || durationMillis !in 1.0..86_400_000.0) {
      return BloodPressureStartResult(
        nullable(null), nullable("BLOOD_PRESSURE_CONFIG_INVALID"), nullable("血压时长必须为 1 至 86400000 的整数毫秒。"),
      )
    }
    return try {
      BloodPressureStartResult(nullable(bloodPressure.start(ownerId, durationMillis.toLong())), nullable(null), nullable(null))
    } catch (error: PPGCaptureFailure) {
      // 保留控制器根因；取消及未识别异常仍由 Promise 原样拒绝。
      BloodPressureStartResult(nullable(null), nullable(error.code), nullable(error.message))
    }
  }

  /** 无本所有者轮次时返回显式空值，不查询历史产物拼装结果。 */
  fun snapshot(): Variant_NullType_BloodPressureSnapshot = bloodPressure.snapshot(ownerId)?.let {
    Variant_NullType_BloodPressureSnapshot.create(it.toNitro(artifactMapper))
  } ?: Variant_NullType_BloodPressureSnapshot.create(NullType.NULL)

  /** 同步阻断指定轮次的未发开窗及正式入口，不误停后来轮次。 */
  fun requestStop(captureId: String) = bloodPressure.requestEnd(ownerId, captureId)

  /** 等待本轮两源文件、回调和相机／IMU 释放屏障，保留分源真实错误。 */
  suspend fun stop(captureId: String): AcquisitionCommandResult {
    val result = bloodPressure.stop(ownerId, captureId)
    val failure = result?.fileFailure ?: result?.resourceFailure
    return AcquisitionCommandResult(nullable(failure?.code), nullable(failure?.message))
  }

  /** 原生已合并的低频事实在主线程派发；令牌使取消前排队的通知失效。 */
  fun addListener(listener: (Variant_NullType_BloodPressureSnapshot?) -> Unit): Double {
    val token = AtomicBoolean(true)
    val id = bloodPressure.addListener(ownerId) { snapshot ->
      handler.post {
        if (token.get()) {
          val value = snapshot?.let { Variant_NullType_BloodPressureSnapshot.create(it.toNitro(artifactMapper)) }
            ?: Variant_NullType_BloodPressureSnapshot.create(NullType.NULL)
          runCatching { listener(value) }
        }
      }
    }
    listenerTokens[id] = token
    return id.toDouble()
  }

  /** 只解除本实例持有的订阅，不停止设备或触及其他所有者的监听。 */
  fun removeListener(id: Double) {
    if (!id.isFinite() || id % 1.0 != 0.0 || id < 1.0 || id >= Long.MAX_VALUE.toDouble()) return
    val listenerId = id.toLong()
    val token = listenerTokens.remove(listenerId) ?: return
    token.set(false)
    bloodPressure.removeListener(listenerId)
  }

  private fun nullable(value: String?): Variant_NullType_String = value?.let { Variant_NullType_String.create(it) }
    ?: Variant_NullType_String.create(NullType.NULL)
}
