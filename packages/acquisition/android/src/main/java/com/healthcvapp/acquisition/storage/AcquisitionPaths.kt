/** 集中维护 PPG、RPPG、传感器与历史被动视频的会话路径。 */

package com.healthcvapp.acquisition.storage

import java.io.File
import java.util.UUID
import com.healthcvapp.acquisition.sensors.model.SensorKind

/** 从注入的持久根目录解析采集路径；新产物使用外部根目录，历史文件保留原位置。 */
internal class AcquisitionPaths(private val filesDirectory: File) {
  /** 返回按信号类型和会话隔离的 PPG 目录。 */
  fun ppgSessionDirectory(sessionId: String): File =
    File(File(File(filesDirectory, ACQUISITION_DIRECTORY), PPG_DIRECTORY), requirePpgSessionId(sessionId))

  /** 返回 PPG 尚未完成的 CSV 路径。 */
  fun ppgPartialFile(sessionId: String): File = File(ppgSessionDirectory(sessionId), PPG_PARTIAL_FILE)

  /** 返回 PPG 已完成的 CSV 路径。 */
  fun ppgCompletedFile(sessionId: String): File = File(ppgSessionDirectory(sessionId), PPG_COMPLETED_FILE)

  /** 返回逐帧相机元数据尚未完成的 CSV 路径。 */
  fun framePartialFile(sessionId: String): File = File(ppgSessionDirectory(sessionId), FRAME_PARTIAL_FILE)

  /** 返回逐帧相机元数据已完成的 CSV 路径。 */
  fun frameCompletedFile(sessionId: String): File = File(ppgSessionDirectory(sessionId), FRAME_COMPLETED_FILE)

  /** 返回主动 RPPG 结果根目录。 */
  fun rppgRootDirectory(): File = File(File(filesDirectory, ACQUISITION_DIRECTORY), RPPG_DIRECTORY)

  /** 返回主动 RPPG 的最终会话目录。 */
  fun rppgSessionDirectory(sessionId: String): File =
    File(rppgRootDirectory(), requireRppgSessionId(sessionId))

  /** 返回尚未发布的 RPPG 临时会话目录。 */
  fun rppgPartialSessionDirectory(sessionId: String): File {
    val safeSessionId = requireRppgSessionId(sessionId)
    return File(rppgRootDirectory(), ".$safeSessionId.tmp")
  }

  /** 返回临时会话中的波形 CSV。 */
  fun rppgPartialPulseFile(sessionId: String): File =
    File(rppgPartialSessionDirectory(sessionId), RPPG_PULSE_FILE)

  /** 返回临时会话中的心率 CSV。 */
  fun rppgPartialHeartRateFile(sessionId: String): File =
    File(rppgPartialSessionDirectory(sessionId), RPPG_HEART_RATE_FILE)

  /** 返回临时会话中的逐搏初步心率 CSV。 */
  fun rppgPartialBeatFile(sessionId: String): File =
    File(rppgPartialSessionDirectory(sessionId), RPPG_BEAT_FILE)

  /** 返回临时会话中的元信息 JSON。 */
  fun rppgPartialSessionJsonFile(sessionId: String): File =
    File(rppgPartialSessionDirectory(sessionId), RPPG_SESSION_JSON_FILE)

  /** 返回已发布会话中的波形 CSV。 */
  fun rppgPulseFile(sessionId: String): File =
    File(rppgSessionDirectory(sessionId), RPPG_PULSE_FILE)

  /** 返回已发布会话中的心率 CSV。 */
  fun rppgHeartRateFile(sessionId: String): File =
    File(rppgSessionDirectory(sessionId), RPPG_HEART_RATE_FILE)

  /** 返回已发布会话中的逐搏初步心率 CSV。 */
  fun rppgBeatFile(sessionId: String): File =
    File(rppgSessionDirectory(sessionId), RPPG_BEAT_FILE)

  /** 返回已发布会话中的元信息 JSON。 */
  fun rppgSessionJsonFile(sessionId: String): File =
    File(rppgSessionDirectory(sessionId), RPPG_SESSION_JSON_FILE)


