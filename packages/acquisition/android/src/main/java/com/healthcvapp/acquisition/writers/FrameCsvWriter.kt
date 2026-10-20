/** 只负责逐帧相机元数据 CSV 编码、批量写入与文件句柄关闭。 */

package com.healthcvapp.acquisition.writers

import com.healthcvapp.acquisition.camera.CaptureRecord
import java.io.BufferedWriter
import java.io.Closeable
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.OutputStreamWriter

/** 供同一个有序数据消费者顺序调用的 frame.csv 写入器。 */
interface FrameBatchWriter : Closeable {
  /** 按输入顺序追加已配对的相机结果，不保存批次引用。 */
  suspend fun writeBatch(records: List<CaptureRecord>)
}

/** 创建单会话 UTF-8 八列文件，不管理队列、定时器或消费者。 */
fun interface FrameBatchWriterFactory {
  /** 在给定的会话临时路径创建并写入 CSV 表头。 */
  fun open(file: File): FrameBatchWriter
}

/** 将已配对的 Camera2 数值写入临时文件，由 CaptureSession 负责完成路径提升。 */
class FrameCsvWriter(file: File) : FrameBatchWriter {
  private var output: BufferedWriter? = null

  init {
    val parent = file.parentFile
    if (parent != null && !parent.isDirectory && !parent.mkdirs()) {
      throw IOException("无法创建采集目录：${parent.absolutePath}")
    }
    if (file.exists()) throw IOException("采集临时文件已存在：${file.absolutePath}")
    val opened = BufferedWriter(OutputStreamWriter(FileOutputStream(file, false), Charsets.UTF_8))
    try {
      opened.write(HEADER)
      opened.newLine()
      output = opened
    } catch (error: Throwable) {
      try {
        opened.close()
      } catch (_: Throwable) {
        // 表头写入错误优先于关闭错误。
      }
      throw error
    }
  }

  /** 写出旧版毫秒时间列与相机结果原始单位，保留逐帧顺序。 */
  override suspend fun writeBatch(records: List<CaptureRecord>) {
    val writer = output ?: throw IOException("frame.csv 写入器已关闭")
    for (record in records) {
      val metadata = record.metadata
      val timestampFrameNanos = metadata.timestampFrameNanos
        ?: throw IOException("已配对的相机结果缺少传感器时间戳")
      val row = StringBuilder(128)
        .append(metadata.timestampElapsedNanos / NANOS_PER_MILLISECOND).append(',')
        .append(timestampFrameNanos / NANOS_PER_MILLISECOND).append(',')
        .append(metadata.timestampSystemNanos / NANOS_PER_MILLISECOND).append(',')
        .append(metadata.exposureTimeNanos).append(',')
        .append(metadata.durationTimeNanos).append(',')
        .append(metadata.rollingShutterSkewTimeNanos).append(',')
        .append(metadata.iso).append(',')
        .append(metadata.whiteBalanceMode)
      writer.write(row.toString())
      writer.newLine()
    }
  }

  /** 关闭并刷新文件；重复调用不会重复关闭底层句柄。 */
  override fun close() {
    val writer = output ?: return
    output = null
    writer.close()
  }

  private companion object {
    const val NANOS_PER_MILLISECOND = 1_000_000.0
    const val HEADER = "timestamp,timestampFrame,timestampSystem,exposureTime,durationTime,rollingShutterSkewTime,iso,whiteBalanceMode"
  }
}
