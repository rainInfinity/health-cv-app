/** 按传感器时间戳精确配对记录，并按采集帧序释放结果。 */

package com.healthcvapp.acquisition.camera

import com.healthcvapp.acquisition.processing.PpgRecord
import java.util.LinkedHashSet
import java.util.TreeMap

/** 表示已精确配对的一帧 PPG 记录和 Camera2 拍摄结果。 */
data class CaptureRecord(
  /** 当前图像产生的旧版 PPG CSV 数值。 */
  val ppg: PpgRecord,
  /** 与图像传感器时间戳相同的 Camera2 结果数值。 */
  val metadata: CameraFrameMetadata,
)

/** 描述无法安全配对时要终止会话的稳定错误。 */
internal data class FrameCorrelationFailure(
  /** 供原生会话和调用方识别的错误码。 */
  val code: String,
  /** 不暴露逐帧数据的可展示错误说明。 */
  val message: String,
)

/** 返回本次关联中新完成的记录或需失败收尾的正式帧序号。 */
internal data class FrameCorrelationUpdate(
  /** 可按帧序交给有界队列的完整记录。 */
  val records: List<CaptureRecord>,
  /** 关联失败时仍占用会话在途计数的帧序号。 */
  val failedFrameIndexes: LongArray,
  /** 本次关联的终态错误；成功或等待配对时为空。 */
  val failure: FrameCorrelationFailure?,
)

/** 有界缓存两侧数值，只按相同传感器时间戳配对，不持有 ImageProxy。 */
internal class FrameMetadataCorrelator(private val capacity: Int) {
  private class PendingFrame {
    /** 同一传感器时间戳对应的单帧 PPG 记录。 */
    var ppg: PpgRecord? = null
    /** 同一传感器时间戳对应的 Camera2 完成结果。 */
    var metadata: CameraFrameMetadata? = null
  }

  private val pendingByTimestamp = HashMap<Long, PendingFrame>(capacity)
  private val readyByFrameIndex = TreeMap<Long, CaptureRecord>()
  private val pendingFrameTimestamps = HashMap<Long, Long>(capacity)
  private val recentlyCompletedTimestamps = LinkedHashSet<Long>()
  private var nextFrameIndex = 0L
  private var closed = false
  private var terminalFailure: FrameCorrelationFailure? = null

  init {
    require(capacity > 0) { "capacity must be positive" }
  }

  /** 保存不依赖原生帧存活期的 PPG 数值并尝试精确配对。 */
  @Synchronized
  fun offerPpg(record: PpgRecord, sensorTimestampNanos: Long): FrameCorrelationUpdate {
    if (closed) {
      return fail(
        terminalFailure ?: FrameCorrelationFailure("FRAME_METADATA_CLOSED", "相机元数据关联已关闭。"),
        record.frameIndex,
      )
    }
    if (record.frameIndex < nextFrameIndex || pendingFrameTimestamps.containsKey(record.frameIndex)) {
      return fail(
        FrameCorrelationFailure("FRAME_METADATA_DUPLICATE_FRAME", "相机帧序号重复，无法安全配对。"),
        record.frameIndex,
      )
    }
    if (recentlyCompletedTimestamps.contains(sensorTimestampNanos)) {
      return fail(
        FrameCorrelationFailure("FRAME_METADATA_DUPLICATE_TIMESTAMP", "相机传感器时间戳重复，无法安全配对。"),
        record.frameIndex,
      )
    }

    val pending = pendingByTimestamp[sensorTimestampNanos] ?: PendingFrame().also {
      pendingByTimestamp[sensorTimestampNanos] = it
    }
    if (pending.ppg != null) {
      return fail(
        FrameCorrelationFailure("FRAME_METADATA_DUPLICATE_IMAGE", "同一传感器时间戳收到多张正式图像。"),
        record.frameIndex,
      )
    }
    pending.ppg = record
    pendingFrameTimestamps[record.frameIndex] = sensorTimestampNanos
    pairIfReady(sensorTimestampNanos, pending)
    return collectReadyOrOverflow()
  }

