/** 指尖 Nitro 订阅和结构化结果适配，与设备控制及算法分离。 */
package com.margelo.nitro.acquisition

import android.os.Handler
import android.os.Looper
import com.healthcvapp.acquisition.ppg.fingertip.FingertipController
import com.healthcvapp.acquisition.ppg.model.PPGArtifact
import com.margelo.nitro.core.NullType
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

/** 每个 Hybrid 实例拥有独立身份和通知取消令牌，底层仍共享 PPG 控制器。 */
internal class FingertipAcquisitionBridge(
  private val ownerId: String,
  private val fingertip: FingertipController,
  private val artifactMapper: (PPGArtifact) -> AcquisitionArtifact,
) {
  private val handler = Handler(Looper.getMainLooper())
  private val listenerTokens = ConcurrentHashMap<Long, AtomicBoolean>()

  /** 启动确认只建立覆盖观测，不等待正式三十秒采集。 */
  suspend fun start(durationMillis: Double): FingertipStartResult {
    if (!durationMillis.isFinite() || durationMillis % 1.0 != 0.0) {
      return FingertipStartResult(nullable(null), nullable("FINGERTIP_CONFIG_INVALID"), nullable("指尖时长必须为整数毫秒。"))
    }
    return try {
      FingertipStartResult(nullable(fingertip.start(ownerId, durationMillis.toLong())), nullable(null), nullable(null))
    } catch (error: Throwable) {
      FingertipStartResult(nullable(null), nullable("FINGERTIP_START_FAILED"), nullable(error.message ?: "指尖观测无法启动。"))
    }
  }

  /** 无设备副作用地读取本实例快照。 */
  fun snapshot(): Variant_NullType_FingertipSnapshot = fingertip.snapshot(ownerId)?.let {
    Variant_NullType_FingertipSnapshot.create(it.toNitro(artifactMapper))
  } ?: Variant_NullType_FingertipSnapshot.create(NullType.NULL)

  /** 同步封闭指定轮次的正式入口，不误停新轮。 */
  fun requestStop(captureId: String) = fingertip.requestEnd(ownerId, captureId)

  /** 等待指定轮次的原始数据、文件与相机完整屏障。 */
  suspend fun stop(captureId: String): AcquisitionCommandResult {
    val result = fingertip.stop(ownerId, captureId)
    val failure = result?.fileFailure ?: result?.resourceFailure
    return AcquisitionCommandResult(nullable(failure?.code), nullable(failure?.message))
  }

  /** 快照在主线程派发；解除后已排队的通知也会失效。 */
  fun addListener(listener: (Variant_NullType_FingertipSnapshot?) -> Unit): Double {
    val token = AtomicBoolean(true)
    val id = fingertip.addListener(ownerId) { snapshot ->
      val value = snapshot?.let { Variant_NullType_FingertipSnapshot.create(it.toNitro(artifactMapper)) }
        ?: Variant_NullType_FingertipSnapshot.create(NullType.NULL)
      handler.post { if (token.get()) runCatching { listener(value) } }
    }
    listenerTokens[id] = token
    return id.toDouble()
  }

  /** 只移除当前实例持有的低频订阅。 */
  fun removeListener(id: Double) {
    listenerTokens.remove(id.toLong())?.set(false)
    fingertip.removeListener(id.toLong())
  }

  /** 每订阅独立四批队列，不将旧轮迟到批次交给当前轮。 */
  fun addPulseListener(listener: (FingertipPulseBatch) -> Unit): Double = fingertip.pulseHub.addListener { batch ->
    if (fingertip.snapshot(ownerId)?.captureId == batch.captureId) listener(batch.toNitro())
  }.toDouble()

  /** 解除标量订阅不影响原生采集、截止或原始文件。 */
  fun removePulseListener(id: Double) = fingertip.pulseHub.removeListener(id.toLong())

  /** 可空字符串保留显式空分支。 */
  private fun nullable(value: String?): Variant_NullType_String = value?.let { Variant_NullType_String.create(it) }
    ?: Variant_NullType_String.create(NullType.NULL)
}
