/** 将定稿 RPPG 记录送入有界 DataHub 并共享终态失败。 */

package com.healthcvapp.acquisition.rppg.session

import com.healthcvapp.acquisition.pipeline.DataHub
import com.healthcvapp.acquisition.pipeline.DataHubOfferResult
import com.healthcvapp.acquisition.rppg.model.RPPGSessionRecord
import com.healthcvapp.acquisition.rppg.output.RPPGSessionOutput
import com.healthcvapp.acquisition.rppg.model.RPPGPulseSample
import com.healthcvapp.acquisition.rppg.realtime.RPPGRealtimeBatchHub
import java.io.IOException
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers

/** 保存会话记录队列发生的稳定技术错误码。 */
internal class RPPGRecordPipelineFailure(
  /** 供 runtime 与客户端判别的错误码。 */
  val code: String,
  message: String,
  cause: Throwable? = null,
) : IOException(message, cause)

/** 使用项目统一有界队列串行写入；正常关闭排空尾批，失败关闭不发布完整结果。 */
internal class RPPGSessionRecordDataHub(
  private val output: RPPGSessionOutput,
  capacity: Int = DEFAULT_CAPACITY,
  batchSize: Int = DEFAULT_BATCH_SIZE,
  intervalMillis: Long = DEFAULT_INTERVAL_MILLIS,
  consumerDispatcher: CoroutineDispatcher = Dispatchers.IO,
  private val realtimeBatchHub: RPPGRealtimeBatchHub? = null,
  private val onFailure: (RPPGRecordPipelineFailure) -> Unit = {},
) {
  private val firstFailure = AtomicReference<RPPGRecordPipelineFailure?>(null)
  private lateinit var dataHub: DataHub<RPPGSessionRecord>

  init {
    dataHub = DataHub(
      capacity = capacity,
      batchSize = batchSize,
      intervalMillis = intervalMillis,
      dispatcher = consumerDispatcher,
    ) { records -> consumeBatch(records) }
  }

  /** 将定稿记录非阻塞地提交到本会话队列。 */
  fun offer(record: RPPGSessionRecord): DataHubOfferResult {
    val result = dataHub.offer(record)
    when (result) {
      DataHubOfferResult.CAPACITY_EXCEEDED -> failAndStop(
        RPPGRecordPipelineFailure(
          code = "DATAHUB_CAPACITY_EXCEEDED",
          message = "RPPG 未消费结果达到有界容量。",
        ),
      )
      DataHubOfferResult.FAILED -> dataHub.failure?.let { failAndStop(asPipelineFailure(it)) }
      DataHubOfferResult.ACCEPTED, DataHubOfferResult.CLOSED -> Unit
    }
    if (result == DataHubOfferResult.ACCEPTED && record is RPPGPulseSample) {
      realtimeBatchHub?.offer(record)
    }
    return result
  }

  /** 外部处理失败时停止接收，并阻止完整会话元信息生成。 */
  fun fail(cause: Throwable) {
    failAndStop(asPipelineFailure(cause))
  }

  /** 关闭入口、排空已接受尾批并关闭实时展示通道。 */
  suspend fun closeAndDrain() {
    try {
      dataHub.closeAndDrain()
    } finally {
      realtimeBatchHub?.close()
    }
  }

  /** 返回首次技术错误；正常关闭时为空。 */
  val failure: Throwable?
    get() = firstFailure.get() ?: dataHub.failure

  /** 将一批记录交给单个输出消费者，失败时通知会话并保留根因。 */
  private suspend fun consumeBatch(records: List<RPPGSessionRecord>) {
    try {
      output.writeBatch(records)
    } catch (error: Throwable) {
      val failure = RPPGRecordPipelineFailure(
        code = "FILE_WRITE_FAILED",
        message = "RPPG 结果记录写入失败。",
        cause = error,
      )
      failAndStop(failure)
      throw failure
    }
  }

  /** 只记录并广播首个错误，避免观察者错误覆盖原始失败。 */
  private fun failAndStop(cause: RPPGRecordPipelineFailure) {
    if (!firstFailure.compareAndSet(null, cause)) return
    output.fail(cause)
    dataHub.fail(cause)
    try {
      onFailure(cause)
    } catch (_: Throwable) {
      // 错误观察者不能替换会话的首个技术失败。
    }
  }

  /** 为没有稳定流水线错误码的外部异常建立会话失败类型。 */
  private fun asPipelineFailure(cause: Throwable): RPPGRecordPipelineFailure =
    cause as? RPPGRecordPipelineFailure
      ?: RPPGRecordPipelineFailure(
        code = "SESSION_PROCESSING_FAILED",
        message = "RPPG 会话处理发生技术错误。",
        cause = cause,
      )

  private companion object {
    const val DEFAULT_CAPACITY = 256
    const val DEFAULT_BATCH_SIZE = 50
    const val DEFAULT_INTERVAL_MILLIS = 1_000L
  }
}
