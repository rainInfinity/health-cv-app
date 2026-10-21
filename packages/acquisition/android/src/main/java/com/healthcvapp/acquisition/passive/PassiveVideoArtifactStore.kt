/** 将正常完成的视频原子发布到私有目录并从磁盘查询产物。 */

package com.healthcvapp.acquisition.passive

import android.content.Context
import android.media.MediaExtractor
import android.media.MediaFormat
import com.margelo.nitro.acquisition.PassiveCaptureArtifact
import java.io.File
import java.util.concurrent.CancellationException
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** CameraX 完成视频的私有持久化边界。 */
internal class PassiveVideoArtifactStore internal constructor(filesDirectory: File) {
  constructor(context: Context) : this(context.applicationContext.filesDir)

  private val rootDirectory = File(filesDirectory, DIRECTORY_NAME)

  /** 创建不可能覆盖其它会话的私有临时视频路径。 */
  fun createTemporaryFile(sessionId: String): File {
    requireValidSessionId(sessionId)
    val sessionDirectory = File(rootDirectory, sessionId)
    if (!sessionDirectory.mkdirs() && !sessionDirectory.isDirectory) {
      throw IllegalStateException("无法创建被动视频会话目录。")
    }
    val temporaryFile = File(sessionDirectory, TEMPORARY_FILE_NAME)
    if (temporaryFile.exists() || !temporaryFile.createNewFile()) {
      throw IllegalStateException("被动视频会话临时文件已存在，拒绝覆盖。")
    }
    return temporaryFile
  }

  /** 只发布 Finalize 成功且媒体轨可读、无音轨的实际视频。 */
  fun publish(
    sessionId: String,
    temporaryFile: File,
    claimPublication: () -> Boolean,
  ): PassiveCaptureArtifact {
    requireValidSessionId(sessionId)
    val sessionDirectory = File(rootDirectory, sessionId).canonicalFile
    val expectedTemporaryFile = File(sessionDirectory, TEMPORARY_FILE_NAME).canonicalFile
    val finalFile = File(sessionDirectory, FINAL_FILE_NAME)
    if (temporaryFile.canonicalFile != expectedTemporaryFile || !temporaryFile.isFile || temporaryFile.length() <= 0L) {
      throw IllegalStateException("被动视频临时文件缺失、为空或不属于当前会话。")
    }
    if (finalFile.exists()) throw IllegalStateException("被动视频最终路径已存在，拒绝覆盖。")

    inspect(temporaryFile)
    if (!claimPublication()) throw CancellationException("关闭先于完成视频发布。")
    if (!temporaryFile.renameTo(finalFile)) {
      throw IllegalStateException("无法将被动视频临时文件发布为完成文件。")
    }
    val media = try {
      inspect(finalFile)
    } catch (error: Throwable) {
      finalFile.delete()
      throw error
    }
    return media.toArtifact(sessionId, finalFile)
  }

  /** 删除被取消会话的临时片段，不触碰已发布视频。 */
  fun discardTemporaryFile(file: File?) {
    if (file == null) return
    val expectedRoot = rootDirectory.canonicalFile
    val canonicalFile = file.canonicalFile
    if (canonicalFile.parentFile?.parentFile == expectedRoot && canonicalFile.name == TEMPORARY_FILE_NAME) {
      canonicalFile.delete()
    }
  }

  /** 扫描完成目录并读取真实媒体信息，不依赖进程内存列表。 */
  suspend fun listArtifacts(): Array<PassiveCaptureArtifact> = withContext(Dispatchers.IO) {
    val directories = rootDirectory.listFiles()?.filter(File::isDirectory).orEmpty()
    directories.mapNotNull { directory ->
      val sessionId = directory.name
      val finalFile = File(directory, FINAL_FILE_NAME)
      if (!isValidSessionId(sessionId) || !finalFile.isFile || finalFile.length() <= 0L) return@mapNotNull null
      runCatching { inspect(finalFile).toArtifact(sessionId, finalFile) }.getOrNull()
    }.sortedBy { it.sessionId }.toTypedArray()
  }

  private fun inspect(file: File): VideoMetadata {
    val extractor = MediaExtractor()
    try {
      extractor.setDataSource(file.absolutePath)
      var videoFormat: MediaFormat? = null
      for (index in 0 until extractor.trackCount) {
        val format = extractor.getTrackFormat(index)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
        if (mime.startsWith("audio/")) throw IllegalStateException("被动视频包含不允许的音轨。")
        if (mime.startsWith("video/")) {
          if (videoFormat != null) throw IllegalStateException("被动视频包含多个视频轨。")
          videoFormat = format
        }
      }
      val format = videoFormat ?: throw IllegalStateException("被动视频没有可读取的视频轨。")
      val width = format.getInteger(MediaFormat.KEY_WIDTH)
      val height = format.getInteger(MediaFormat.KEY_HEIGHT)
      val durationMicros = format.getLong(MediaFormat.KEY_DURATION)
      if (width <= 0 || height <= 0 || durationMicros <= 0L) {
        throw IllegalStateException("被动视频媒体尺寸或时长无效。")
      }
      return VideoMetadata(width, height, durationMicros / MICROS_PER_MILLISECOND)
    } finally {
      extractor.release()
    }
  }

  private fun requireValidSessionId(sessionId: String) {
    require(isValidSessionId(sessionId)) { "被动视频会话标识无效。" }
  }

  private fun isValidSessionId(sessionId: String): Boolean =
    runCatching { UUID.fromString(sessionId).toString() == sessionId.lowercase() }.getOrDefault(false)

  private fun VideoMetadata.toArtifact(sessionId: String, file: File) = PassiveCaptureArtifact(
    sessionId = sessionId,
    path = file.absolutePath,
    sizeBytes = file.length().toDouble(),
    durationMillis = durationMillis.toDouble(),
    width = width.toDouble(),
    height = height.toDouble(),
  )

  /** 从媒体轨实际读取的尺寸与时长。 */
  private data class VideoMetadata(
    /** 视频轨编码尺寸，单位像素。 */
    val width: Int,
    /** 视频轨编码高度，单位像素。 */
    val height: Int,
    /** 视频轨实际时长，单位毫秒。 */
    val durationMillis: Long,
  )

  private companion object {
    const val DIRECTORY_NAME = "passive-capture"
    const val TEMPORARY_FILE_NAME = "video.mp4.part"
    const val FINAL_FILE_NAME = "video.mp4"
    const val MICROS_PER_MILLISECOND = 1_000L
  }
}
