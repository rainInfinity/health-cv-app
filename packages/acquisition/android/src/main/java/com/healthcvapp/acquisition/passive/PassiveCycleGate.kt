/** 按原生单调时钟决定解锁事件是否满足录像周期。 */

package com.healthcvapp.acquisition.passive

/** 解锁事件在当前运行期的周期判断结果。 */
internal enum class PassiveCycleDecision {
  /** 本次解锁可以开始一次新录像。 */
  START,
  /** 距离上次实际录像开始尚未达到周期。 */
  TOO_EARLY,
  /** 正在打开、录像或收尾，当前事件不可积压。 */
  BUSY,
}

/** 周期只在 VideoRecordEvent.Start 时更新，不记录未开始的失败尝试。 */
internal class PassiveCycleGate(intervalMillis: Long) {
  private val intervalMillis = intervalMillis.also {
    require(it > 0L) { "采集周期必须为正数。" }
  }
  /** 当前启用运行期最近一次实际录像开始的单调时间。 */
  private var lastStartedAtElapsedMillis: Long? = null

  /** 判断本次候选事件，不修改周期起点或排队保存机会。 */
  fun decide(nowElapsedMillis: Long, busy: Boolean): PassiveCycleDecision {
    if (busy) return PassiveCycleDecision.BUSY
    val lastStarted = lastStartedAtElapsedMillis ?: return PassiveCycleDecision.START
    if (nowElapsedMillis < lastStarted) return PassiveCycleDecision.TOO_EARLY
    return if (nowElapsedMillis - lastStarted >= intervalMillis) {
      PassiveCycleDecision.START
    } else {
      PassiveCycleDecision.TOO_EARLY
    }
  }

  /** 仅由实际录像开始回调建立本轮周期起点。 */
  fun recordStarted(startedAtElapsedMillis: Long) {
    val previousStart = lastStartedAtElapsedMillis
    require(previousStart == null || startedAtElapsedMillis >= previousStart) {
      "单调录像开始时间不能倒退。"
    }
    lastStartedAtElapsedMillis = startedAtElapsedMillis
  }
}
