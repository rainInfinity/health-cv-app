/** 集中维护主动 PPG 与被动视频的私有会话路径。 */

package com.healthcvapp.acquisition.storage

import java.io.File
import java.util.UUID

/** 从应用私有根目录解析现有采集目录与文件名。 */
internal class AcquisitionPaths(private val filesDirectory: File) {
  /** 返回主动 PPG 会话目录，保留既有 sessionId 约束。 */
  fun ppgSessionDirectory(sessionId: String): File =
    File(File(filesDirectory, ACQUISITION_DIRECTORY), requirePpgSessionId(sessionId))

  /** 返回 PPG 尚未完成的 CSV 路径。 */
  fun ppgPartialFile(sessionId: String): File = File(ppgSessionDirectory(sessionId), PPG_PARTIAL_FILE)

  /** 返回 PPG 已完成的 CSV 路径。 */
  fun ppgCompletedFile(sessionId: String): File = File(ppgSessionDirectory(sessionId), PPG_COMPLETED_FILE)

  /** 返回逐帧相机元数据尚未完成的 CSV 路径。 */
  fun framePartialFile(sessionId: String): File = File(ppgSessionDirectory(sessionId), FRAME_PARTIAL_FILE)

  /** 返回逐帧相机元数据已完成的 CSV 路径。 */
  fun frameCompletedFile(sessionId: String): File = File(ppgSessionDirectory(sessionId), FRAME_COMPLETED_FILE)

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
    const val PASSIVE_CAPTURE_DIRECTORY = "passive-capture"
    const val PPG_PARTIAL_FILE = "ppg.csv.part"
    const val PPG_COMPLETED_FILE = "ppg.csv"
    const val FRAME_PARTIAL_FILE = "frame.csv.part"
    const val FRAME_COMPLETED_FILE = "frame.csv"
    const val PASSIVE_VIDEO_PARTIAL_FILE = "video.mp4.part"
    const val PASSIVE_VIDEO_COMPLETED_FILE = "video.mp4"
    val PPG_SESSION_ID_PATTERN = Regex("[A-Za-z0-9_-]+")
  }
}
