/** 将正常完成的视频原子发布到私有目录并从磁盘查询产物。 */

package com.healthcvapp.acquisition.passive.output

import android.content.Context
import android.media.MediaExtractor
import android.media.MediaFormat
import com.healthcvapp.acquisition.storage.AcquisitionFileStore
import com.healthcvapp.acquisition.storage.AcquisitionPaths
import com.margelo.nitro.acquisition.PassiveVideoArtifact
import java.io.File
import java.io.IOException
import java.util.concurrent.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** CameraX 完成视频的私有持久化边界。 */
internal class PassiveVideoArtifactStore internal constructor(
  private val paths: AcquisitionPaths,
  private val fileStore: AcquisitionFileStore,
) {
  constructor(context: Context) : this(
    AcquisitionPaths(context.applicationContext.filesDir),
    AcquisitionFileStore(),
  )

  /** 通过共通路径与拒覆盖文件操作创建临时视频。 */
  fun createTemporaryFile(sessionId: String): File {
    val temporaryFile = paths.passiveVideoPartialFile(sessionId)
    return try {
      fileStore.createNewFile(temporaryFile)
    } catch (error: IOException) {
      throw IllegalStateException(error.message ?: "无法创建被动视频临时文件。", error)
    }
  }

  /** 只发布 Finalize 成功且媒体轨可读、无音轨的实际视频。 */
  fun publish(
    sessionId: String,
    temporaryFile: File,
    claimPublication: () -> Boolean,
  ): PassiveVideoArtifact {
    val expectedTemporaryFile = paths.passiveVideoPartialFile(sessionId).canonicalFile
    val finalFile = paths.passiveVideoCompletedFile(sessionId)
    if (temporaryFile.canonicalFile != expectedTemporaryFile || !temporaryFile.isFile || temporaryFile.length() <= 0L) {
      throw IllegalStateException("被动视频临时文件缺失、为空或不属于当前会话。")
    }
    if (finalFile.exists()) throw IllegalStateException("被动视频最终路径已存在，拒绝覆盖。")

    inspect(temporaryFile)
    if (!claimPublication()) throw CancellationException("关闭先于完成视频发布。")
    try {
      fileStore.promote(temporaryFile, finalFile)
    } catch (error: IOException) {
      throw IllegalStateException(error.message ?: "无法将被动视频临时文件发布为完成文件。", error)
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
    val canonicalFile = file.canonicalFile
    val sessionId = canonicalFile.parentFile?.name ?: return
    val expectedTemporaryFile = runCatching {
      paths.passiveVideoPartialFile(sessionId).canonicalFile
    }.getOrNull() ?: return
    if (canonicalFile == expectedTemporaryFile) canonicalFile.delete()
  }

  /** 扫描完成目录并读取真实媒体信息，不依赖进程内存列表。 */
  suspend fun listVideoArtifacts(): Array<PassiveVideoArtifact> = withContext(Dispatchers.IO) {
    val directories = paths.passiveVideoRootDirectory().listFiles()?.filter(File::isDirectory).orEmpty()
    directories.mapNotNull { directory ->
      val sessionId = directory.name
      val finalFile = runCatching {
        paths.passiveVideoCompletedFile(sessionId)
      }.getOrNull() ?: return@mapNotNull null
      if (!finalFile.isFile || finalFile.length() <= 0L) return@mapNotNull null
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


  private fun VideoMetadata.toArtifact(sessionId: String, file: File) = PassiveVideoArtifact(
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
    const val MICROS_PER_MILLISECOND = 1_000L
  }
}
