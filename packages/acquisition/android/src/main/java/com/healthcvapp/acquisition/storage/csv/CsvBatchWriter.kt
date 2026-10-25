/** 使用行编码器将有序批次写入由 writer 接管的 UTF-8 输出流。 */

package com.healthcvapp.acquisition.storage.csv

import com.healthcvapp.acquisition.storage.AcquisitionFileStore
import java.io.BufferedWriter
import java.io.File
import java.io.IOException
import java.io.OutputStream
import java.io.OutputStreamWriter

/** 顺序写入 CSV 行，复用行缓冲并负责关闭接管的流。 */
internal class CsvBatchWriter<T>(
  outputStream: OutputStream,
  private val encoder: CsvRowEncoder<T>,
) : BatchWriter<T> {
  private var output: BufferedWriter? = BufferedWriter(OutputStreamWriter(outputStream, Charsets.UTF_8))
  private val rowBuffer = StringBuilder(128)

  init {
    val writer = checkNotNull(output)
    try {
      writer.write(encoder.header)
      writer.newLine()
      writer.flush()
    } catch (error: Throwable) {
      output = null
      try {
        writer.close()
      } catch (closeError: Throwable) {
        if (closeError !== error) error.addSuppressed(closeError)
      }
      throw error
    }
  }

  /** 按记录顺序及其行索引写入，复用一份行缓冲且不展平批次。 */
  override suspend fun writeBatch(records: List<T>) {
    val writer = output ?: throw IOException("CSV writer 已关闭")
    for (record in records) {
      val rowCount = encoder.rowCount(record)
      if (rowCount <= 0) throw IOException("CSV 记录必须至少编码一行。")
      for (rowIndex in 0 until rowCount) {
        rowBuffer.setLength(0)
        encoder.appendRow(record, rowIndex, rowBuffer)
        writer.append(rowBuffer)
        writer.newLine()
      }
    }
  }

  /** 关闭并刷新被接管的流；重复关闭为空操作。 */
  override fun close() {
    val writer = output ?: return
    output = null
    writer.close()
  }
}

/** 从拒绝覆盖的新输出构造 CSV writer。 */
internal class CsvBatchWriterFactory<T>(
  private val fileStore: AcquisitionFileStore,
  private val encoder: CsvRowEncoder<T>,
) : BatchWriterFactory<T> {
  /** 创建文件并将流所有权交给 CSV writer。 */
  override fun open(file: File): BatchWriter<T> = CsvBatchWriter(fileStore.createNewOutput(file), encoder)
}
