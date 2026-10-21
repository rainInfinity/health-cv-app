/** 将配对记录中的 PPG 数值编码为既有八列 CSV 协议。 */

package com.healthcvapp.acquisition.ppg.output

import com.healthcvapp.acquisition.ppg.model.PPGCaptureRecord
import com.healthcvapp.acquisition.storage.csv.CsvRowEncoder

/** 直接从同一配对记录读取 PPG 数值，不复制字段集合。 */
internal object PPGCsvEncoder : CsvRowEncoder<PPGCaptureRecord> {
  override val header = "timestamp,timestampFrame,timestampSystem,avgY,avgU,avgV,frameIndex,blockIndex"

  /** 按旧列序追加 PPG 时间、像素统计和帧标识。 */
  override fun appendRow(record: PPGCaptureRecord, destination: StringBuilder) {
    val ppg = record.ppg
    destination
      .append(ppg.timestamp).append(',')
      .append(ppg.timestampFrame).append(',')
      .append(ppg.timestampSystem).append(',')
      .append(ppg.avgY).append(',')
      .append(ppg.avgU).append(',')
      .append(ppg.avgV).append(',')
      .append(ppg.frameIndex).append(',')
      .append(ppg.blockIndex)
  }
}
