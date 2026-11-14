/** 串行暴露主动 RPPG 会话命令并管理其协程生命周期。 */

package com.healthcvapp.acquisition.rppg.runtime

import com.healthcvapp.acquisition.rppg.model.RPPGTerminationReason
import com.healthcvapp.acquisition.rppg.session.RPPGSession
import com.healthcvapp.acquisition.rppg.session.RPPGSessionOperationResult
import com.healthcvapp.acquisition.rppg.session.RPPGSessionPhase
import com.healthcvapp.acquisition.rppg.session.RPPGSessionSnapshot
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.util.concurrent.atomic.AtomicReference

/** 创建独占本 runtime 的会话，并把低频状态交回调用方。 */
internal fun interface RPPGActiveSessionFactory {
  /** 创建惰性会话；模型和正式文件仍只在 start 与首帧阶段建立。 */
  fun create(scope: CoroutineScope, onSnapshot: (RPPGSessionSnapshot) -> Unit): RPPGSession
}

/** 只允许一个主动会话拥有相机、测量命令与最终产物。 */
internal class RPPGActiveRuntime(
  private val sessionFactory: RPPGActiveSessionFactory,
  parentScope: CoroutineScope = CoroutineScope(Dispatchers.Default),
  private val onSnapshot: (RPPGSessionSnapshot) -> Unit = {},
) {
  private val commandMutex = Mutex()
  private val ownerJob = SupervisorJob(parentScope.coroutineContext[Job])
  private val sessionScope = CoroutineScope(parentScope.coroutineContext + ownerJob)
  private val latestSnapshot = AtomicReference(RPPGSessionSnapshot())
  private val realtimeLock = Any()
  private val realtimeSubscribers = LinkedHashSet<RealtimeSubscriber>()
  @Volatile private var session: RPPGSession? = createSession()
  @Volatile private var closed = false

  /** 当前会话快照；runtime 尚未打开预览时返回关闭态。 */
  val snapshot: RPPGSessionSnapshot
    get() = session?.snapshot ?: latestSnapshot.get()

  /** 创建会话并显式打开预览；重复打开会按会话状态拒绝。 */
  suspend fun openPreview(): RPPGSessionOperationResult = commandMutex.withLock {
    if (closed) return@withLock rejected("RUNTIME_CLOSED", "主动 RPPG runtime 已关闭。")
    val current = session
    if (current != null && current.resourcesReleased && current.snapshot.phase in REPLACEABLE_TERMINAL_PHASES) {
      session = createSession()
    }
    val activeSession = checkNotNull(session)
    val result = activeSession.openPreview()
    if (result.accepted) {
      synchronized(realtimeLock) {
        if (session === activeSession) {
          realtimeSubscribers.forEach { it.attach(activeSession) }
        }
      }
    }
    result
  }

  /** 从预览显式开始新代次观察；无会话或重复开始均返回稳定状态错误。 */
  suspend fun start(): RPPGSessionOperationResult = commandMutex.withLock {
    if (closed) return@withLock rejected("RUNTIME_CLOSED", "主动 RPPG runtime 已关闭。")
    session?.start() ?: rejected("INVALID_STATE", "必须先打开主动 RPPG 预览。")
  }

  /** 以指定原因停止当前代次并等待相机借用帧和文件队列排空。 */
  suspend fun stop(
    reason: RPPGTerminationReason = RPPGTerminationReason.USER_STOP,
  ): RPPGSessionOperationResult = commandMutex.withLock {
    if (closed) return@withLock rejected("RUNTIME_CLOSED", "主动 RPPG runtime 已关闭。")
    session?.stop(reason) ?: RPPGSessionOperationResult(true, snapshot)
  }

  /** 宿主暂停经同一命令屏障收尾，不依赖页面 JS 继续运行。 */
  fun onHostPause(): Job? {
    if (closed) return null
    return sessionScope.launch { stop(RPPGTerminationReason.APP_BACKGROUND) }
  }

  /** 宿主销毁同样等待关闭屏障，不能仅取消协程而遗留相机或文件。 */
  fun onHostDestroy(): Job? {
    if (closed) return null
    return sessionScope.launch { close() }
  }

  /** 将实时订阅绑定到当前会话，并在终态会话替换时保留订阅。 */
  fun subscribeRealtime(
    consumer: suspend (com.healthcvapp.acquisition.rppg.realtime.RPPGRealtimeBatch) -> Unit,
  ): AutoCloseable {
    val subscriber = RealtimeSubscriber(consumer)
    synchronized(realtimeLock) {
      check(!closed) { "主动 RPPG runtime 已关闭。" }
      realtimeSubscribers.add(subscriber)
      session?.let(subscriber::attach)
    }
    return AutoCloseable {
      synchronized(realtimeLock) {
        if (realtimeSubscribers.remove(subscriber)) subscriber.close()
      }
    }
  }
  /** 离开页面时执行 PAGE_LEFT 收尾；若相机仍未安全关闭则保留 runtime 供重试。 */
  suspend fun close(): RPPGSessionOperationResult = withContext(NonCancellable) {
    commandMutex.withLock {
      if (closed) return@withLock RPPGSessionOperationResult(true, snapshot)
      val current = session
      val result = current?.close()
        ?: RPPGSessionOperationResult(true, snapshot)
      if (current == null || current.resourcesReleased) {
        synchronized(realtimeLock) {
          closed = true
          realtimeSubscribers.forEach(RealtimeSubscriber::close)
          realtimeSubscribers.clear()
        }
        ownerJob.cancel()
      }
      result
    }
  }
  /** 把同一页面订阅从已终止会话迁移到新会话。 */
  private class RealtimeSubscriber(
    private val consumer: suspend (com.healthcvapp.acquisition.rppg.realtime.RPPGRealtimeBatch) -> Unit,
  ) : AutoCloseable {
    private var delegate: AutoCloseable? = null

    /** 只保留一个底层会话订阅，避免终态会话残留队列。 */
    fun attach(session: RPPGSession) {
      delegate?.close()
      delegate = session.subscribeRealtime(consumer)
    }

    /** 解除当前会话订阅。 */
    override fun close() {
      delegate?.close()
      delegate = null
    }
  }

  /** 为首次操作或终态后的新测量创建新的独占会话。 */
  private fun createSession(): RPPGSession = sessionFactory.create(sessionScope, ::publishSnapshot).also {
    latestSnapshot.set(it.snapshot)
  }

  /** 缓存低频状态并隔离外部观察者异常。 */
  private fun publishSnapshot(state: RPPGSessionSnapshot) {
    latestSnapshot.set(state)
    try {
      onSnapshot(state)
    } catch (_: Throwable) {
      // 外部状态观察者不能破坏 runtime 的资源所有权。
    }
  }


  /** 将未创建会话的操作失败转换为与会话命令一致的结果结构。 */
  private fun rejected(code: String, message: String): RPPGSessionOperationResult {
    val failure = com.healthcvapp.acquisition.rppg.session.RPPGSessionFailure(code, message)
    return RPPGSessionOperationResult(false, snapshot, failure)
  }

  private companion object {
    val REPLACEABLE_TERMINAL_PHASES = setOf(
      RPPGSessionPhase.COMPLETED,
      RPPGSessionPhase.FAILED,
    )
  }
}
