/** 定义采集会话中按序消费的泛型批量写入契约。 */

package com.healthcvapp.acquisition.storage.csv

import java.io.Closeable
import java.io.File

/** 顺序写出批次记录，不保留调用方提供的批次视图。 */
internal interface BatchWriter<T> : Closeable {
  /** 按输入顺序写出本批记录。 */
  suspend fun writeBatch(records: List<T>)
}

/** 为指定临时路径创建单会话 writer。 */
internal fun interface BatchWriterFactory<T> {
  /** 打开新输出并返回接管其生命周期的 writer。 */
  fun open(file: File): BatchWriter<T>
}
