/** 定义 CSV 表头、每条记录行数和按行索引追加编码。 */

package com.healthcvapp.acquisition.storage.csv

/** 将一条输入记录编码为一个或多个连续 CSV 行。 */
internal interface CsvRowEncoder<T> {
  /** 文件首行的 CSV 表头。 */
  val header: String

  /** 返回当前记录必须完整写入的正数行数。 */
  fun rowCount(record: T): Int

  /** 将指定行字段追加到调用方复用的缓冲区。 */
  fun appendRow(record: T, rowIndex: Int, destination: StringBuilder)
}
