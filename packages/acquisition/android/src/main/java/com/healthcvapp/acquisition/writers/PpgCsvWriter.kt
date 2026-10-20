/** 只负责 PPG CSV 编码、批量写入与文件句柄关闭。 */

package com.healthcvapp.acquisition.writers

import com.healthcvapp.acquisition.camera.CaptureRecord
import java.io.BufferedWriter
import java.io.Closeable
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.OutputStreamWriter

/** 供会话数据队列顺序调用的批量记录写入器。 */
interface PpgBatchWriter : Closeable {
  /** 按输入顺序追加已配对记录中的 PPG 数值，不保存批次引用。 */
  suspend fun writeBatch(records: List<CaptureRecord>)
}

/** 创建单会话 UTF-8 八列文件，不管理队列、定时器或消费者。 */
fun interface PpgBatchWriterFactory {
  /** 在给定的会话临时路径创建并写入 CSV 表头。 */
  fun open(file: File): PpgBatchWriter
}

/** 将数值记录连续编码到指定临时文件；成功会话由 CaptureSession 原子提升为完成路径。 */
class PpgCsvWriter(file: File) : PpgBatchWriter {
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

  /** 追加批次记录，保留 Double 的毫秒精度和原生交付顺序。 */
  override suspend fun writeBatch(records: List<CaptureRecord>) {
    val writer = output ?: throw IOException("PPG CSV 写入器已关闭")
    for (captureRecord in records) {
      val record = captureRecord.ppg
      val row = StringBuilder(128)
        .append(record.timestamp).append(',')
        .append(record.timestampFrame).append(',')
        .append(record.timestampSystem).append(',')
        .append(record.avgY).append(',')
        .append(record.avgU).append(',')
        .append(record.avgV).append(',')
        .append(record.frameIndex).append(',')
        .append(record.blockIndex)
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
    const val HEADER = "timestamp,timestampFrame,timestampSystem,avgY,avgU,avgV,frameIndex,blockIndex"
  }
}