  /** 返回被动视频产物根目录，用于扫描已有会话。 */
  fun passiveVideoRootDirectory(): File = File(filesDirectory, PASSIVE_CAPTURE_DIRECTORY)

  /** 返回被动视频会话目录；被动录像仅接受规范 UUID。 */
  fun passiveVideoSessionDirectory(sessionId: String): File =
    File(passiveVideoRootDirectory(), requirePassiveSessionId(sessionId))

  /** 返回预分配的被动视频临时路径。 */
  fun passiveVideoPartialFile(sessionId: String): File =
    File(passiveVideoSessionDirectory(sessionId), PASSIVE_VIDEO_PARTIAL_FILE)

  /** 返回被动视频完成路径。 */
  fun passiveVideoCompletedFile(sessionId: String): File =
    File(passiveVideoSessionDirectory(sessionId), PASSIVE_VIDEO_COMPLETED_FILE)
  /** 返回按类型和会话隔离的传感器目录。 */
  fun sensorSessionDirectory(kind: SensorKind, sessionId: String): File {
    require(SENSOR_SESSION_ID_PATTERN.matches(sessionId)) { "sessionId must be a safe path component" }
    return File(File(filesDirectory, ACQUISITION_DIRECTORY), "${kind.wireName}/$sessionId")
  }

  /** 返回传感器尚未完成的 CSV 路径。 */
  fun sensorPartialFile(kind: SensorKind, sessionId: String): File =
    File(sensorSessionDirectory(kind, sessionId), "${kind.wireName}.csv.part")

  /** 返回传感器已完成的 CSV 路径。 */
  fun sensorCompletedFile(kind: SensorKind, sessionId: String): File =
    File(sensorSessionDirectory(kind, sessionId), "${kind.wireName}.csv")


  /** 校验 RPPG 会话标识，避免临时或最终路径逃逸会话根目录。 */
  private fun requireRppgSessionId(sessionId: String): String {
    require(RPPG_SESSION_ID_PATTERN.matches(sessionId)) { "sessionId must be a safe path component" }
    return sessionId
  }

  /** 校验并返回符合历史主动采集规则的会话标识。 */
  private fun requirePpgSessionId(sessionId: String): String {
    require(PPG_SESSION_ID_PATTERN.matches(sessionId)) { "sessionId must be a safe path component" }
    return sessionId
  }

  /** 校验并返回符合历史被动录像规则的规范 UUID。 */
  private fun requirePassiveSessionId(sessionId: String): String {
    require(runCatching { UUID.fromString(sessionId).toString() == sessionId.lowercase() }.getOrDefault(false)) {
      "被动视频会话标识无效。"
    }
    return sessionId
  }

  private companion object {
    const val ACQUISITION_DIRECTORY = "acquisition"
    const val PPG_DIRECTORY = "ppg"
    const val RPPG_DIRECTORY = "rppg"
    const val RPPG_PULSE_FILE = "pulse.csv"
    const val RPPG_HEART_RATE_FILE = "hr.csv"
    const val RPPG_BEAT_FILE = "beat.csv"
    const val RPPG_SESSION_JSON_FILE = "session.json"
    const val PASSIVE_CAPTURE_DIRECTORY = "passive-capture"
    const val PPG_PARTIAL_FILE = "ppg.csv.part"
    const val PPG_COMPLETED_FILE = "ppg.csv"
    const val FRAME_PARTIAL_FILE = "frame.csv.part"
    const val FRAME_COMPLETED_FILE = "frame.csv"
    const val PASSIVE_VIDEO_PARTIAL_FILE = "video.mp4.part"
    const val PASSIVE_VIDEO_COMPLETED_FILE = "video.mp4"
    val PPG_SESSION_ID_PATTERN = Regex("[A-Za-z0-9_-]+")
    val SENSOR_SESSION_ID_PATTERN = Regex("[A-Za-z0-9_-]+")
    val RPPG_SESSION_ID_PATTERN = Regex("[A-Za-z0-9_-]+")
  }
}
