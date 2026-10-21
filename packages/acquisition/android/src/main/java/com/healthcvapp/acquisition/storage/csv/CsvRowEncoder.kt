/** 定义 CSV 表头和单行追加编码。 */

package com.healthcvapp.acquisition.storage.csv

/** 将固定格式的一条记录追加到复用的行缓冲区。 */
internal interface CsvRowEncoder<T> {
  /** 文件首行的 CSV 表头。 */
  val header: String

  /** 将记录字段追加到调用方复用的缓冲区。 */
  fun appendRow(record: T, destination: StringBuilder)
}