  /** 保存 Camera2 实际结果；缺少传感器时间戳时显式终止关联。 */
  @Synchronized
  fun offerMetadata(metadata: CameraFrameMetadata): FrameCorrelationUpdate {
    if (closed) {
      return FrameCorrelationUpdate(emptyList(), EMPTY_FRAME_INDEXES, terminalFailure)
    }
    val sensorTimestampNanos = metadata.timestampFrameNanos
      ?: return fail(
        FrameCorrelationFailure("FRAME_METADATA_TIMESTAMP_MISSING", "Camera2 拍摄结果缺少传感器时间戳。"),
      )
    if (recentlyCompletedTimestamps.contains(sensorTimestampNanos)) {
      return fail(
        FrameCorrelationFailure("FRAME_METADATA_DUPLICATE_TIMESTAMP", "Camera2 重复提供已完成帧的传感器时间戳。"),
      )
    }

    val pending = pendingByTimestamp[sensorTimestampNanos] ?: PendingFrame().also {
      pendingByTimestamp[sensorTimestampNanos] = it
    }
    if (pending.metadata != null) {
      return fail(
        FrameCorrelationFailure("FRAME_METADATA_DUPLICATE_RESULT", "同一传感器时间戳收到多份拍摄结果。"),
      )
    }
    pending.metadata = metadata
    pairIfReady(sensorTimestampNanos, pending)
    return collectReadyOrOverflow()
  }

  /** 停止时丢弃无对应图像的结果；未配对正式图像必须显式失败。 */
  @Synchronized
  fun finish(): FrameCorrelationUpdate {
    if (closed) {
      return FrameCorrelationUpdate(emptyList(), EMPTY_FRAME_INDEXES, terminalFailure)
    }
    if (pendingFrameTimestamps.isNotEmpty()) {
      return fail(
        FrameCorrelationFailure("FRAME_METADATA_UNMATCHED", "正式采集帧缺少精确匹配的 Camera2 拍摄结果。"),
      )
    }
    pendingByTimestamp.clear()
    closed = true
    return FrameCorrelationUpdate(emptyList(), EMPTY_FRAME_INDEXES, null)
  }

  /** 设备或写入错误终止会话时回收所有未完成的正式帧关联。 */
  @Synchronized
  fun abort(failure: FrameCorrelationFailure): FrameCorrelationUpdate = fail(failure)

  private fun pairIfReady(sensorTimestampNanos: Long, pending: PendingFrame) {
    val ppg = pending.ppg ?: return
    val metadata = pending.metadata ?: return
    pendingByTimestamp.remove(sensorTimestampNanos)
    readyByFrameIndex[ppg.frameIndex] = CaptureRecord(ppg, metadata)
  }

  private fun collectReadyOrOverflow(): FrameCorrelationUpdate {
    val completed = ArrayList<CaptureRecord>()
    while (true) {
      val record = readyByFrameIndex.remove(nextFrameIndex) ?: break
      completed += record
      pendingFrameTimestamps.remove(nextFrameIndex)
      rememberCompletedTimestamp(checkNotNull(record.metadata.timestampFrameNanos))
      nextFrameIndex += 1
    }

    if (pendingByTimestamp.size + readyByFrameIndex.size > capacity) {
      val outstandingFrameIndexes = LongArray(completed.size) { completed[it].ppg.frameIndex }
      return fail(
        FrameCorrelationFailure("FRAME_METADATA_CAPACITY_EXCEEDED", "相机逐帧元数据关联缓存已满。"),
        additionalFrameIndexes = outstandingFrameIndexes,
      )
    }
    return if (completed.isEmpty()) {
      FrameCorrelationUpdate(emptyList(), EMPTY_FRAME_INDEXES, null)
    } else {
      FrameCorrelationUpdate(completed, EMPTY_FRAME_INDEXES, null)
    }
  }

  private fun rememberCompletedTimestamp(timestampNanos: Long) {
    recentlyCompletedTimestamps += timestampNanos
    if (recentlyCompletedTimestamps.size > capacity) {
      val iterator = recentlyCompletedTimestamps.iterator()
      iterator.next()
      iterator.remove()
    }
  }

  private fun fail(
    failure: FrameCorrelationFailure,
    additionalFrameIndex: Long? = null,
    additionalFrameIndexes: LongArray = EMPTY_FRAME_INDEXES,
  ): FrameCorrelationUpdate {
    val currentFailure = terminalFailure ?: failure
    terminalFailure = currentFailure
    closed = true
    val frameIndexes = pendingFrameTimestamps.keys.toMutableSet()
    readyByFrameIndex.keys.forEach(frameIndexes::add)
    if (additionalFrameIndex != null) frameIndexes += additionalFrameIndex
    additionalFrameIndexes.forEach(frameIndexes::add)
    pendingByTimestamp.clear()
    pendingFrameTimestamps.clear()
    readyByFrameIndex.clear()
    recentlyCompletedTimestamps.clear()
    return FrameCorrelationUpdate(
      records = emptyList(),
      failedFrameIndexes = frameIndexes.sorted().toLongArray(),
      failure = currentFailure,
    )
  }

  private companion object {
    val EMPTY_FRAME_INDEXES = LongArray(0)
  }
}
