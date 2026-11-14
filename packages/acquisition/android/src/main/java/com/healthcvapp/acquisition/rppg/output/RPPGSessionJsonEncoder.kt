/** 编码可追溯的 RPPG 会话元信息并保留绝对纳秒精度。 */

package com.healthcvapp.acquisition.rppg.output

import com.healthcvapp.acquisition.camera.model.CameraConfig
import com.healthcvapp.acquisition.camera.model.CameraConfigSummary
import com.healthcvapp.acquisition.rppg.model.RPPGSessionDescriptor
import com.healthcvapp.acquisition.rppg.model.RPPGSessionFinalization
import com.healthcvapp.acquisition.rppg.model.RPPGSessionSampleCounts
import com.healthcvapp.acquisition.rppg.model.RPPGSegmentRange

/** 将完成状态、实际相机协商和文件范围编码为 UTF-8 JSON 文本。 */
internal object RPPGSessionJsonEncoder {
  /** 为已关闭的三件套生成最终会话元信息。 */
  fun encode(
    session: RPPGSessionDescriptor,
    finalization: RPPGSessionFinalization,
    counts: RPPGSessionSampleCounts,
    segmentRanges: List<RPPGSegmentRange>,
  ): String {
    val root = linkedMapOf<String, Any?>(
      "schemaVersion" to session.schemaVersion,
      "algorithmVersion" to session.algorithmVersion,
      "sessionId" to session.sessionId,
      "source" to session.source.wireValue,
      "sensorTimeOriginNs" to session.sensorTimeOriginNanos.toString(),
      "startedAt" to session.startedAt,
      "finishedAt" to finalization.finishedAt,
      "config" to session.config.sessionSnapshot(),
      "cameraSummary" to cameraSummaryValue(finalization.cameraSummary),
      "termination" to finalization.termination.wireValue,
      "signalStatus" to finalization.signalStatus.wireValue,
      "sampleCounts" to linkedMapOf(
        "pulseSamples" to counts.pulseSamples,
        "heartRateWindows" to counts.heartRateWindows,
        "validHeartRateWindows" to counts.validHeartRateWindows,
        "rejectedHeartRateWindows" to counts.rejectedHeartRateWindows,
      ),
      "segmentRanges" to segmentRanges.map(::segmentRangeValue),
      "complete" to true,
    )
    return buildString(1_024) {
      appendJsonValue(root, this)
      append('\n')
    }
  }

  /** 将请求、原生提交、调整及真实帧几何转换为 JSON 值。 */
  private fun cameraSummaryValue(summary: CameraConfigSummary): Map<String, Any?> = linkedMapOf(
    "cameraId" to summary.cameraId,
    "requestedConfig" to cameraConfigValue(summary.requestedConfig),
    "submittedConfig" to cameraConfigValue(summary.submittedConfig),
    "adjustments" to summary.adjustments.map { adjustment ->
      linkedMapOf(
        "field" to adjustment.field,
        "requestedValue" to adjustment.requestedValue,
        "submittedValue" to adjustment.submittedValue,
        "reason" to adjustment.reason,
      )
    },
    "actualFrame" to summary.actualFrame?.let { frame ->
      linkedMapOf(
        "width" to frame.width,
        "height" to frame.height,
        "crop" to linkedMapOf(
          "left" to frame.crop.left,
          "top" to frame.crop.top,
          "width" to frame.crop.width,
          "height" to frame.crop.height,
        ),
        "sensorOrientationDegrees" to frame.sensorOrientationDegrees,
        "mirrored" to frame.mirrored,
      )
    },
    "observedFps" to summary.observedFps,
  )

