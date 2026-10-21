/** 将配对记录中的相机数值编码为既有 frame.csv 协议。 */

package com.healthcvapp.acquisition.ppg.output

import com.healthcvapp.acquisition.ppg.model.PPGCaptureRecord
import com.healthcvapp.acquisition.storage.csv.CsvRowEncoder
import java.io.IOException

/** 保留毫秒小数时间列、纳秒时长列及旧缺失值语义。 */
internal object FrameCsvEncoder : CsvRowEncoder<PPGCaptureRecord> {
  override val header = "timestamp,timestampFrame,timestampSystem,exposureTime,durationTime,rollingShutterSkewTime,iso,whiteBalanceMode"

  /** 追加相机时间与原始纳秒参数；缺少配对时间戳时拒绝编码。 */
  override fun appendRow(record: PPGCaptureRecord, destination: StringBuilder) {
    val metadata = record.metadata
    val timestampFrameNanos = metadata.timestampFrameNanos
      ?: throw IOException("已配对的相机结果缺少传感器时间戳")
    destination
      .append(metadata.timestampElapsedNanos / NANOS_PER_MILLISECOND).append(',')
      .append(timestampFrameNanos / NANOS_PER_MILLISECOND).append(',')
      .append(metadata.timestampSystemNanos / NANOS_PER_MILLISECOND).append(',')
      .append(metadata.exposureTimeNanos).append(',')
      .append(metadata.durationTimeNanos).append(',')
      .append(metadata.rollingShutterSkewTimeNanos).append(',')
      .append(metadata.iso).append(',')
      .append(metadata.whiteBalanceMode)
  }

  private const val NANOS_PER_MILLISECOND = 1_000_000.0
}
