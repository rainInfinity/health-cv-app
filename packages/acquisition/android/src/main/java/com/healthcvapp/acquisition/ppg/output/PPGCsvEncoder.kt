/** 将配对记录中的 PPG 数值编码为既有八列 CSV 协议。 */

package com.healthcvapp.acquisition.ppg.output

import com.healthcvapp.acquisition.ppg.model.PPGCaptureRecord
import com.healthcvapp.acquisition.storage.csv.CsvRowEncoder

/** 直接从同一配对记录读取 PPG 数值，不复制字段集合。 */
internal object PPGCsvEncoder : CsvRowEncoder<PPGCaptureRecord> {
  override val header = "timestamp,timestampFrame,timestampSystem,avgY,avgU,avgV,frameIndex,blockIndex"

  /** 一帧按冻结网格输出一行一个块。 */
  override fun rowCount(record: PPGCaptureRecord): Int = record.ppg.blockCount

  /** 按行优先块序追加共享时间、块均值和帧标识。 */
  override fun appendRow(record: PPGCaptureRecord, rowIndex: Int, destination: StringBuilder) {
    val ppg = record.ppg
    require(rowIndex in 0 until ppg.blockCount)
    destination
      .append(ppg.timestamp).append(',')
      .append(ppg.timestampFrame).append(',')
      .append(ppg.timestampSystem).append(',')
      .append(ppg.averageY(rowIndex)).append(',')
      .append(ppg.averageU(rowIndex)).append(',')
      .append(ppg.averageV(rowIndex)).append(',')
      .append(ppg.frameIndex).append(',')
      .append(rowIndex)
  }
}
