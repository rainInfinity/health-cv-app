/** 同类 Nitro 实例的授权与关闭意图，不替代跨采集方式的硬件租约。 */
package com.healthcvapp.acquisition.ppg.runtime

/** 所有访问由自身短锁保护；关闭可在等待命令互斥前取消尚未取得相机的打开请求。 */
internal class PPGCommandOwnership {
  private val lock = Any()
  private val versions = HashMap<String, Long>()
  private val closing = HashSet<String>()
  private var owner: String? = null

  /** 明确的新打开请求取得版本；旧关闭不会被旧异步请求撤销。 */
  fun beginOpen(id: String): Long = synchronized(lock) {
    closing.remove(id)
    val version = (versions[id] ?: 0) + 1
    versions[id] = version
    version
  }

  /** 同步取消已发但尚未获得资源的打开版本。 */
  fun requestClose(id: String) = synchronized(lock) {
    closing.add(id)
    versions[id] = (versions[id] ?: 0) + 1
  }

  /** 版本有效、没有关闭意图且无人占用时才允许打开。 */
  fun mayOpen(id: String, version: Long): Boolean = synchronized(lock) {
    id !in closing && versions[id] == version && owner == null
  }

  /** 取得本类控制权限；外部调用方不能覆盖当前 owner。 */
  fun acquire(id: String, version: Long): Boolean = synchronized(lock) {
    if (!mayOpen(id, version)) false else { owner = id; true }
  }

  /** 检查命令是否属于当前相机持有者。 */
  fun owns(id: String): Boolean = synchronized(lock) { owner == id }
  /** 返回当前持有者供真实宿主生命周期收尾使用。 */
  fun current(): String? = synchronized(lock) { owner }
  /** 查询该调用方已经登记的关闭意图。 */
  fun isClosing(id: String): Boolean = synchronized(lock) { id in closing }
  /** 只释放指定持有者，失败关闭或外部关闭不能清空别人的权限。 */
  fun release(id: String) = synchronized(lock) { if (owner == id) owner = null }
}
