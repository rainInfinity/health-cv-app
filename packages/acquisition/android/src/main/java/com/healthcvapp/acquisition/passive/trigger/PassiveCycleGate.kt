/** 按原生单调时钟决定解锁机会是否满足被动测量周期。 */

package com.healthcvapp.acquisition.passive.trigger

/** 解锁事件在当前运行期的周期判断结果。 */
internal enum class PassiveCycleDecision {
  /** 本次解锁可以开始一个测量会话。 */
  START,
  /** 距离上次真实首帧尚未达到周期。 */
  TOO_EARLY,
  /** 正在打开、测量或收尾，当前事件不可积压。 */
  BUSY,
}

/** 周期只由 RPPG 会话收到的第一帧更新，不记录无帧失败的尝试。 */
internal class PassiveCycleGate(intervalNanos: Long) {
  private val intervalNanos = intervalNanos.also {
    require(it > 0L) { "采集周期必须为正数。" }
  }
  /** 当前启用运行期最近一次实际首帧的单调时间，单位纳秒。 */
  private var lastFirstFrameAtElapsedNanos: Long? = null

  /** 判断本次解锁候选，不修改周期起点或排队保存机会。 */
  @Synchronized
  fun decide(nowElapsedNanos: Long, busy: Boolean): PassiveCycleDecision {
    if (busy) return PassiveCycleDecision.BUSY
    val lastFirstFrame = lastFirstFrameAtElapsedNanos ?: return PassiveCycleDecision.START
    if (nowElapsedNanos < lastFirstFrame) return PassiveCycleDecision.TOO_EARLY
    return if (nowElapsedNanos - lastFirstFrame >= intervalNanos) {
      PassiveCycleDecision.START
    } else {
      PassiveCycleDecision.TOO_EARLY
    }
  }

  /** 由 RPPG 会话第一帧回调建立周期起点，无人脸也照常计入周期。 */
  @Synchronized
  fun recordFirstFrameAt(elapsedRealtimeNanos: Long) {
    val previousStart = lastFirstFrameAtElapsedNanos
    require(previousStart == null || elapsedRealtimeNanos >= previousStart) {
      "单调首帧时间不能倒退。"
    }
    lastFirstFrameAtElapsedNanos = elapsedRealtimeNanos
  }
}
