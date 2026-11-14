/** 编码 RPPG 波形和心率窗口的稳定 CSV 协议。 */

package com.healthcvapp.acquisition.rppg.output

import com.healthcvapp.acquisition.rppg.model.RPPGHeartRateWindow
import com.healthcvapp.acquisition.rppg.model.RPPGPulseSample
import com.healthcvapp.acquisition.storage.csv.CsvRowEncoder

/** 将绝对传感器时间按会话原点编码为相对毫秒波形。 */
internal class RPPGPulseCsvEncoder(
  /** 首个正式观察帧的传感器绝对时间，单位纳秒。 */
  private val sensorTimeOriginNanos: Long,
) : CsvRowEncoder<RPPGPulseSample> {
  override val header: String = "segmentIndex,sampleIndex,timeMs,value"

  /** 每条脉搏样本编码为一行。 */
  override fun rowCount(record: RPPGPulseSample): Int = 1

  /** 追加片段、序号、原点相对时间及有限幅值。 */
  override fun appendRow(record: RPPGPulseSample, rowIndex: Int, destination: StringBuilder) {
    check(rowIndex == 0)
    require(record.timestampNanos >= sensorTimeOriginNanos) { "脉搏样本早于会话时间原点。" }
    destination.append(record.segmentIndex)
      .append(',')
      .append(record.sampleIndex)
      .append(',')
    appendRelativeTimeMillis(record.timestampNanos - sensorTimeOriginNanos, destination)
    destination.append(',').append(record.value)
  }

  /** 以十进制毫秒追加相对纳秒，最多保留六位小数且不经浮点换算。 */
  private fun appendRelativeTimeMillis(relativeNanos: Long, destination: StringBuilder) {
    val wholeMillis = relativeNanos / NANOS_PER_MILLISECOND
    val fractionalNanos = relativeNanos % NANOS_PER_MILLISECOND
    destination.append(wholeMillis)
    if (fractionalNanos == 0L) return

    destination.append('.')
    var remainder = fractionalNanos
    var divisor = NANOS_PER_MILLISECOND / 10L
    val fractionalStart = destination.length
    repeat(FRACTIONAL_MILLISECOND_DIGITS) {
      destination.append(('0'.code + (remainder / divisor).toInt()).toChar())
      remainder %= divisor
      divisor /= 10L
    }
    while (destination.length > fractionalStart && destination.last() == '0') {
      destination.setLength(destination.length - 1)
    }
  }

  private companion object {
    const val NANOS_PER_MILLISECOND = 1_000_000L
    const val FRACTIONAL_MILLISECOND_DIGITS = 6
  }
}

/** 将有效及拒绝的心率窗口编码到同一 CSV 列结构。 */
internal object RPPGHeartRateCsvEncoder : CsvRowEncoder<RPPGHeartRateWindow> {
  override val header: String =
    "segmentIndex,windowStartNs,windowEndNs,heartRateBpm,valid,reason,spectralSnrDb"

  /** 每个已评估窗口编码为一行。 */
  override fun rowCount(record: RPPGHeartRateWindow): Int = 1

  /** 以十进制整数保存纳秒；不可用的数值字段保持为空。 */
  override fun appendRow(record: RPPGHeartRateWindow, rowIndex: Int, destination: StringBuilder) {
    check(rowIndex == 0)
    destination.append(record.segmentIndex)
      .append(',')
      .append(record.windowStartNanos)
      .append(',')
      .append(record.windowEndNanos)
      .append(',')
    record.heartRateBpm?.let(destination::append)
    destination.append(',').append(record.valid).append(',')
    record.reason?.let { appendCsvField(it, destination) }
    destination.append(',')
    record.spectralSnrDb?.let(destination::append)
  }

  /** 对文本原因执行 RFC 4180 必需的引号和双引号转义。 */
  private fun appendCsvField(value: String, destination: StringBuilder) {
    val needsQuoting = value.any { it == ',' || it == '"' || it == '\r' || it == '\n' }
    if (!needsQuoting) {
      destination.append(value)
      return
    }
    destination.append('"')
    value.forEach { character ->
      if (character == '"') destination.append("\"\"") else destination.append(character)
    }
    destination.append('"')
  }
}
