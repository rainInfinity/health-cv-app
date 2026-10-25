/** 按传感器类型写入既有六列协议与自然轴值。 */

package com.healthcvapp.acquisition.sensors.output

import com.healthcvapp.acquisition.sensors.model.SensorKind
import com.healthcvapp.acquisition.sensors.model.SensorSample
import com.healthcvapp.acquisition.storage.csv.CsvRowEncoder

/** 使用固定类型表头编码三种单调毫秒时间与原始三轴值。 */
internal class SensorCsvEncoder(private val kind: SensorKind) : CsvRowEncoder<SensorSample> {
  override val header: String = "timestamp,timestampEvent,timestampSystem,${kind.axisHeaders}"

  /** 每条传感器样本保持一行，不随相机 CSV 扩展行协议。 */
  override fun rowCount(record: SensorSample): Int = 1

  /** 将同一回调的三个独立时间和 X、Y、Z 值追加到复用缓冲区。 */
  override fun appendRow(record: SensorSample, rowIndex: Int, destination: StringBuilder) {
    require(rowIndex == 0)
    destination.appendMonotonicMillis(record.receivedAtElapsedNanos)
    destination.append(',')
    destination.appendMonotonicMillis(record.eventTimestampNanos)
    destination.append(',')
    destination.appendMonotonicMillis(record.systemTimestampNanos)
    destination.append(',').append(record.x)
      .append(',').append(record.y)
      .append(',').append(record.z)
  }

  /** 以最多六位小数输出纳秒值对应的毫秒，避免先转 Double 丢失小数位。 */
  private fun StringBuilder.appendMonotonicMillis(nanos: Long) {
    if (nanos < 0L) append('-')
    val wholeMillis = nanos / NANOS_PER_MILLISECOND
    append(if (wholeMillis < 0L) -wholeMillis else wholeMillis)
    val signedRemainder = nanos % NANOS_PER_MILLISECOND
    val remainder = if (signedRemainder < 0L) -signedRemainder else signedRemainder
    if (remainder == 0L) return

    append('.')
    var divisor = FRACTION_DIVISOR
    var value = remainder
    while (divisor > 0L) {
      append(('0'.code + (value / divisor).toInt()).toChar())
      value %= divisor
      divisor /= 10L
    }
    while (last() == '0') setLength(length - 1)
  }

  private companion object {
    const val NANOS_PER_MILLISECOND = 1_000_000L
    const val FRACTION_DIVISOR = 100_000L
  }
}
