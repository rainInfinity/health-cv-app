/** 将候选预览与实际相机周期绑定的宿主分开，忙页面卸载不能停止占用者。 */
package com.healthcvapp.acquisition.ppg.runtime

import java.lang.ref.WeakReference

internal class PPGPreviewRegistry<T : Any> {
  private val lock = Any()
  private val candidates = ArrayList<WeakReference<T>>()
  private var bound: WeakReference<T>? = null

  /** 挂载仅登记候选，不替换已绑定相机 Surface 的身份。 */
  fun attach(view: T) = synchronized(lock) {
    candidates.removeAll { it.get() == null || it.get() === view }
    candidates.add(WeakReference(view))
    Unit
  }

  /** 取最新仍存活的候选，打开前还需重新确认未卸载。 */
  fun candidate(): T? = synchronized(lock) { candidates.asReversed().firstNotNullOfOrNull { it.get() } }

  /** 仅实际打开成功取得所有权的路径绑定宿主。 */
  fun bind(view: T): Boolean = synchronized(lock) {
    if (candidates.none { it.get() === view }) false else { bound = WeakReference(view); true }
  }

  /** 返回是否卸载本相机周期实际使用的宿主，而不是任意最新候选。 */
  fun detach(view: T): Boolean = synchronized(lock) {
    candidates.removeAll { it.get() == null || it.get() === view }
    val wasBound = bound?.get() === view
    if (wasBound) bound = null
    wasBound
  }

  /** 相机释放完成才清理绑定；候选仍可用于明确的新一轮打开。 */
  fun releaseBound() = synchronized(lock) { bound = null }
}