  /** 将一个相机配置展开，避免将请求值误作实际帧信息。 */
  private fun cameraConfigValue(config: CameraConfig): Map<String, Any?> = linkedMapOf(
    "cameraId" to config.cameraId,
    "targetResolution" to linkedMapOf(
      "width" to config.targetResolution.width,
      "height" to config.targetResolution.height,
    ),
    "targetFps" to config.targetFps,
    "torchEnabled" to config.torchEnabled,
    "exposure" to linkedMapOf(
      "mode" to config.exposure.mode.wireValue,
      "compensationIndex" to config.exposure.compensationIndex,
      "timeNanos" to config.exposure.timeNanos,
      "iso" to config.exposure.iso,
      "locked" to config.exposure.locked,
    ),
    "whiteBalance" to linkedMapOf(
      "mode" to config.whiteBalance.mode.wireValue,
      "locked" to config.whiteBalance.locked,
    ),
    "focus" to linkedMapOf(
      "mode" to config.focus.mode.wireValue,
      "distanceDiopters" to config.focus.distanceDiopters,
    ),
  )

  /** 将脉搏片段的样本索引和绝对采集时间范围编码为 JSON 值。 */
  private fun segmentRangeValue(range: RPPGSegmentRange): Map<String, Any> = linkedMapOf(
    "segmentIndex" to range.segmentIndex,
    "firstSampleIndex" to range.firstSampleIndex,
    "lastSampleIndex" to range.lastSampleIndex,
    "firstTimeNs" to range.firstTimestampNanos.toString(),
    "lastTimeNs" to range.lastTimestampNanos.toString(),
    "sampleCount" to range.sampleCount,
  )

  /** 递归追加 JSON 支持的基础值、对象与数组。 */
  private fun appendJsonValue(value: Any?, destination: StringBuilder) {
    when (value) {
      null -> destination.append("null")
      is String -> appendJsonString(value, destination)
      is Boolean -> destination.append(value)
      is Double -> {
        require(value.isFinite()) { "JSON 不允许非有限浮点数。" }
        destination.append(value)
      }
      is Float -> {
        require(value.isFinite()) { "JSON 不允许非有限浮点数。" }
        destination.append(value)
      }
      is Number -> destination.append(value)
      is Map<*, *> -> appendJsonObject(value, destination)
      is Iterable<*> -> appendJsonArray(value, destination)
      else -> throw IllegalArgumentException("不支持的 JSON 值类型：${value::class.java.name}")
    }
  }

  /** 递归追加具有字符串键的 JSON 对象。 */
  private fun appendJsonObject(value: Map<*, *>, destination: StringBuilder) {
    destination.append('{')
    var first = true
    value.forEach { (key, child) ->
      val stringKey = key as? String ?: throw IllegalArgumentException("JSON 对象键必须为字符串。")
      if (!first) destination.append(',')
      first = false
      appendJsonString(stringKey, destination)
      destination.append(':')
      appendJsonValue(child, destination)
    }
    destination.append('}')
  }

  /** 递归追加 JSON 数组。 */
  private fun appendJsonArray(value: Iterable<*>, destination: StringBuilder) {
    destination.append('[')
    var first = true
    value.forEach { child ->
      if (!first) destination.append(',')
      first = false
      appendJsonValue(child, destination)
    }
    destination.append(']')
  }

  /** 按 JSON 规则转义引号、反斜杠和控制字符。 */
  private fun appendJsonString(value: String, destination: StringBuilder) {
    destination.append('"')
    value.forEach { character ->
      when (character) {
        '"' -> destination.append("\\\"")
        '\\' -> destination.append("\\\\")
        '\b' -> destination.append("\\b")
        '\u000c' -> destination.append("\\f")
        '\n' -> destination.append("\\n")
        '\r' -> destination.append("\\r")
        '\t' -> destination.append("\\t")
        else -> if (character.code < 0x20) {
          destination.append("\\u00")
          destination.append(HEX_DIGITS[character.code ushr 4])
          destination.append(HEX_DIGITS[character.code and 0x0f])
        } else {
          destination.append(character)
        }
      }
    }
    destination.append('"')
  }

  private const val HEX_DIGITS = "0123456789abcdef"
}
